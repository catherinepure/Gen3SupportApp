/** Validation Page */
const ValidationPage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#validation-content').innerHTML = Utils.loading();
            const result = await API.call('validation', 'list', { limit: 50 });
            currentData = result.validation || result.data || [];
            TableComponent.render('#validation-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#validation-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'validation.csv')); }
    return { init, onNavigate: load };
})();
