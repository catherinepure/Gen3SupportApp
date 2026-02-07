/** Events Page */
const EventsPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#events-content').innerHTML = Utils.loading();
            const result = await API.call('events', 'list', { limit: 50 });
            currentData = result.events || result.data || [];
            TableComponent.render('#events-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#events-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'events.csv')); }
    return { init, onNavigate: load };
})();
