/** Workshops Page */
const WorkshopsPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#workshops-content').innerHTML = Utils.loading();
            const result = await API.call('workshops', 'list', { limit: 50 });
            currentData = result.workshops || result.data || [];
            TableComponent.render('#workshops-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#workshops-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'workshops.csv')); }
    return { init, onNavigate: load };
})();
