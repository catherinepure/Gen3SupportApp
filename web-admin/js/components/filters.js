/**
 * Filters Component
 * Advanced filtering UI for data tables
 */

const FiltersComponent = (() => {
    const { $, debounce } = Utils;

    function render(containerId, filters, onChange) {
        const container = $(containerId);
        if (!container) return;

        let html = '<div class="filters-bar">';

        filters.forEach(filter => {
            html += renderFilter(filter);
        });

        html += `<button class="btn btn-secondary btn-sm" id="clear-filters-btn">Clear Filters</button>`;
        html += '</div>';

        container.innerHTML = html;

        // Attach event listeners
        attachListeners(container, filters, onChange);
    }

    function renderFilter(filter) {
        const { name, label, type = 'text', options = [], placeholder = '' } = filter;

        let html = '<div class="filter-field">';

        switch (type) {
            case 'search':
                html += `<input type="text"
                        class="filter-input"
                        id="filter-${name}"
                        name="${name}"
                        placeholder="${placeholder || `Search ${label}...`}">`;
                break;

            case 'select':
                html += `<select class="filter-select" id="filter-${name}" name="${name}">`;
                html += `<option value="">All ${label}</option>`;
                options.forEach(opt => {
                    html += `<option value="${opt.value}">${opt.label}</option>`;
                });
                html += '</select>';
                break;

            case 'multiselect':
                html += `<div class="filter-multiselect">`;
                html += `<button class="filter-multiselect-btn" type="button">${label} ▼</button>`;
                html += `<div class="filter-multiselect-dropdown hidden">`;
                options.forEach(opt => {
                    html += `<label class="checkbox-label">
                            <input type="checkbox" name="${name}" value="${opt.value}">
                            ${opt.label}
                            </label>`;
                });
                html += '</div></div>';
                break;

            case 'date-range':
                html += `<input type="date"
                        class="filter-input filter-input-sm"
                        id="filter-${name}-from"
                        name="${name}_from"
                        placeholder="From">`;
                html += `<input type="date"
                        class="filter-input filter-input-sm"
                        id="filter-${name}-to"
                        name="${name}_to"
                        placeholder="To">`;
                break;

            case 'boolean':
                html += `<select class="filter-select" id="filter-${name}" name="${name}">`;
                html += `<option value="">All</option>`;
                html += `<option value="true">Yes</option>`;
                html += `<option value="false">No</option>`;
                html += '</select>';
                break;
        }

        html += '</div>';

        return html;
    }

    function attachListeners(container, filters, onChange) {
        // Search inputs with debounce
        container.querySelectorAll('.filter-input').forEach(input => {
            input.addEventListener('input', debounce(() => {
                onChange(collectFilterValues(container, filters));
            }, 300));
        });

        // Select dropdowns
        container.querySelectorAll('.filter-select').forEach(select => {
            select.addEventListener('change', () => {
                onChange(collectFilterValues(container, filters));
            });
        });

        // Multiselect checkboxes
        container.querySelectorAll('.filter-multiselect input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                onChange(collectFilterValues(container, filters));
            });
        });

        // Multiselect toggle
        container.querySelectorAll('.filter-multiselect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const dropdown = btn.nextElementSibling;
                dropdown.classList.toggle('hidden');
            });
        });

        // Clear filters button
        const clearBtn = container.querySelector('#clear-filters-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearFilters(container);
                onChange({});
            });
        }

        // Close multiselect dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.filter-multiselect')) {
                container.querySelectorAll('.filter-multiselect-dropdown').forEach(dropdown => {
                    dropdown.classList.add('hidden');
                });
            }
        });
    }

    function collectFilterValues(container, filters) {
        const values = {};

        filters.forEach(filter => {
            const { name, type } = filter;

            if (type === 'multiselect') {
                const checked = container.querySelectorAll(`input[name="${name}"]:checked`);
                const selectedValues = Array.from(checked).map(cb => cb.value);
                if (selectedValues.length > 0) {
                    values[name] = selectedValues;
                }
            } else if (type === 'date-range') {
                const from = container.querySelector(`#filter-${name}-from`)?.value;
                const to = container.querySelector(`#filter-${name}-to`)?.value;
                if (from) values[`${name}_from`] = from;
                if (to) values[`${name}_to`] = to;
            } else {
                const input = container.querySelector(`#filter-${name}`);
                const value = input?.value;
                if (value) {
                    values[name] = type === 'boolean' ? value === 'true' : value;
                }
            }
        });

        return values;
    }

    function clearFilters(container) {
        // Clear text inputs
        container.querySelectorAll('.filter-input').forEach(input => {
            input.value = '';
        });

        // Reset selects
        container.querySelectorAll('.filter-select').forEach(select => {
            select.selectedIndex = 0;
        });

        // Uncheck checkboxes
        container.querySelectorAll('.filter-multiselect input[type="checkbox"]').forEach(cb => {
            cb.checked = false;
        });
    }

    return {
        render
    };
})();
