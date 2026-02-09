/** Events Page */
const EventsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#events-content').innerHTML = Utils.loading();
            const result = await API.call('events', 'list', { limit: 50 });
            currentData = result.events || result.data || [];

            TableComponent.render('#events-content', currentData, [
                { key: 'event_type', label: 'Event Type', format: (val) => `<span class="badge badge-primary">${val || 'Unknown'}</span>` },
                { key: 'user_id', label: 'User', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'scooter_id', label: 'Scooter', format: (val) => val ? val.substring(0, 8) + '...' : 'N/A' },
                { key: 'country', label: 'Country' },
                { key: 'timestamp', label: 'Timestamp', format: formatDate },
                { key: 'device_type', label: 'Device', format: (val) => val || 'N/A' }
            ], {
                onRowClick: showEventDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#events-content').innerHTML = Utils.errorState('Failed to load events');
        }
    }

    function showEventDetail(event) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Event Information</h4>';
        html += `<p><strong>Type:</strong> <span class="badge badge-primary">${event.event_type}</span></p>`;
        html += `<p><strong>Timestamp:</strong> ${formatDate(event.timestamp)}</p>`;
        html += `<p><strong>Country:</strong> ${event.country || 'N/A'}</p>`;
        html += `<p><strong>Device:</strong> ${event.device_type || 'N/A'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Related Entities</h4>';
        html += `<p><strong>User ID:</strong> ${event.user_id || 'N/A'}</p>`;
        html += `<p><strong>Scooter ID:</strong> ${event.scooter_id || 'N/A'}</p>`;
        html += `<p><strong>Distributor ID:</strong> ${event.distributor_id || 'N/A'}</p>`;
        html += `<p><strong>Workshop ID:</strong> ${event.workshop_id || 'N/A'}</p>`;
        html += '</div>';

        if (event.payload) {
            html += '<div class="detail-section">';
            html += '<h4>Event Payload</h4>';
            html += `<pre>${JSON.stringify(event.payload, null, 2)}</pre>`;
            html += '</div>';
        }

        if (event.app_version) {
            html += '<div class="detail-section">';
            html += '<h4>App Info</h4>';
            html += `<p><strong>Version:</strong> ${event.app_version}</p>`;
            html += '</div>';
        }

        html += '</div>';

        ModalComponent.show('Event Detail', html);
    }

    function init() {
        $('#events-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'events.csv'));
    }

    return { init, onNavigate: load };
})();
