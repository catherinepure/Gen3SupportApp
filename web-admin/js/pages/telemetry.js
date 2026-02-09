/** Telemetry Page */
const TelemetryPage = (() => {
    const { $, toast, exportCSV, formatDate, debounce } = Utils;
    let currentData = [];
    let searchTerm = '';

    async function load() {
        try {
            $('#telemetry-content').innerHTML = Utils.loading();

            const params = { limit: 50 };
            if (searchTerm) {
                params.search = searchTerm;
            }

            const result = await API.call('telemetry', 'list', params);
            currentData = result.telemetry || result.data || [];

            renderTable();
        } catch (err) {
            toast(err.message, 'error');
            $('#telemetry-content').innerHTML = Utils.errorState('Failed to load telemetry');
        }
    }

    function renderTable() {
        TableComponent.render('#telemetry-content', currentData, [
            { key: 'scooters', label: 'Scooter', format: (val, row) => {
                if (val && val.zyd_serial) return val.zyd_serial;
                return row.scooter_id ? row.scooter_id.substring(0, 8) + '...' : 'N/A';
            }},
            { key: 'scanned_at', label: 'Scanned', format: formatDate },
            { key: 'voltage', label: 'Battery', format: (val) => val ? `${val}V` : 'N/A' },
            { key: 'battery_soc', label: 'Charge', format: (val) => {
                if (val === undefined || val === null) return 'N/A';
                const color = val > 50 ? '#22c55e' : val > 20 ? '#f59e0b' : '#ef4444';
                return `<span style="color: ${color}; font-weight: 500;">${val}%</span>`;
            }},
            { key: 'speed_kmh', label: 'Speed', format: (val) => val !== undefined ? `${val} km/h` : '-' },
            { key: 'odometer_km', label: 'Odometer', format: (val) => val !== undefined ? `${val.toLocaleString()} km` : '-' },
            { key: 'scan_type', label: 'Type', format: (val) => val ? `<span class="badge badge-primary">${val.replace(/_/g, ' ')}</span>` : '-' }
        ], {
            onRowClick: showTelemetryDetail
        });
    }

    function showTelemetryDetail(t) {
        const scooterLabel = t.scooters?.zyd_serial || t.scooter_id || 'Unknown';

        const sections = [
            {
                title: 'Snapshot Information',
                fields: [
                    { label: 'Scooter', value: scooterLabel },
                    { label: 'Scooter ID', value: t.scooter_id, type: 'code' },
                    { label: 'Scanned At', value: t.scanned_at, type: 'date' },
                    { label: 'Scan Type', value: t.scan_type ? t.scan_type.replace(/_/g, ' ') : 'N/A' },
                    { label: 'HW Version', value: t.hw_version || 'N/A' },
                    { label: 'SW Version', value: t.sw_version || 'N/A' }
                ]
            },
            {
                title: 'Battery',
                fields: [
                    { label: 'Voltage', value: t.voltage !== undefined ? `${t.voltage}V` : 'N/A' },
                    { label: 'State of Charge', value: t.battery_soc !== undefined ? `${t.battery_soc}%` : 'N/A' },
                    { label: 'Temperature', value: t.battery_temp !== undefined ? `${t.battery_temp}°C` : 'N/A' },
                    { label: 'Current', value: t.current !== undefined ? `${t.current}A` : 'N/A' },
                    { label: 'Health', value: t.battery_health ?? 'N/A' },
                    { label: 'Charge Cycles', value: t.battery_charge_cycles ?? 'N/A' },
                    { label: 'Discharge Cycles', value: t.battery_discharge_cycles ?? 'N/A' },
                    { label: 'Remaining Capacity', value: t.remaining_capacity_mah !== undefined ? `${t.remaining_capacity_mah} mAh` : 'N/A' },
                    { label: 'Full Capacity', value: t.full_capacity_mah !== undefined ? `${t.full_capacity_mah} mAh` : 'N/A' }
                ]
            },
            {
                title: 'Performance',
                fields: [
                    { label: 'Speed', value: t.speed_kmh !== undefined ? `${t.speed_kmh} km/h` : 'N/A' },
                    { label: 'Odometer', value: t.odometer_km !== undefined ? `${t.odometer_km.toLocaleString()} km` : 'N/A' },
                    { label: 'Motor Temperature', value: t.motor_temp !== undefined ? `${t.motor_temp}°C` : 'N/A' }
                ]
            }
        ];

        // Notes
        if (t.notes) {
            sections.push({
                title: 'Notes',
                fields: [
                    { label: 'Notes', value: t.notes }
                ]
            });
        }

        // Metadata timestamps
        sections.push(DetailModal.metadataSection(t));

        DetailModal.show('Telemetry Detail', {
            sections,
            breadcrumbs: [
                { label: 'Telemetry', onClick: () => { ModalComponent.close(); } },
                { label: scooterLabel }
            ]
        });
    }

    const debouncedSearch = debounce(() => {
        load();
    }, 400);

    function init() {
        $('#telemetry-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'telemetry.csv'));

        const searchEl = $('#telemetry-search');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                searchTerm = e.target.value.trim();
                debouncedSearch();
            });
        }
    }

    return { init, onNavigate: load };
})();
