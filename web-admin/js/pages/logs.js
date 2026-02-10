/** Logs (Upload Logs) Page */
const LogsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let currentFilter = '';
    let currentPage = 1;
    let totalRecords = 0;
    const PAGE_SIZE = 50;

    async function load() {
        try {
            $('#logs-content').innerHTML = Utils.loading();

            const offset = (currentPage - 1) * PAGE_SIZE;
            const params = { limit: PAGE_SIZE, offset };
            if (currentFilter) {
                params.status = currentFilter;
            }

            const result = await API.call('logs', 'list', params);
            currentData = result.logs || result.data || [];
            totalRecords = result.total || currentData.length;

            renderTable();
        } catch (err) {
            toast(err.message, 'error');
            $('#logs-content').innerHTML = Utils.errorState('Failed to load logs');
        }
    }

    function renderTable() {
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

        TableComponent.render('#logs-content', currentData, [
            { key: 'scooters', label: 'Scooter', format: (val, row) => {
                if (val && val.zyd_serial) return val.zyd_serial;
                return row.scooter_id ? row.scooter_id.substring(0, 8) + '...' : 'N/A';
            }},
            { key: 'firmware_version', label: 'Firmware', format: (val) => val || 'N/A' },
            { key: 'status', label: 'Status', format: (val) => getStatusBadge(val) },
            { key: 'progress_percentage', label: 'Progress', format: (val) => {
                if (val === undefined || val === null) return 'N/A';
                return `<div class="progress-bar-container">
                    <div class="progress-bar-track">
                        <div class="progress-bar-fill" style="width: ${val}%; background: ${val === 100 ? '#22c55e' : '#3b82f6'};"></div>
                    </div>
                    <span>${val}%</span>
                </div>`;
            }},
            { key: 'created_at', label: 'Started', format: formatDate },
            { key: 'completed_at', label: 'Completed', format: (val) => val ? formatDate(val) : 'In progress' }
        ], {
            onRowClick: showLogDetail,
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
                html: `<div class="error-block">${Utils.escapeHtml(log.error_message)}</div>`
            });
        }

        // Metadata
        if (log.metadata) {
            sections.push({
                title: 'Metadata',
                html: `<pre class="scrollable-pre">${JSON.stringify(log.metadata, null, 2)}</pre>`
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
                currentPage = 1;
                load();
            });
        }
    }

    function onNavigate() {
        RefreshController.attach('#logs-content', load);
        currentPage = 1;
        currentFilter = '';
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
