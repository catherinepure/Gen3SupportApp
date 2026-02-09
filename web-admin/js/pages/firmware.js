/** Firmware Page */
const FirmwarePage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#firmware-content').innerHTML = Utils.loading();
            const result = await API.call('firmware', 'list', { limit: 50 });
            currentData = result.firmware || result.data || [];

            TableComponent.render('#firmware-content', currentData, [
                { key: 'version_label', label: 'Version' },
                { key: 'target_hw_version', label: 'Hardware' },
                { key: 'file_size_bytes', label: 'Size', format: (val) => val ? `${(val / 1024).toFixed(1)} KB` : 'N/A' },
                { key: 'access_level', label: 'Access Level' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Released', format: formatDate }
            ], {
                onRowClick: showFirmwareDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#firmware-content').innerHTML = Utils.errorState('Failed to load firmware');
        }
    }

    function showFirmwareDetail(firmware) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Firmware Information</h4>';
        html += `<p><strong>Version:</strong> ${firmware.version_label}</p>`;
        html += `<p><strong>Target Hardware:</strong> ${firmware.target_hw_version}</p>`;
        html += `<p><strong>Min SW Version:</strong> ${firmware.min_sw_version || 'None'}</p>`;
        html += `<p><strong>Status:</strong> ${firmware.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
        html += `<p><strong>Access Level:</strong> ${firmware.access_level || 'N/A'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>File Details</h4>';
        html += `<p><strong>Path:</strong> ${firmware.file_path || 'N/A'}</p>`;
        html += `<p><strong>Size:</strong> ${firmware.file_size_bytes ? `${(firmware.file_size_bytes / 1024).toFixed(2)} KB` : 'N/A'}</p>`;
        html += '</div>';

        if (firmware.release_notes) {
            html += '<div class="detail-section">';
            html += '<h4>Release Notes</h4>';
            html += `<p>${firmware.release_notes}</p>`;
            html += '</div>';
        }

        html += '<div class="detail-section">';
        html += '<h4>Timestamps</h4>';
        html += `<p><strong>Created:</strong> ${formatDate(firmware.created_at)}</p>`;
        html += `<p><strong>Updated:</strong> ${formatDate(firmware.updated_at)}</p>`;
        html += '</div>';

        html += '</div>';

        ModalComponent.show('Firmware Detail', html);
    }

    function init() {
        $('#firmware-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'firmware.csv'));
    }

    return { init, onNavigate: load };
})();
