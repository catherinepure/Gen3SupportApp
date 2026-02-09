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

            // Build sections using DetailModal component
            const sections = [
                // Basic Info
                {
                    title: 'Distributor Information',
                    fields: [
                        { label: 'Name', value: d.name },
                        { label: 'Email', value: d.email || 'N/A' },
                        { label: 'Phone', value: d.phone || 'N/A' },
                        { label: 'Status', value: d.is_active, type: 'badge-boolean' }
                    ]
                },
                // Activation Code (using helper)
                DetailModal.activationCodeSection(d, 'distributor'),
                // Territory
                {
                    title: 'Territory Coverage',
                    fields: [
                        { label: 'Countries', value: d.countries, type: 'list' }
                    ]
                },
                // Stats
                {
                    title: 'Statistics',
                    fields: [
                        { label: 'Staff Members', value: staffCount },
                        { label: 'Scooters', value: scooterCount },
                        { label: 'Workshops', value: workshops.length }
                    ]
                }
            ];

            // Workshops section (if any)
            if (workshops.length > 0) {
                let workshopsHtml = '<ul>';
                workshops.forEach(w => {
                    const status = w.is_active ? '✓' : '✗';
                    workshopsHtml += `<li>${status} ${w.name} (${w.email || 'no email'})</li>`;
                });
                workshopsHtml += '</ul>';
                sections.push({
                    title: 'Workshops',
                    html: workshopsHtml
                });
            }

            // Addresses section (using helper)
            if (addresses.length > 0) {
                sections.push(DetailModal.addressSection(addresses));
            }

            // Metadata (using helper)
            sections.push(DetailModal.metadataSection(d));

            // Action buttons
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

            // Show modal using DetailModal component
            DetailModal.show('Distributor Detail', {
                sections,
                actions,
                breadcrumbs: [
                    { label: 'Distributors', onClick: () => { ModalComponent.close(); } },
                    { label: d.name }
                ]
            });
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
