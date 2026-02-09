/** Logs (Upload Logs) Page */
const LogsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let allData = [];
    let currentFilter = '';

    async function load() {
        try {
            $('#logs-content').innerHTML = Utils.loading();
            const result = await API.call('logs', 'list', { limit: 50 });
            allData = result.logs || result.data || [];
            applyFilter();
        } catch (err) {
            toast(err.message, 'error');
            $('#logs-content').innerHTML = Utils.errorState('Failed to load logs');
        }
    }

    function applyFilter() {
        if (currentFilter) {
            currentData = allData.filter(l => l.status === currentFilter);
        } else {
            currentData = allData;
        }
        renderTable();
    }

    function renderTable() {
        TableComponent.render('#logs-content', currentData, [
            { key: 'scooters', label: 'Scooter', format: (val, row) => {
                if (val && val.zyd_serial) return val.zyd_serial;
                return row.scooter_id ? row.scooter_id.substring(0, 8) + '...' : 'N/A';
            }},
            { key: 'firmware_version', label: 'Firmware', format: (val) => val || 'N/A' },
            { key: 'status', label: 'Status', format: (val) => getStatusBadge(val) },
            { key: 'progress_percentage', label: 'Progress', format: (val) => {
                if (val === undefined || val === null) return 'N/A';
                return `<div style="display: flex; align-items: center; gap: 8px;">
                    <div style="flex: 1; height: 6px; background: #e5e7eb; border-radius: 3px; max-width: 80px;">
                        <div style="height: 100%; width: ${val}%; background: ${val === 100 ? '#22c55e' : '#3b82f6'}; border-radius: 3px;"></div>
                    </div>
                    <span>${val}%</span>
                </div>`;
            }},
            { key: 'created_at', label: 'Started', format: formatDate },
            { key: 'completed_at', label: 'Completed', format: (val) => val ? formatDate(val) : 'In progress' }
        ], {
            onRowClick: showLogDetail
        });
    }

    function showLogDetail(log) {
        const scooterLabel = log.scooters?.zyd_serial || log.scooter_id || 'N/A';

        const sections = [
            {
                title: 'Upload Information',
                fields: [
                    { label: 'Upload ID', value: log.id, type: 'code' },
                    { label: 'Scooter', value: scooterLabel },
                    { label: 'Firmware Version', value: log.firmware_version || 'N/A' },
                    { label: 'Status', value: log.status, type: 'badge-status' }
                ]
            },
            {
                title: 'Progress',
                fields: [
                    { label: 'Progress', value: log.progress_percentage !== undefined ? log.progress_percentage + '%' : 'N/A' },
                    { label: 'Bytes Transferred', value: log.bytes_transferred ? Utils.formatBytes(log.bytes_transferred) : '0' },
                    { label: 'Total Bytes', value: log.total_bytes ? Utils.formatBytes(log.total_bytes) : 'N/A' },
                    { label: 'Duration', value: log.duration_seconds ? log.duration_seconds + 's' : 'N/A' }
                ]
            },
            {
                title: 'Timestamps',
                fields: [
                    { label: 'Started', value: log.created_at, type: 'date' },
                    { label: 'Completed', value: log.completed_at || 'In progress' }
                ]
            }
        ];

        // Error section
        if (log.error_message) {
            sections.push({
                title: 'Error',
                html: `<div style="color: #ef4444; padding: 10px; background: #fef2f2; border-radius: 6px;">${Utils.escapeHtml(log.error_message)}</div>`
            });
        }

        // Metadata
        if (log.metadata) {
            sections.push({
                title: 'Metadata',
                html: `<pre style="max-height: 200px; overflow: auto; font-size: 0.85em;">${JSON.stringify(log.metadata, null, 2)}</pre>`
            });
        }

        DetailModal.show('Upload Log Detail', {
            sections,
            breadcrumbs: [
                { label: 'Upload Logs', onClick: () => { ModalComponent.close(); } },
                { label: scooterLabel }
            ]
        });
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

        const filterEl = $('#logs-status-filter');
        if (filterEl) {
            filterEl.addEventListener('change', (e) => {
                currentFilter = e.target.value;
                applyFilter();
            });
        }
    }

    return { init, onNavigate: load };
})();
