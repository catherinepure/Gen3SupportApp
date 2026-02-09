/** Logs (Upload Logs) Page */
const LogsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#logs-content').innerHTML = Utils.loading();
            const result = await API.call('logs', 'list', { limit: 50 });
            currentData = result.logs || result.data || [];

            TableComponent.render('#logs-content', currentData, [
                { key: 'scooter_id', label: 'Scooter', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'firmware_version', label: 'Firmware', format: (val) => val || 'N/A' },
                { key: 'status', label: 'Status', format: (val) => {
                    const badges = {
                        'pending': 'badge-warning',
                        'uploading': 'badge-active',
                        'completed': 'badge-success',
                        'failed': 'badge-danger'
                    };
                    const badgeClass = badges[val] || 'badge-inactive';
                    return `<span class="badge ${badgeClass}">${val || 'Unknown'}</span>`;
                }},
                { key: 'progress_percentage', label: 'Progress', format: (val) => val !== undefined ? `${val}%` : 'N/A' },
                { key: 'created_at', label: 'Started', format: formatDate },
                { key: 'completed_at', label: 'Completed', format: (val) => val ? formatDate(val) : 'In progress' }
            ], {
                onRowClick: showLogDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#logs-content').innerHTML = Utils.errorState('Failed to load logs');
        }
    }

    function showLogDetail(log) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Upload Information</h4>';
        html += `<p><strong>Upload ID:</strong> ${log.id}</p>`;
        html += `<p><strong>Scooter ID:</strong> ${log.scooter_id || 'N/A'}</p>`;
        html += `<p><strong>Firmware Version:</strong> ${log.firmware_version || 'N/A'}</p>`;
        html += `<p><strong>Status:</strong> ${getStatusBadge(log.status)}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Progress</h4>';
        html += `<p><strong>Progress:</strong> ${log.progress_percentage !== undefined ? log.progress_percentage + '%' : 'N/A'}</p>`;
        html += `<p><strong>Bytes Transferred:</strong> ${log.bytes_transferred || 0}</p>`;
        html += `<p><strong>Total Bytes:</strong> ${log.total_bytes || 'N/A'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Timestamps</h4>';
        html += `<p><strong>Started:</strong> ${formatDate(log.created_at)}</p>`;
        html += `<p><strong>Completed:</strong> ${log.completed_at ? formatDate(log.completed_at) : 'In progress'}</p>`;
        if (log.duration_seconds) {
            html += `<p><strong>Duration:</strong> ${log.duration_seconds}s</p>`;
        }
        html += '</div>';

        if (log.error_message) {
            html += '<div class="detail-section">';
            html += '<h4>Error</h4>';
            html += `<p class="error">${log.error_message}</p>`;
            html += '</div>';
        }

        if (log.metadata) {
            html += '<div class="detail-section">';
            html += '<h4>Metadata</h4>';
            html += `<pre>${JSON.stringify(log.metadata, null, 2)}</pre>`;
            html += '</div>';
        }

        html += '</div>';

        ModalComponent.show('Upload Log Detail', html);
    }

    function getStatusBadge(status) {
        const badges = {
            'pending': 'badge-warning',
            'uploading': 'badge-active',
            'completed': 'badge-success',
            'failed': 'badge-danger'
        };
        const badgeClass = badges[status] || 'badge-inactive';
        return `<span class="badge ${badgeClass}">${status || 'Unknown'}</span>`;
    }

    function init() {
        $('#logs-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'upload-logs.csv'));
    }

    return { init, onNavigate: load };
})();
