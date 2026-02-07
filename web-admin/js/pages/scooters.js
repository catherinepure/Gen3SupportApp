/**
 * Scooters Page
 */

const ScootersPage = (() => {
    const { $, toast, exportCSV, detailRow, detailSection } = Utils;
    const { render: renderTable } = TableComponent;

    let currentScooters = [];

    async function load() {
        try {
            $('#scooters-content').innerHTML = Utils.loading('Loading scooters...');

            const result = await API.call('scooters', 'list', { limit: 50 });
            currentScooters = result.scooters || [];

            renderTable('#scooters-content', currentScooters, [
                { key: 'serial_number', label: 'Serial Number' },
                { key: 'scooter_type', label: 'Type' },
                { key: 'status', label: 'Status', format: 'status' },
                { key: 'firmware_version', label: 'Firmware' },
                { key: 'country_of_registration', label: 'Country' },
                { key: 'registration_date', label: 'Registered', format: 'date' }
            ], {
                onRowClick: showScooterDetail,
                emptyMessage: 'No scooters found'
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#scooters-content').innerHTML = Utils.errorState('Failed to load scooters');
        }
    }

    function showScooterDetail(scooter) {
        let html = '<div class="detail-grid">';
        html += detailSection('Scooter Information');
        html += detailRow('Serial Number', scooter.serial_number);
        html += detailRow('Type', scooter.scooter_type);
        html += detailRow('Status', Utils.statusBadge(scooter.status));
        html += detailRow('Firmware', scooter.firmware_version);
        html += detailRow('Country', scooter.country_of_registration);
        html += detailRow('Registered', Utils.formatDate(scooter.registration_date));
        html += '</div>';

        ModalComponent.show(`Scooter: ${scooter.serial_number}`, html);
    }

    function init() {
        $('#scooters-export-btn')?.addEventListener('click', () => {
            exportCSV(currentScooters, 'scooters.csv');
        });
    }

    function onNavigate() {
        load();
    }

    return { init, onNavigate };
})();
