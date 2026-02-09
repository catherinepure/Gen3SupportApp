/**
 * Form Component
 * Reusable form builder with validation
 */

const FormComponent = (() => {
    const { toast } = Utils;

    function show(title, fields, onSubmit, options = {}) {
        let html = '<form id="dynamic-form" class="form-grid">';

        fields.forEach(field => {
            html += renderField(field);
        });

        html += `
            <div class="form-actions" style="grid-column: 1 / -1; margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary" id="form-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary">${options.submitLabel || 'Save'}</button>
            </div>
        </form>`;

        ModalComponent.show(title, html);

        // Set up form handling
        setTimeout(() => {
            setupFormHandlers(fields, onSubmit);
        }, 0);
    }

    function renderField(field) {
        const {
            name,
            label,
            type = 'text',
            value = '',
            required = false,
            placeholder = '',
            options = [],
            disabled = false,
            help = ''
        } = field;

        let html = `<div class="form-field">`;
        html += `<label for="field-${name}">${label}${required ? ' *' : ''}</label>`;

        switch (type) {
            case 'text':
            case 'email':
            case 'number':
            case 'date':
            case 'password':
                html += `<input type="${type}"
                        id="field-${name}"
                        name="${name}"
                        value="${value}"
                        placeholder="${placeholder}"
                        ${required ? 'required' : ''}
                        ${disabled ? 'disabled' : ''}>`;
                break;

            case 'textarea':
                html += `<textarea id="field-${name}"
                        name="${name}"
                        rows="4"
                        placeholder="${placeholder}"
                        ${required ? 'required' : ''}
                        ${disabled ? 'disabled' : ''}>${value}</textarea>`;
                break;

            case 'select':
                const isMultiple = field.multiple === true;
                html += `<select id="field-${name}"
                        name="${name}"
                        ${isMultiple ? 'multiple size="8"' : ''}
                        ${required ? 'required' : ''}
                        ${disabled ? 'disabled' : ''}>`;

                // Don't show "-- Select --" for multi-select
                if (!isMultiple) {
                    html += `<option value="">-- Select --</option>`;
                }

                options.forEach(opt => {
                    let selected = false;
                    if (isMultiple) {
                        // For multi-select, value should be an array
                        selected = Array.isArray(value) && value.includes(opt.value);
                    } else {
                        // For single select, direct comparison
                        selected = opt.value === value;
                    }
                    html += `<option value="${opt.value}" ${selected ? 'selected' : ''}>${opt.label}</option>`;
                });
                html += '</select>';
                break;

            case 'checkbox':
                html += `<label class="checkbox-label">
                        <input type="checkbox"
                               id="field-${name}"
                               name="${name}"
                               ${value ? 'checked' : ''}
                               ${disabled ? 'disabled' : ''}>
                        ${help}
                        </label>`;
                break;

            case 'radio':
                options.forEach(opt => {
                    const checked = opt.value === value ? 'checked' : '';
                    html += `<label class="radio-label">
                            <input type="radio"
                                   name="${name}"
                                   value="${opt.value}"
                                   ${checked}
                                   ${disabled ? 'disabled' : ''}>
                            ${opt.label}
                            </label>`;
                });
                break;

            case 'multiselect':
                html += `<div class="multiselect">`;
                options.forEach(opt => {
                    const checked = Array.isArray(value) && value.includes(opt.value) ? 'checked' : '';
                    html += `<label class="checkbox-label">
                            <input type="checkbox"
                                   name="${name}[]"
                                   value="${opt.value}"
                                   ${checked}
                                   ${disabled ? 'disabled' : ''}>
                            ${opt.label}
                            </label>`;
                });
                html += `</div>`;
                break;

            case 'file':
                html += `<input type="file"
                        id="field-${name}"
                        name="${name}"
                        ${field.accept ? `accept="${field.accept}"` : ''}
                        ${field.multiple ? 'multiple' : ''}
                        ${required ? 'required' : ''}
                        ${disabled ? 'disabled' : ''}>`;
                break;
        }

        if (help && type !== 'checkbox') {
            html += `<small class="form-help">${help}</small>`;
        }

        html += '</div>';

        return html;
    }

    function setupFormHandlers(fields, onSubmit) {
        const form = document.getElementById('dynamic-form');
        const cancelBtn = document.getElementById('form-cancel-btn');

        if (!form) return;

        // Cancel button
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                ModalComponent.hide();
            });
        }

        // Form submission
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Collect form data
            const formData = {};

            fields.forEach(field => {
                const { name, type } = field;

                if (type === 'checkbox') {
                    const input = form.querySelector(`[name="${name}"]`);
                    formData[name] = input?.checked || false;
                } else if (type === 'multiselect') {
                    const checkboxes = form.querySelectorAll(`[name="${name}[]"]:checked`);
                    formData[name] = Array.from(checkboxes).map(cb => cb.value);
                } else if (type === 'select' && field.multiple) {
                    // Handle HTML5 multi-select
                    const select = form.querySelector(`[name="${name}"]`);
                    if (select) {
                        const selectedOptions = Array.from(select.selectedOptions);
                        formData[name] = selectedOptions.map(opt => opt.value);
                    } else {
                        formData[name] = [];
                    }
                } else if (type === 'file') {
                    const input = form.querySelector(`[name="${name}"]`);
                    formData[name] = input?.files || null;
                } else {
                    const input = form.querySelector(`[name="${name}"]`);
                    formData[name] = input?.value || '';
                }
            });

            // Disable submit button
            const submitBtn = form.querySelector('[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Saving...';
            }

            try {
                await onSubmit(formData);
                ModalComponent.hide();
            } catch (err) {
                toast(err.message, 'error');

                // Re-enable submit button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Save';
                }
            }
        });
    }

    return {
        show
    };
})();
