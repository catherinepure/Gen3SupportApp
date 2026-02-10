/** Service Jobs Page */
const ServiceJobsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let scootersList = null;
    let workshopsList = null;
    let currentPage = 1;
    let totalRecords = 0;
    let statusFilter = '';
    const PAGE_SIZE = 50;

    async function load() {
        try {
            $('#service-jobs-content').innerHTML = Utils.loading();

            const offset = (currentPage - 1) * PAGE_SIZE;
            const params = { limit: PAGE_SIZE, offset };
            if (statusFilter) {
                params.status = statusFilter;
            }

            const jobsResult = await API.call('service-jobs', 'list', params);
            currentData = jobsResult.jobs || jobsResult['service-jobs'] || jobsResult.data || [];
            totalRecords = jobsResult.total || currentData.length;

            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

            TableComponent.render('#service-jobs-content', currentData, [
                { key: 'scooters', label: 'Scooter', format: (val) => val ? (val.zyd_serial || val.id?.substring(0, 8) + '...') : 'N/A' },
                { key: 'workshops', label: 'Workshop', format: (val) => val ? val.name : 'N/A' },
                { key: 'status', label: 'Status', format: (val) => getStatusBadge(val) },
                { key: 'issue_description', label: 'Issue', format: (val) => val ? (val.length > 50 ? val.substring(0, 50) + '...' : val) : 'N/A' },
                { key: 'booked_date', label: 'Booked', format: formatDate },
                { key: 'started_date', label: 'Started', format: (val) => val ? formatDate(val) : '-' },
                { key: 'firmware_updated', label: 'FW Updated', format: (val) => val ? '✓' : '' }
            ], {
                onRowClick: showServiceJobDetail,
                pagination: totalPages > 1 ? {
                    current: currentPage,
                    total: totalPages,
                    pageSize: PAGE_SIZE,
                    totalRecords
                } : null,
                onPageChange: (page) => {
                    currentPage = page;
                    load();
                }
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#service-jobs-content').innerHTML = Utils.errorState('Failed to load service jobs');
        }
    }

    /** Lazy-load scooters and workshops lists (only when needed for create form) */
    async function ensureReferenceData() {
        if (scootersList && workshopsList) return;

        const [scootersResult, workshopsResult] = await Promise.all([
            API.call('scooters', 'list', { limit: 1000 }),
            API.call('workshops', 'list', { limit: 100 })
        ]);

        scootersList = scootersResult.scooters || scootersResult.data || [];
        workshopsList = workshopsResult.workshops || workshopsResult.data || [];
    }

    async function createServiceJob() {
        try {
            // Show a loading toast while fetching reference data
            toast('Loading form data...', 'info');
            await ensureReferenceData();

            const fields = [
                {
                    name: 'scooter_id',
                    label: 'Scooter *',
                    type: 'select',
                    required: true,
                    options: scootersList.map(s => ({
                        value: s.id,
                        label: `${s.zyd_serial || s.id.substring(0, 8)} - ${s.model || 'Unknown'}`
                    }))
                },
                {
                    name: 'workshop_id',
                    label: 'Workshop *',
                    type: 'select',
                    required: true,
                    options: workshopsList.map(w => ({
                        value: w.id,
                        label: w.name
                    }))
                },
                {
                    name: 'issue_description',
                    label: 'Issue Description *',
                    type: 'textarea',
                    required: true,
                    placeholder: 'Describe the problem with the scooter...'
                }
            ];

            FormComponent.show('Create Service Job', fields, async (formData) => {
                try {
                    await API.call('service-jobs', 'create', formData);
                    toast('Service job created successfully', 'success');
                    ModalComponent.close();
                    await load();
                } catch (err) {
                    toast(err.message, 'error');
                }
            });
        } catch (err) {
            toast('Failed to load form data: ' + err.message, 'error');
        }
    }

    async function editServiceJob(job) {
        const statusOptions = [
            { value: 'booked', label: 'Booked' },
            { value: 'in_progress', label: 'In Progress' },
            { value: 'awaiting_parts', label: 'Awaiting Parts' },
            { value: 'ready_for_collection', label: 'Ready for Collection' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' }
        ];

        const fields = [
            {
                name: 'status',
                label: 'Status *',
                type: 'select',
                required: true,
                value: job.status,
                options: statusOptions
            },
            {
                name: 'technician_notes',
                label: 'Technician Notes',
                type: 'textarea',
                value: job.technician_notes || '',
                placeholder: 'Add notes about diagnosis, repairs performed, etc...'
            },
            {
                name: 'parts_used',
                label: 'Parts Used (JSON)',
                type: 'textarea',
                value: job.parts_used ? JSON.stringify(job.parts_used, null, 2) : '',
                placeholder: '{"battery": 1, "motor": 1}'
            },
            {
                name: 'firmware_updated',
                label: 'Firmware Updated',
                type: 'checkbox',
                value: job.firmware_updated || false
            }
        ];

        if (job.firmware_updated) {
            fields.push(
                {
                    name: 'firmware_version_before',
                    label: 'FW Version Before',
                    type: 'text',
                    value: job.firmware_version_before || ''
                },
                {
                    name: 'firmware_version_after',
                    label: 'FW Version After',
                    type: 'text',
                    value: job.firmware_version_after || ''
                }
            );
        }

        FormComponent.show('Update Service Job', fields, async (formData) => {
            try {
                // Parse parts_used JSON if provided
                if (formData.parts_used) {
                    try {
                        formData.parts_used = JSON.parse(formData.parts_used);
                    } catch {
                        toast('Invalid JSON in parts_used field', 'error');
                        return;
                    }
                }

                await API.call('service-jobs', 'update', {
                    id: job.id,
                    ...formData
                });
                toast('Service job updated successfully', 'success');
                ModalComponent.close();
                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function showServiceJobDetail(job) {
        const scooterInfo = job.scooters
            ? `${job.scooters.zyd_serial || 'Unknown Serial'} (${job.scooters.model || 'Unknown Model'})`
            : job.scooter_id?.substring(0, 8) + '...';
        const workshopInfo = job.workshops?.name || job.workshop_id?.substring(0, 8) + '...';
        const customerName = job.users
            ? `${job.users.first_name || ''} ${job.users.last_name || ''}`.trim()
            : null;

        const sections = [
            {
                title: 'Service Job Information',
                fields: [
                    { label: 'Job ID', value: job.id, type: 'code' },
                    { label: 'Status', value: job.status, type: 'badge-status' },
                    { label: 'Scooter', value: scooterInfo },
                    { label: 'Workshop', value: workshopInfo },
                    { label: 'Customer', value: job.users ? `${customerName || ''} (${job.users.email})`.trim() : 'N/A' },
                    { label: 'Technician', value: job.technician_id ? job.technician_id.substring(0, 8) + '...' : 'Not assigned' }
                ]
            },
            {
                title: 'Timeline',
                fields: [
                    { label: 'Booked', value: job.booked_date, type: 'date' },
                    job.started_date
                        ? { label: 'Started', value: job.started_date, type: 'date' }
                        : { label: 'Started', value: 'Not started' },
                    job.completed_date
                        ? { label: 'Completed', value: job.completed_date, type: 'date' }
                        : { label: 'Completed', value: 'Not completed' }
                ]
            },
            {
                title: 'Issue Description',
                fields: [
                    { label: 'Description', value: job.issue_description || 'No description provided' }
                ]
            }
        ];

        // Technician notes
        if (job.technician_notes) {
            sections.push({
                title: 'Technician Notes',
                fields: [
                    { label: 'Notes', value: job.technician_notes }
                ]
            });
        }

        // Firmware update
        sections.push({
            title: 'Firmware Update',
            fields: [
                { label: 'Updated', value: job.firmware_updated ? 'Yes' : 'No' },
                ...(job.firmware_updated ? [
                    { label: 'Before', value: job.firmware_version_before || 'N/A' },
                    { label: 'After', value: job.firmware_version_after || 'N/A' }
                ] : [])
            ]
        });

        // Parts used
        if (job.parts_used) {
            sections.push({
                title: 'Parts Used',
                html: `<pre>${JSON.stringify(job.parts_used, null, 2)}</pre>`
            });
        }

        // Metadata
        sections.push(DetailModal.metadataSection(job));

        // Action buttons
        const actions = [];
        if (job.status !== 'completed' && job.status !== 'cancelled') {
            actions.push({
                label: 'Update Job',
                class: 'btn-primary',
                onClick: () => {
                    ModalComponent.close();
                    setTimeout(() => editServiceJob(job), 100);
                }
            });
        }

        DetailModal.show('Service Job Detail', {
            sections,
            actions,
            breadcrumbs: [
                { label: 'Service Jobs', onClick: () => { ModalComponent.close(); } },
                { label: `Job #${job.id.substring(0, 8)}` }
            ]
        });
    }

    function getStatusBadge(status) {
        const badges = {
            'booked': 'badge-warning',
            'in_progress': 'badge-active',
            'awaiting_parts': 'badge-danger',
            'ready_for_collection': 'badge-success',
            'completed': 'badge-inactive',
            'cancelled': 'badge-inactive'
        };
        const badgeClass = badges[status] || 'badge-inactive';
        return `<span class="badge ${badgeClass}">${status || 'Unknown'}</span>`;
    }

    function init() {
        $('#service-jobs-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'service-jobs.csv'));
        $('#service-jobs-create-btn')?.addEventListener('click', createServiceJob);

        const filterEl = $('#service-jobs-status-filter');
        if (filterEl) {
            filterEl.addEventListener('change', (e) => {
                statusFilter = e.target.value;
                currentPage = 1;
                load();
            });
        }
    }

    function onNavigate() {
        RefreshController.attach('#service-jobs-content', load);
        // Clear cached reference data so it's fresh next time create is used
        scootersList = null;
        workshopsList = null;
        currentPage = 1;
        statusFilter = '';
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
