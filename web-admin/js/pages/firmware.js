/** Firmware Page */
const FirmwarePage = (() => {
    const { $, toast, exportCSV } = Utils;
    let currentData = [];
    async function load() {
        try {
            $('#firmware-content').innerHTML = Utils.loading();
            const result = await API.call('firmware', 'list', { limit: 50 });
            currentData = result.firmware || result.data || [];
            TableComponent.render('#firmware-content', currentData, [
                { key: 'id', label: 'ID' }
            ], { onRowClick: (d) => ModalComponent.show('Detail', '<pre>' + JSON.stringify(d, null, 2) + '</pre>') });
        } catch (err) { toast(err.message, 'error'); }
    }
    function init() { $('#firmware-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'firmware.csv')); }
    return { init, onNavigate: load };
})();
