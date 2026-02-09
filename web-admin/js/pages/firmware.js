/** Firmware Page */
const FirmwarePage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let allData = [];
    let currentFilter = '';

    async function load() {
        try {
            $('#firmware-content').innerHTML = Utils.loading();
            const result = await API.call('firmware', 'list', { limit: 100 });
            allData = result.firmware || result.data || [];
            applyFilter();
        } catch (err) {
            toast(err.message, 'error');
            $('#firmware-content').innerHTML = Utils.errorState('Failed to load firmware');
        }
    }

    function applyFilter() {
        if (currentFilter === 'active') {
            currentData = allData.filter(f => f.is_active !== false);
        } else if (currentFilter === 'inactive') {
            currentData = allData.filter(f => f.is_active === false);
        } else {
            currentData = allData;
        }
        renderTable();
    }

    function renderTable() {
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
            onRowClick: showFirmwareDetail
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
                applyFilter();
            });
        }
    }

    return { init, onNavigate: load };
})();
