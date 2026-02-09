/** Events Page */
const EventsPage = (() => {
    const { $, toast, exportCSV, formatDate, debounce } = Utils;
    let currentData = [];
    let allData = [];
    let typeFilter = '';
    let searchTerm = '';

    async function load() {
        try {
            $('#events-content').innerHTML = Utils.loading();
            const result = await API.call('events', 'list', { limit: 100 });
            allData = result.events || result.data || [];
            applyFilters();
        } catch (err) {
            toast(err.message, 'error');
            $('#events-content').innerHTML = Utils.errorState('Failed to load events');
        }
    }

    function applyFilters() {
        currentData = allData.filter(e => {
            if (typeFilter && e.event_type !== typeFilter) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                const searchable = [
                    e.event_type,
                    e.country,
                    e.device_type,
                    e.user_id,
                    e.scooter_id
                ].filter(Boolean).join(' ').toLowerCase();
                if (!searchable.includes(term)) return false;
            }
            return true;
        });
        renderTable();
    }

    function renderTable() {
        TableComponent.render('#events-content', currentData, [
            { key: 'event_type', label: 'Event Type', format: (val) => {
                return `<span class="badge badge-primary">${formatEventType(val)}</span>`;
            }},
            { key: 'user_id', label: 'User', format: (val) => val ? val.substring(0, 8) + '...' : '-' },
            { key: 'scooter_id', label: 'Scooter', format: (val) => val ? val.substring(0, 8) + '...' : '-' },
            { key: 'country', label: 'Country', format: (val) => val || '-' },
            { key: 'device_type', label: 'Device', format: (val) => val || '-' },
            { key: 'timestamp', label: 'Timestamp', format: formatDate }
        ], {
            onRowClick: showEventDetail
        });
    }

    function showEventDetail(event) {
        const sections = [
            {
                title: 'Event Information',
                fields: [
                    { label: 'Type', value: event.event_type, type: 'badge-status' },
                    { label: 'Timestamp', value: event.timestamp, type: 'date' },
                    { label: 'Country', value: event.country || 'N/A' },
                    { label: 'Device', value: event.device_type || 'N/A' },
                    { label: 'App Version', value: event.app_version || 'N/A' }
                ]
            },
            {
                title: 'Related Entities',
                fields: [
                    { label: 'User ID', value: event.user_id, type: 'code' },
                    { label: 'Scooter ID', value: event.scooter_id, type: 'code' },
                    { label: 'Distributor ID', value: event.distributor_id, type: 'code' },
                    { label: 'Workshop ID', value: event.workshop_id, type: 'code' }
                ]
            }
        ];

        // Payload
        if (event.payload) {
            sections.push({
                title: 'Event Payload',
                html: `<pre style="max-height: 250px; overflow: auto; font-size: 0.85em;">${JSON.stringify(event.payload, null, 2)}</pre>`
            });
        }

        DetailModal.show('Event Detail', {
            sections,
            breadcrumbs: [
                { label: 'Events', onClick: () => { ModalComponent.close(); } },
                { label: formatEventType(event.event_type) }
            ]
        });
    }

    function formatEventType(type) {
        if (!type) return 'Unknown';
        return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    const debouncedFilter = debounce(() => {
        applyFilters();
    }, 300);

    function init() {
        $('#events-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'events.csv'));

        const typeEl = $('#events-type-filter');
        if (typeEl) {
            typeEl.addEventListener('change', (e) => {
                typeFilter = e.target.value;
                applyFilters();
            });
        }

        const searchEl = $('#events-search');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                searchTerm = e.target.value.trim();
                debouncedFilter();
            });
        }
    }

    return { init, onNavigate: load };
})();
