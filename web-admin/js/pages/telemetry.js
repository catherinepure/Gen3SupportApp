/** Telemetry Page */
const TelemetryPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#telemetry-content').innerHTML = Utils.loading();
            const result = await API.call('telemetry', 'list', { limit: 50 });
            currentData = result.telemetry || result.data || [];
            TableComponent.render('#telemetry-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#telemetry-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'telemetry.csv')); }
    return { init, onNavigate: load };
})();
