/** Logs Page */
const LogsPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#logs-content').innerHTML = Utils.loading();
            const result = await API.call('logs', 'list', { limit: 50 });
            currentData = result.logs || result.data || [];
            TableComponent.render('#logs-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#logs-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'logs.csv')); }
    return { init, onNavigate: load };
})();
