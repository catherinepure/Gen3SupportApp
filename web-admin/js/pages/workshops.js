/** Workshops Page */
const WorkshopsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let distributorsList = [];

    const COUNTRIES = ['US', 'GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'PL'];

    async function load() {
        try {
            $('#workshops-content').innerHTML = Utils.loading();

            // Load workshops and distributors in parallel
            const [workshopsResult, distributorsResult] = await Promise.all([
                API.call('workshops', 'list', { limit: 100 }),
                API.call('distributors', 'list', { limit: 100 })
            ]);

            currentData = workshopsResult.workshops || workshopsResult.data || [];
            distributorsList = distributorsResult.distributors || distributorsResult.data || [];

            TableComponent.render('#workshops-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'activation_code_hash', label: 'Code Status', format: (val, row) => {
                    if (val) return '<span class="badge badge-success">Encrypted</span>';
                    if (row.activation_code) return '<span class="badge badge-warning">Legacy</span>';
                    return '<span class="badge badge-inactive">None</span>';
                }},
                { key: 'service_area_countries', label: 'Service Areas', format: (val) => Array.isArray(val) ? val.join(', ') : val || 'N/A' },
                { key: 'parent_distributor_id', label: 'Parent Distributor', format: (val) => val ? 'Linked' : 'Independent' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showWorkshopDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#workshops-content').innerHTML = Utils.errorState('Failed to load workshops');
        }
    }

    async function showWorkshopDetail(workshop) {
        try {
            const result = await API.call('workshops', 'get', { id: workshop.id });
            const w = result.workshop;
            const addresses = result.addresses || [];
            const staff = result.staff || [];
            const activeJobCount = result.active_job_count || 0;

            let html = '<div class="detail-grid">';

            html += '<div class="detail-section">';
            html += '<h4>Workshop Information</h4>';
            html += `<p><strong>Name:</strong> ${w.name}</p>`;
            html += `<p><strong>Email:</strong> ${w.email || 'N/A'}</p>`;
            html += `<p><strong>Phone:</strong> ${w.phone || 'N/A'}</p>`;
            html += `<p><strong>Status:</strong> ${w.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
            html += `<p><strong>Type:</strong> ${w.parent_distributor_id ? 'Linked to Distributor' : 'Independent'}</p>`;
            html += '</div>';

            // Activation Code
            html += '<div class="detail-section">';
            html += '<h4>Activation Code</h4>';
            if (w.activation_code_hash) {
                html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-success">Secured</span></p>';
                html += '<p class="text-muted" style="font-size: 0.9em;">Activation code is encrypted for security. Use "Regenerate Code" button below to create a new one.</p>';
                if (w.activation_code_created_at) {
                    html += `<p class="text-muted"><strong>Created:</strong> ${formatDate(w.activation_code_created_at)}</p>`;
                }
                if (w.activation_code_expires_at) {
                    const expires = new Date(w.activation_code_expires_at);
                    const isExpired = expires < new Date();
                    html += `<p class="text-muted"><strong>Expires:</strong> ${formatDate(w.activation_code_expires_at)} `;
                    if (isExpired) {
                        html += '<span class="badge badge-danger">Expired - Regenerate Required</span>';
                    } else {
                        html += '<span class="badge badge-success">Valid</span>';
                    }
                    html += '</p>';
                }
            } else if (w.activation_code) {
                // Legacy plaintext code (during migration)
                html += `<p><strong>Code:</strong> <code style="font-size: 1.2em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">${w.activation_code}</code></p>`;
                html += '<p class="text-warning" style="font-size: 0.9em; margin-top: 10px;">⚠️ Legacy plaintext code - click "Regenerate Code" below for enhanced security</p>';
            } else {
                html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-inactive">No Code</span></p>';
                html += '<p class="text-muted" style="font-size: 0.9em;">Click "Regenerate Code" below to create an activation code.</p>';
            }
            html += '</div>';

            if (w.parent_distributor_id) {
                const parentDist = distributorsList.find(d => d.id === w.parent_distributor_id);
                html += '<div class="detail-section">';
                html += '<h4>Parent Distributor</h4>';
                html += `<p><strong>Name:</strong> ${w.distributors?.name || parentDist?.name || 'Unknown'}</p>`;
                html += '</div>';
            }

            html += '<div class="detail-section">';
            html += '<h4>Service Coverage</h4>';
            if (w.service_area_countries && w.service_area_countries.length > 0) {
                html += '<p><strong>Countries:</strong></p><ul>';
                w.service_area_countries.forEach(country => {
                    html += `<li>${country}</li>`;
                });
                html += '</ul>';
            } else {
                html += '<p class="text-muted">No service areas defined</p>';
            }
            html += '</div>';

            html += '<div class="detail-section">';
            html += '<h4>Statistics</h4>';
            html += `<p><strong>Staff Members:</strong> ${staff.length}</p>`;
            html += `<p><strong>Active Service Jobs:</strong> ${activeJobCount}</p>`;
            html += '</div>';

            if (staff.length > 0) {
                html += '<div class="detail-section">';
                html += '<h4>Staff</h4>';
                staff.forEach(s => {
                    html += `<p>${s.first_name || ''} ${s.last_name || ''} (${s.email}) ${s.is_active ? '✓' : '✗'}</p>`;
                });
                html += '</div>';
            }

            if (addresses.length > 0) {
                html += '<div class="detail-section">';
                html += '<h4>Addresses</h4>';
                addresses.forEach(addr => {
                    html += `<p><strong>${addr.address_type}:</strong></p>`;
                    html += `<p>${addr.street_address}</p>`;
                    html += `<p>${addr.city}, ${addr.postcode}</p>`;
                    html += `<p>${addr.country}</p>`;
                });
                html += '</div>';
            }

            html += '<div class="detail-section">';
            html += '<h4>Timestamps</h4>';
            html += `<p><strong>Created:</strong> ${formatDate(w.created_at)}</p>`;
            html += `<p><strong>Updated:</strong> ${formatDate(w.updated_at)}</p>`;
            html += '</div>';

            html += '</div>';

            // Add action buttons
            const actions = [
                {
                    label: 'Edit Workshop',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editWorkshop(w), 100);
                    }
                },
                {
                    label: 'Regenerate Code',
                    class: 'btn-warning',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => regenerateActivationCode(w), 100);
                    }
                }
            ];

            if (w.is_active) {
                actions.push({
                    label: 'Deactivate',
                    class: 'btn-danger',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => deactivateWorkshop(w), 100);
                    }
                });
            } else {
                actions.push({
                    label: 'Reactivate',
                    class: 'btn-success',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => reactivateWorkshop(w), 100);
                    }
                });
            }

            ModalComponent.show('Workshop Detail', html, actions);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function createWorkshop() {
        const fields = [
            { name: 'name', label: 'Workshop Name *', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone', type: 'text' },
            {
                name: 'parent_distributor_id',
                label: 'Parent Distributor (optional)',
                type: 'select',
                options: [
                    { value: '', label: '-- Independent Workshop --' },
                    ...distributorsList.map(d => ({ value: d.id, label: d.name }))
                ]
            },
            {
                name: 'service_area_countries',
                label: 'Service Area Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                options: COUNTRIES.map(c => ({ value: c, label: c }))
            }
        ];

        FormComponent.show('Create Workshop', fields, async (formData) => {
            try {
                // Convert empty string to null for parent_distributor_id
                if (!formData.parent_distributor_id) {
                    formData.parent_distributor_id = null;
                }

                // Convert service_area_countries from select values to array
                const countries = formData.service_area_countries ?
                    (Array.isArray(formData.service_area_countries) ? formData.service_area_countries : [formData.service_area_countries]) : [];

                const result = await API.call('workshops', 'create', {
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    parent_distributor_id: formData.parent_distributor_id,
                    service_area_countries: countries
                });

                toast('Workshop created successfully', 'success');
                ModalComponent.close();

                // Show activation code
                const activationCode = result.activation_code || result.workshop?.activation_code;
                if (activationCode) {
                    setTimeout(() => {
                        ModalComponent.show('Activation Code Generated',
                            `<div style="text-align: center;">
                                <p>Workshop created successfully!</p>
                                <p style="margin: 20px 0;"><strong>Activation Code:</strong></p>
                                <p><code style="font-size: 1.5em; background: #f0f0f0; padding: 15px 20px; border-radius: 4px; display: inline-block;">${activationCode}</code></p>
                                <p class="text-muted" style="margin-top: 20px;">Save this code - it's needed for workshop registration.</p>
                            </div>`);
                    }, 300);
                }

                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function editWorkshop(workshop) {
        const fields = [
            { name: 'name', label: 'Workshop Name *', type: 'text', required: true, value: workshop.name },
            { name: 'email', label: 'Email', type: 'email', value: workshop.email || '' },
            { name: 'phone', label: 'Phone', type: 'text', value: workshop.phone || '' },
            {
                name: 'parent_distributor_id',
                label: 'Parent Distributor (optional)',
                type: 'select',
                value: workshop.parent_distributor_id || '',
                options: [
                    { value: '', label: '-- Independent Workshop --' },
                    ...distributorsList.map(d => ({ value: d.id, label: d.name }))
                ]
            },
            {
                name: 'service_area_countries',
                label: 'Service Area Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                value: workshop.service_area_countries || [],
                options: COUNTRIES.map(c => ({ value: c, label: c }))
            }
        ];

        FormComponent.show('Edit Workshop', fields, async (formData) => {
            try {
                // Convert empty string to null for parent_distributor_id
                if (!formData.parent_distributor_id) {
                    formData.parent_distributor_id = null;
                }

                // Convert service_area_countries from select values to array
                const countries = formData.service_area_countries ?
                    (Array.isArray(formData.service_area_countries) ? formData.service_area_countries : [formData.service_area_countries]) : [];

                await API.call('workshops', 'update', {
                    id: workshop.id,
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    parent_distributor_id: formData.parent_distributor_id,
                    service_area_countries: countries,
                    is_active: workshop.is_active
                });
                toast('Workshop updated successfully', 'success');
                ModalComponent.close();
                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    async function deactivateWorkshop(workshop) {
        if (!confirm(`Are you sure you want to deactivate "${workshop.name}"?`)) {
            return;
        }

        try {
            await API.call('workshops', 'update', {
                id: workshop.id,
                is_active: false
            });
            toast('Workshop deactivated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function reactivateWorkshop(workshop) {
        try {
            await API.call('workshops', 'update', {
                id: workshop.id,
                is_active: true
            });
            toast('Workshop reactivated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function regenerateActivationCode(workshop) {
        if (!confirm(`Generate a new activation code for "${workshop.name}"? The old code will be invalidated immediately.`)) {
            return;
        }

        try {
            const result = await API.call('workshops', 'regenerate-code', { id: workshop.id });

            // Show new code in modal (ONE TIME)
            ModalComponent.show('New Activation Code Generated',
                `<div style="text-align: center;">
                    <p>The new activation code for <strong>${workshop.name}</strong> is:</p>
                    <p style="margin: 20px 0;"><code style="font-size: 1.8em; background: #fff3cd; padding: 20px 30px; border-radius: 8px; display: inline-block; border: 2px solid #ffc107;">${result.activation_code}</code></p>
                    <p class="text-danger" style="margin-top: 20px; font-weight: bold;">⚠️ Save this code immediately!</p>
                    <p class="text-muted">This code cannot be retrieved later and will expire in 90 days.</p>
                </div>`);

            toast('Activation code regenerated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function init() {
        $('#workshops-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'workshops.csv'));
        $('#workshops-create-btn')?.addEventListener('click', createWorkshop);
    }

    return { init, onNavigate: load };
})();
