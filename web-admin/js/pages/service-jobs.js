/** Service Jobs Page */
const ServiceJobsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#service-jobs-content').innerHTML = Utils.loading();
            const result = await API.call('service-jobs', 'list', { limit: 50 });
            currentData = result['service-jobs'] || result.data || [];

            TableComponent.render('#service-jobs-content', currentData, [
                { key: 'scooter_id', label: 'Scooter', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'workshop_id', label: 'Workshop', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'status', label: 'Status', format: (val) => {
                    const badges = {
                        'booked': 'badge-warning',
                        'in_progress': 'badge-active',
                        'awaiting_parts': 'badge-danger',
                        'ready_for_collection': 'badge-success',
                        'completed': 'badge-inactive',
                        'cancelled': 'badge-inactive'
                    };
                    const badgeClass = badges[val] || 'badge-inactive';
                    return `<span class="badge ${badgeClass}">${val || 'Unknown'}</span>`;
                }},
                { key: 'booked_date', label: 'Booked', format: formatDate },
                { key: 'started_date', label: 'Started', format: (val) => val ? formatDate(val) : 'Not started' },
                { key: 'firmware_updated', label: 'FW Updated', format: (val) => val ? 'Yes' : 'No' }
            ], {
                onRowClick: showServiceJobDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#service-jobs-content').innerHTML = Utils.errorState('Failed to load service jobs');
        }
    }

    function showServiceJobDetail(job) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Service Job Information</h4>';
        html += `<p><strong>Job ID:</strong> ${job.id}</p>`;
        html += `<p><strong>Status:</strong> ${getStatusBadge(job.status)}</p>`;
        html += `<p><strong>Scooter ID:</strong> ${job.scooter_id || 'N/A'}</p>`;
        html += `<p><strong>Workshop ID:</strong> ${job.workshop_id || 'N/A'}</p>`;
        html += `<p><strong>Customer ID:</strong> ${job.customer_id || 'N/A'}</p>`;
        html += `<p><strong>Technician ID:</strong> ${job.technician_id || 'Not assigned'}</p>`;
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

        ModalComponent.show('Service Job Detail', html);
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
    }

    return { init, onNavigate: load };
})();
