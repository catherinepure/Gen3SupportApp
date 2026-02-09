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
            { key: 'timestamp', label: 'Timestamp', format: formatDate },
            { key: 'battery_voltage', label: 'Battery', format: (val) => val ? `${val}V` : 'N/A' },
            { key: 'battery_percentage', label: 'Charge', format: (val) => {
                if (val === undefined || val === null) return 'N/A';
                const color = val > 50 ? '#22c55e' : val > 20 ? '#f59e0b' : '#ef4444';
                return `<span style="color: ${color}; font-weight: 500;">${val}%</span>`;
            }},
            { key: 'speed', label: 'Speed', format: (val) => val !== undefined ? `${val} km/h` : '-' },
            { key: 'odometer', label: 'Odometer', format: (val) => val !== undefined ? `${val.toLocaleString()} km` : '-' },
            { key: 'error_codes', label: 'Errors', format: (val) => {
                if (!val || !Array.isArray(val) || val.length === 0) return '-';
                return `<span class="badge badge-danger">${val.length}</span>`;
            }}
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
                    { label: 'Timestamp', value: t.timestamp, type: 'date' }
                ]
            },
            {
                title: 'Battery',
                fields: [
                    { label: 'Voltage', value: t.battery_voltage !== undefined ? `${t.battery_voltage}V` : 'N/A' },
                    { label: 'Charge', value: t.battery_percentage !== undefined ? `${t.battery_percentage}%` : 'N/A' },
                    { label: 'Temperature', value: t.battery_temperature !== undefined ? `${t.battery_temperature}°C` : 'N/A' },
                    { label: 'Current', value: t.battery_current !== undefined ? `${t.battery_current}A` : 'N/A' },
                    { label: 'Cycles', value: t.battery_cycles ?? 'N/A' }
                ]
            },
            {
                title: 'Performance',
                fields: [
                    { label: 'Speed', value: t.speed !== undefined ? `${t.speed} km/h` : 'N/A' },
                    { label: 'Odometer', value: t.odometer !== undefined ? `${t.odometer.toLocaleString()} km` : 'N/A' },
                    { label: 'Motor Temperature', value: t.motor_temperature !== undefined ? `${t.motor_temperature}°C` : 'N/A' },
                    { label: 'Controller Temperature', value: t.controller_temperature !== undefined ? `${t.controller_temperature}°C` : 'N/A' }
                ]
            }
        ];

        // Error codes
        if (t.error_codes && Array.isArray(t.error_codes) && t.error_codes.length > 0) {
            sections.push({
                title: 'Error Codes',
                fields: t.error_codes.map((code, i) => ({
                    label: `Error ${i + 1}`, value: code
                }))
            });
        }

        // Location data (if available)
        if (t.latitude !== undefined && t.longitude !== undefined) {
            sections.push({
                title: 'Location',
                fields: [
                    { label: 'Latitude', value: t.latitude },
                    { label: 'Longitude', value: t.longitude }
                ]
            });
        }

        // Raw metadata
        if (t.metadata) {
            sections.push({
                title: 'Raw Metadata',
                html: `<pre style="max-height: 200px; overflow: auto; font-size: 0.85em;">${JSON.stringify(t.metadata, null, 2)}</pre>`
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
