/** Events Page */
const EventsPage = (() => {
    const { $, toast, exportCSV, formatDate, debounce } = Utils;
    let currentData = [];
    let typeFilter = '';
    let searchTerm = '';
    let currentPage = 1;
    let totalRecords = 0;
    const PAGE_SIZE = 50;

    async function load() {
        try {
            $('#events-content').innerHTML = Utils.loading();

            const offset = (currentPage - 1) * PAGE_SIZE;
            const params = { limit: PAGE_SIZE, offset };
            if (typeFilter) {
                params.event_type = typeFilter;
            }

            const result = await API.call('events', 'list', params);
            const rawData = result.events || result.data || [];
            totalRecords = result.total || rawData.length;

            // Client-side search filter within current page
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                currentData = rawData.filter(e => {
                    const searchable = [
                        e.event_type,
                        e.country,
                        e.device_type,
                        e.user_id,
                        e.scooter_id
                    ].filter(Boolean).join(' ').toLowerCase();
                    return searchable.includes(term);
                });
            } else {
                currentData = rawData;
            }

            renderTable();
        } catch (err) {
            toast(err.message, 'error');
            $('#events-content').innerHTML = Utils.errorState('Failed to load events');
        }
    }

    function renderTable() {
        const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

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
            onRowClick: showEventDetail,
            pagination: totalPages > 1 ? {
                current: currentPage,
                total: totalPages,
                pageSize: PAGE_SIZE,
                totalRecords
            } : null,
            onPageChange: (page) => {
                currentPage = page;
                load();
            }
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
                html: `<pre class="scrollable-pre">${JSON.stringify(event.payload, null, 2)}</pre>`
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

    const debouncedLoad = debounce(() => {
        load();
    }, 300);

    function init() {
        $('#events-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'events.csv'));

        const typeEl = $('#events-type-filter');
        if (typeEl) {
            typeEl.addEventListener('change', (e) => {
                typeFilter = e.target.value;
                currentPage = 1;
                load();
            });
        }

        const searchEl = $('#events-search');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                searchTerm = e.target.value.trim();
                debouncedLoad();
            });
        }
    }

    function onNavigate() {
        RefreshController.attach('#events-content', load);
        currentPage = 1;
        typeFilter = '';
        searchTerm = '';
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
