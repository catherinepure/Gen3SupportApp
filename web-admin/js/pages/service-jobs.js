/** Service Jobs Page */
const ServiceJobsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let scootersList = [];
    let workshopsList = [];

    async function load() {
        try {
            $('#service-jobs-content').innerHTML = Utils.loading();

            // Load service jobs and related data in parallel
            const [jobsResult, scootersResult, workshopsResult] = await Promise.all([
                API.call('service-jobs', 'list', { limit: 100 }),
                API.call('scooters', 'list', { limit: 1000 }),
                API.call('workshops', 'list', { limit: 100 })
            ]);

            currentData = jobsResult.jobs || jobsResult['service-jobs'] || jobsResult.data || [];
            scootersList = scootersResult.scooters || scootersResult.data || [];
            workshopsList = workshopsResult.workshops || workshopsResult.data || [];

            TableComponent.render('#service-jobs-content', currentData, [
                { key: 'scooters', label: 'Scooter', format: (val) => val ? (val.zyd_serial || val.id?.substring(0, 8) + '...') : 'N/A' },
                { key: 'workshops', label: 'Workshop', format: (val) => val ? val.name : 'N/A' },
                { key: 'status', label: 'Status', format: (val) => getStatusBadge(val) },
                { key: 'issue_description', label: 'Issue', format: (val) => val ? (val.length > 50 ? val.substring(0, 50) + '...' : val) : 'N/A' },
                { key: 'booked_date', label: 'Booked', format: formatDate },
                { key: 'started_date', label: 'Started', format: (val) => val ? formatDate(val) : '-' },
                { key: 'firmware_updated', label: 'FW Updated', format: (val) => val ? '✓' : '' }
            ], {
                onRowClick: showServiceJobDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#service-jobs-content').innerHTML = Utils.errorState('Failed to load service jobs');
        }
    }

    async function createServiceJob() {
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
                const result = await API.call('service-jobs', 'create', formData);
                toast('Service job created successfully', 'success');
                ModalComponent.close();
                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
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

                const result = await API.call('service-jobs', 'update', {
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
        const scooterInfo = job.scooters ? `${job.scooters.zyd_serial || 'Unknown Serial'} (${job.scooters.model || 'Unknown Model'})` : job.scooter_id?.substring(0, 8) + '...';
        const workshopInfo = job.workshops?.name || job.workshop_id?.substring(0, 8) + '...';
        const customerInfo = job.users ? `${job.users.first_name || ''} ${job.users.last_name || ''} (${job.users.email})`.trim() : job.customer_id?.substring(0, 8) + '...';

        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Service Job Information</h4>';
        html += `<p><strong>Job ID:</strong> ${job.id}</p>`;
        html += `<p><strong>Status:</strong> ${getStatusBadge(job.status)}</p>`;
        html += `<p><strong>Scooter:</strong> ${scooterInfo}</p>`;
        html += `<p><strong>Workshop:</strong> ${workshopInfo}</p>`;
        html += `<p><strong>Customer:</strong> ${customerInfo}</p>`;
        html += `<p><strong>Technician:</strong> ${job.technician_id ? job.technician_id.substring(0, 8) + '...' : 'Not assigned'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Timeline</h4>';
        html += `<p><strong>Booked:</strong> ${formatDate(job.booked_date)}</p>`;
        html += `<p><strong>Started:</strong> ${job.started_date ? formatDate(job.started_date) : 'Not started'}</p>`;
        html += `<p><strong>Completed:</strong> ${job.completed_date ? formatDate(job.completed_date) : 'Not completed'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Issue Description</h4>';
        html += `<p>${job.issue_description || 'No description provided'}</p>`;
        if (job.technician_notes) {
            html += '<h4>Technician Notes</h4>';
            html += `<p>${job.technician_notes}</p>`;
        }
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Firmware Update</h4>';
        html += `<p><strong>Updated:</strong> ${job.firmware_updated ? 'Yes' : 'No'}</p>`;
        if (job.firmware_updated) {
            html += `<p><strong>Before:</strong> ${job.firmware_version_before || 'N/A'}</p>`;
            html += `<p><strong>After:</strong> ${job.firmware_version_after || 'N/A'}</p>`;
        }
        html += '</div>';

        if (job.parts_used) {
            html += '<div class="detail-section">';
            html += '<h4>Parts Used</h4>';
            html += `<pre>${JSON.stringify(job.parts_used, null, 2)}</pre>`;
            html += '</div>';
        }

        html += '</div>';

        // Add action buttons if job is not completed/cancelled
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

        ModalComponent.show('Service Job Detail', html, actions);
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
    }

    return { init, onNavigate: load };
})();
