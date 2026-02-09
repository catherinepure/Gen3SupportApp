/** Telemetry Page */
const TelemetryPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#telemetry-content').innerHTML = Utils.loading();
            const result = await API.call('telemetry', 'list', { limit: 50 });
            currentData = result.telemetry || result.data || [];

            TableComponent.render('#telemetry-content', currentData, [
                { key: 'scooter_id', label: 'Scooter', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'timestamp', label: 'Timestamp', format: formatDate },
                { key: 'battery_voltage', label: 'Battery', format: (val) => val ? `${val}V` : 'N/A' },
                { key: 'battery_percentage', label: 'Battery %', format: (val) => val !== undefined ? `${val}%` : 'N/A' },
                { key: 'speed', label: 'Speed', format: (val) => val !== undefined ? `${val} km/h` : 'N/A' },
                { key: 'odometer', label: 'Odometer', format: (val) => val !== undefined ? `${val} km` : 'N/A' }
            ], {
                onRowClick: showTelemetryDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#telemetry-content').innerHTML = Utils.errorState('Failed to load telemetry');
        }
    }

    function showTelemetryDetail(telemetry) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Telemetry Snapshot</h4>';
        html += `<p><strong>Scooter ID:</strong> ${telemetry.scooter_id || 'N/A'}</p>`;
        html += `<p><strong>Timestamp:</strong> ${formatDate(telemetry.timestamp)}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Battery</h4>';
        html += `<p><strong>Voltage:</strong> ${telemetry.battery_voltage || 'N/A'}V</p>`;
        html += `<p><strong>Percentage:</strong> ${telemetry.battery_percentage !== undefined ? telemetry.battery_percentage + '%' : 'N/A'}</p>`;
        html += `<p><strong>Temperature:</strong> ${telemetry.battery_temperature || 'N/A'}°C</p>`;
        html += `<p><strong>Current:</strong> ${telemetry.battery_current || 'N/A'}A</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Performance</h4>';
        html += `<p><strong>Speed:</strong> ${telemetry.speed !== undefined ? telemetry.speed + ' km/h' : 'N/A'}</p>`;
        html += `<p><strong>Odometer:</strong> ${telemetry.odometer !== undefined ? telemetry.odometer + ' km' : 'N/A'}</p>`;
        html += `<p><strong>Motor Temperature:</strong> ${telemetry.motor_temperature || 'N/A'}°C</p>`;
        html += '</div>';

        if (telemetry.error_codes && telemetry.error_codes.length > 0) {
            html += '<div class="detail-section">';
            html += '<h4>Error Codes</h4>';
            html += '<ul>';
            telemetry.error_codes.forEach(code => {
                html += `<li>${code}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        html += '</div>';

        ModalComponent.show('Telemetry Detail', html);
    }

    function init() {
        $('#telemetry-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'telemetry.csv'));
    }

    return { init, onNavigate: load };
})();
