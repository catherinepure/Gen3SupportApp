/** Service Jobs Page */
const ServiceJobsPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#service-jobs-content').innerHTML = Utils.loading();
            const result = await API.call('service-jobs', 'list', { limit: 50 });
            currentData = result.service-jobs || result.data || [];
            TableComponent.render('#service-jobs-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#service-jobs-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'service-jobs.csv')); }
    return { init, onNavigate: load };
})();
