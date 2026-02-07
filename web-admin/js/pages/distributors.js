/** Distributors Page */
const DistributorsPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#distributors-content').innerHTML = Utils.loading();
            const result = await API.call('distributors', 'list', { limit: 50 });
            currentData = result.distributors || [];
            TableComponent.render('#distributors-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'countries', label: 'Countries', format: 'array' },
                { key: 'phone', label: 'Phone' },
                { key: 'email', label: 'Email' }
            ], { onRowClick: (d) => ModalComponent.show('Distributor', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#distributors-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'distributors.csv')); }
    return { init, onNavigate: load };
})();
