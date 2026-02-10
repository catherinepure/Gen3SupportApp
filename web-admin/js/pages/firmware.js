/** Firmware Page */
const FirmwarePage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let currentFilter = '';
    let currentPage = 1;
    let totalRecords = 0;
    const PAGE_SIZE = 50;

    async function load() {
        try {
            $('#firmware-content').innerHTML = Utils.loading();

            const offset = (currentPage - 1) * PAGE_SIZE;
            const params = { limit: PAGE_SIZE, offset };

            // Map filter value to server-side is_active param
            if (currentFilter === 'active') {
                params.is_active = true;
            } else if (currentFilter === 'inactive') {
                params.is_active = false;
            }

            const result = await API.call('firmware', 'list', params);
            currentData = result.firmware || result.data || [];
            totalRecords = result.total || currentData.length;

            renderTable();
        } catch (err) {
            toast(err.message, 'error');
            $('#firmware-content').innerHTML = Utils.errorState('Failed to load firmware');
        }
    }

    function renderTable() {
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

        TableComponent.render('#firmware-content', currentData, [
            { key: 'version_label', label: 'Version' },
            { key: 'target_hw_version', label: 'Hardware', format: (val) => val || 'All' },
            { key: 'file_size_bytes', label: 'Size', format: (val) => val ? Utils.formatBytes(val) : 'N/A' },
            { key: 'access_level', label: 'Access Level', format: (val) => val || 'N/A' },
            { key: 'is_active', label: 'Status', format: (val) =>
                val === false
                    ? '<span class="badge badge-inactive">Inactive</span>'
                    : '<span class="badge badge-active">Active</span>'
            },
            { key: 'created_at', label: 'Released', format: formatDate }
        ], {
            onRowClick: showFirmwareDetail,
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

    function showFirmwareDetail(firmware) {
        const sections = [
            {
                title: 'Firmware Information',
                fields: [
                    { label: 'Version', value: firmware.version_label },
                    { label: 'Target Hardware', value: firmware.target_hw_version || 'All' },
                    { label: 'Min SW Version', value: firmware.min_sw_version || 'None' },
                    { label: 'Access Level', value: firmware.access_level || 'N/A' },
                    { label: 'Status', value: firmware.is_active === false ? 'inactive' : 'active', type: 'badge-status' }
                ]
            },
            {
                title: 'File Details',
                fields: [
                    { label: 'File Path', value: firmware.file_path, type: 'code' },
                    { label: 'File Size', value: firmware.file_size_bytes ? Utils.formatBytes(firmware.file_size_bytes) : 'N/A' }
                ]
            }
        ];

        // Release notes
        if (firmware.release_notes) {
            sections.push({
                title: 'Release Notes',
                html: `<div style="white-space: pre-wrap; font-size: 0.9em; color: #555;">${Utils.escapeHtml(firmware.release_notes)}</div>`
            });
        }

        // Metadata
        sections.push(DetailModal.metadataSection(firmware));

        // Actions
        const actions = [];

        if (firmware.is_active === false) {
            actions.push({
                label: 'Reactivate',
                class: 'btn-success',
                onClick: async () => {
                    try {
                        await API.call('firmware', 'reactivate', { id: firmware.id });
                        toast('Firmware reactivated', 'success');
                        ModalComponent.close();
                        await load();
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            });
        } else {
            actions.push({
                label: 'Deactivate',
                class: 'btn-danger',
                onClick: async () => {
                    if (!confirm(`Deactivate firmware ${firmware.version_label}? Devices will no longer receive this update.`)) return;
                    try {
                        await API.call('firmware', 'deactivate', { id: firmware.id });
                        toast('Firmware deactivated', 'success');
                        ModalComponent.close();
                        await load();
                    } catch (err) {
                        toast(err.message, 'error');
                    }
                }
            });
        }

        DetailModal.show('Firmware Detail', {
            sections,
            actions,
            breadcrumbs: [
                { label: 'Firmware', onClick: () => { ModalComponent.close(); } },
                { label: firmware.version_label || 'Unknown' }
            ]
        });
    }

    function init() {
        $('#firmware-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'firmware.csv'));

        // Set up status filter if the element exists
        const filterEl = $('#firmware-filter');
        if (filterEl) {
            filterEl.addEventListener('change', (e) => {
                currentFilter = e.target.value;
                currentPage = 1;
                load();
            });
        }
    }

    function onNavigate() {
        RefreshController.attach('#firmware-content', load);
        currentPage = 1;
        currentFilter = '';
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
