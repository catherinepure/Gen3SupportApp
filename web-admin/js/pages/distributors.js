/** Distributors Page */
const DistributorsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    const COUNTRIES = [
        'GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH',
        'US', 'IE', 'PT', 'SE', 'DK', 'NO', 'PL'
    ];

    async function load() {
        try {
            $('#distributors-content').innerHTML = Utils.loading();
            const result = await API.call('distributors', 'list', { limit: 100 });
            currentData = result.distributors || [];

            TableComponent.render('#distributors-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'activation_code_hash', label: 'Code Status', format: (val, row) => {
                    if (val) return '<span class="badge badge-success">Encrypted</span>';
                    if (row.activation_code) return '<span class="badge badge-warning">Legacy</span>';
                    return '<span class="badge badge-inactive">None</span>';
                }},
                { key: 'countries', label: 'Countries', format: (arr) => arr && arr.length > 0 ? arr.join(', ') : 'None' },
                { key: 'phone', label: 'Phone', format: (val) => val || 'N/A' },
                { key: 'email', label: 'Email', format: (val) => val || 'N/A' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showDistributorDetail,
                actions: [
                    { name: 'edit', label: 'Edit', className: 'btn-sm btn-primary', handler: editDistributor },
                    { name: 'deactivate', label: 'Deactivate', className: 'btn-sm btn-danger', handler: deactivateDistributor, shouldShow: (d) => d.is_active },
                    { name: 'reactivate', label: 'Reactivate', className: 'btn-sm btn-success', handler: reactivateDistributor, shouldShow: (d) => !d.is_active }
                ]
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#distributors-content').innerHTML = Utils.errorState('Failed to load distributors');
        }
    }

    async function showDistributorDetail(distributor) {
        try {
            const result = await API.call('distributors', 'get', { id: distributor.id });
            const d = result.distributor;
            const addresses = result.addresses || [];
            const workshops = result.workshops || [];
            const staffCount = result.staff_count || 0;
            const scooterCount = result.scooter_count || 0;

            let html = '<div class="detail-grid">';

            // Basic Info
            html += '<div class="detail-section">';
            html += '<h4>Distributor Information</h4>';
            html += `<p><strong>Name:</strong> ${d.name}</p>`;
            html += `<p><strong>Email:</strong> ${d.email || 'N/A'}</p>`;
            html += `<p><strong>Phone:</strong> ${d.phone || 'N/A'}</p>`;
            html += `<p><strong>Status:</strong> ${d.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
            html += '</div>';

            // Activation Code
            html += '<div class="detail-section">';
            html += '<h4>Activation Code</h4>';
            if (d.activation_code_hash) {
                html += '<p class="text-muted">Activation code is encrypted and cannot be displayed.</p>';
                if (d.activation_code_created_at) {
                    html += `<p class="text-muted"><strong>Created:</strong> ${formatDate(d.activation_code_created_at)}</p>`;
                }
                if (d.activation_code_expires_at) {
                    const expires = new Date(d.activation_code_expires_at);
                    const isExpired = expires < new Date();
                    html += `<p class="text-muted"><strong>Expires:</strong> ${formatDate(d.activation_code_expires_at)} `;
                    if (isExpired) {
                        html += '<span class="badge badge-danger">Expired</span>';
                    }
                    html += '</p>';
                }
            } else if (d.activation_code) {
                // Legacy plaintext code (during migration)
                html += `<p><code style="font-size: 1.2em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">${d.activation_code}</code></p>`;
                html += '<p class="text-warning" style="font-size: 0.9em;">⚠️ Legacy plaintext code - regenerate for security</p>';
            } else {
                html += '<p class="text-muted">No activation code</p>';
            }
            html += '</div>';

            // Territory
            html += '<div class="detail-section">';
            html += '<h4>Territory Coverage</h4>';
            if (d.countries && d.countries.length > 0) {
                html += '<p><strong>Countries:</strong></p><ul>';
                d.countries.forEach(country => {
                    html += `<li>${country}</li>`;
                });
                html += '</ul>';
            } else {
                html += '<p class="text-muted">No countries assigned</p>';
            }
            html += '</div>';

            // Stats
            html += '<div class="detail-section">';
            html += '<h4>Statistics</h4>';
            html += `<p><strong>Staff Members:</strong> ${staffCount}</p>`;
            html += `<p><strong>Scooters:</strong> ${scooterCount}</p>`;
            html += `<p><strong>Workshops:</strong> ${workshops.length}</p>`;
            html += '</div>';

            // Workshops
            if (workshops.length > 0) {
                html += '<div class="detail-section full-width">';
                html += '<h4>Workshops</h4>';
                html += '<ul>';
                workshops.forEach(w => {
                    const status = w.is_active ? '✓' : '✗';
                    html += `<li>${status} ${w.name} (${w.email || 'no email'})</li>`;
                });
                html += '</ul>';
                html += '</div>';
            }

            // Addresses
            if (addresses.length > 0) {
                html += '<div class="detail-section full-width">';
                html += '<h4>Addresses</h4>';
                addresses.forEach(addr => {
                    html += '<div style="margin-bottom: 10px; padding: 10px; background: #f9f9f9; border-radius: 4px;">';
                    html += `<p><strong>${addr.label || 'Address'}:</strong></p>`;
                    html += `<p>${addr.street_line1}</p>`;
                    if (addr.street_line2) html += `<p>${addr.street_line2}</p>`;
                    html += `<p>${addr.city}, ${addr.postcode}</p>`;
                    html += `<p>${addr.country}</p>`;
                    html += '</div>';
                });
                html += '</div>';
            }

            // Timestamps
            html += '<div class="detail-section">';
            html += '<h4>Timestamps</h4>';
            html += `<p><strong>Created:</strong> ${formatDate(d.created_at)}</p>`;
            html += `<p><strong>Updated:</strong> ${formatDate(d.updated_at)}</p>`;
            html += '</div>';

            html += '</div>';

            // Add action buttons
            const actions = [
                {
                    label: 'Edit Distributor',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editDistributor(d), 100);
                    }
                },
                {
                    label: 'Regenerate Code',
                    class: 'btn-warning',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => regenerateActivationCode(d), 100);
                    }
                }
            ];

            if (d.is_active) {
                actions.push({
                    label: 'Deactivate',
                    class: 'btn-danger',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => deactivateDistributor(d), 100);
                    }
                });
            } else {
                actions.push({
                    label: 'Reactivate',
                    class: 'btn-success',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => reactivateDistributor(d), 100);
                    }
                });
            }

            ModalComponent.show('Distributor Detail', html, actions);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function createDistributor() {
        const fields = [
            { name: 'name', label: 'Distributor Name *', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone', type: 'text' },
            {
                name: 'countries',
                label: 'Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                options: COUNTRIES.map(c => ({ value: c, label: c }))
            }
        ];

        FormComponent.show('Create Distributor', fields, async (formData) => {
            try {
                // Convert countries from select values to array
                const countries = formData.countries ?
                    (Array.isArray(formData.countries) ? formData.countries : [formData.countries]) : [];

                const result = await API.call('distributors', 'create', {
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    countries: countries
                });

                toast('Distributor created successfully', 'success');
                ModalComponent.close();

                // Show activation code
                const activationCode = result.distributor.activation_code;
                setTimeout(() => {
                    ModalComponent.show('Activation Code Generated',
                        `<div style="text-align: center;">
                            <p>Distributor created successfully!</p>
                            <p style="margin: 20px 0;"><strong>Activation Code:</strong></p>
                            <p><code style="font-size: 1.5em; background: #f0f0f0; padding: 15px 20px; border-radius: 4px; display: inline-block;">${activationCode}</code></p>
                            <p class="text-muted" style="margin-top: 20px;">Save this code - it's needed for distributor registration.</p>
                        </div>`);
                }, 300);

                load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function editDistributor(distributor) {
        const fields = [
            { name: 'name', label: 'Distributor Name *', type: 'text', required: true, value: distributor.name },
            { name: 'email', label: 'Email', type: 'email', value: distributor.email || '' },
            { name: 'phone', label: 'Phone', type: 'text', value: distributor.phone || '' },
            {
                name: 'countries',
                label: 'Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                options: COUNTRIES.map(c => ({ value: c, label: c })),
                value: distributor.countries || []
            },
            {
                name: 'is_active',
                label: 'Status',
                type: 'select',
                options: [
                    { value: 'true', label: 'Active' },
                    { value: 'false', label: 'Inactive' }
                ],
                value: String(distributor.is_active)
            }
        ];

        FormComponent.show('Edit Distributor', fields, async (formData) => {
            try {
                // Convert countries from select values to array
                const countries = formData.countries ?
                    (Array.isArray(formData.countries) ? formData.countries : [formData.countries]) : [];

                await API.call('distributors', 'update', {
                    id: distributor.id,
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    countries: countries,
                    is_active: formData.is_active === 'true'
                });

                toast('Distributor updated successfully', 'success');
                ModalComponent.close();
                load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    async function deactivateDistributor(distributor) {
        if (!confirm(`Deactivate distributor "${distributor.name}"? Their staff will no longer be able to access the system.`)) {
            return;
        }

        try {
            await API.call('distributors', 'update', {
                id: distributor.id,
                is_active: false
            });
            toast('Distributor deactivated', 'success');
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function reactivateDistributor(distributor) {
        if (!confirm(`Reactivate distributor "${distributor.name}"?`)) {
            return;
        }

        try {
            await API.call('distributors', 'update', {
                id: distributor.id,
                is_active: true
            });
            toast('Distributor reactivated', 'success');
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function regenerateActivationCode(distributor) {
        if (!confirm(`Generate a new activation code for "${distributor.name}"? The old code will be invalidated immediately.`)) {
            return;
        }

        try {
            const result = await API.call('distributors', 'regenerate-code', { id: distributor.id });

            // Show new code in modal (ONE TIME)
            ModalComponent.show('New Activation Code Generated',
                `<div style="text-align: center;">
                    <p>The new activation code for <strong>${distributor.name}</strong> is:</p>
                    <p style="margin: 20px 0;"><code style="font-size: 1.8em; background: #fff3cd; padding: 20px 30px; border-radius: 8px; display: inline-block; border: 2px solid #ffc107;">${result.activation_code}</code></p>
                    <p class="text-danger" style="margin-top: 20px; font-weight: bold;">⚠️ Save this code immediately!</p>
                    <p class="text-muted">This code cannot be retrieved later and will expire in 90 days.</p>
                </div>`);

            toast('Activation code regenerated', 'success');
            load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function handleExport() {
        exportCSV(currentData, 'distributors.csv');
    }

    function init() {
        const exportBtn = $('#distributors-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExport);
        }

        const createBtn = $('#distributors-create-btn');
        if (createBtn) {
            createBtn.addEventListener('click', createDistributor);
        }
    }

    return { init, onNavigate: load };
})();
