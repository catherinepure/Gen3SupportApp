/** Workshops Page */
const WorkshopsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#workshops-content').innerHTML = Utils.loading();
            const result = await API.call('workshops', 'list', { limit: 50 });
            currentData = result.workshops || result.data || [];

            TableComponent.render('#workshops-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'service_area_countries', label: 'Service Areas', format: (val) => Array.isArray(val) ? val.join(', ') : val || 'N/A' },
                { key: 'phone', label: 'Phone', format: (val) => val || 'N/A' },
                { key: 'email', label: 'Email' },
                { key: 'parent_distributor_id', label: 'Parent Distributor', format: (val) => val ? 'Linked' : 'Independent' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showWorkshopDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#workshops-content').innerHTML = Utils.errorState('Failed to load workshops');
        }
    }

    function showWorkshopDetail(workshop) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Workshop Information</h4>';
        html += `<p><strong>Name:</strong> ${workshop.name}</p>`;
        html += `<p><strong>Email:</strong> ${workshop.email || 'N/A'}</p>`;
        html += `<p><strong>Phone:</strong> ${workshop.phone || 'N/A'}</p>`;
        html += `<p><strong>Status:</strong> ${workshop.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
        html += `<p><strong>Type:</strong> ${workshop.parent_distributor_id ? 'Linked to Distributor' : 'Independent'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Service Coverage</h4>';
        if (workshop.service_area_countries && workshop.service_area_countries.length > 0) {
            html += '<p><strong>Countries:</strong></p><ul>';
            workshop.service_area_countries.forEach(country => {
                html += `<li>${country}</li>`;
            });
            html += '</ul>';
        } else {
            html += '<p>No service areas defined</p>';
        }
        html += '</div>';

        if (workshop.parent_distributor_id) {
            html += '<div class="detail-section">';
            html += '<h4>Parent Distributor</h4>';
            html += `<p><strong>ID:</strong> ${workshop.parent_distributor_id}</p>`;
            html += '</div>';
        }

        html += '<div class="detail-section">';
        html += '<h4>Timestamps</h4>';
        html += `<p><strong>Created:</strong> ${formatDate(workshop.created_at)}</p>`;
        html += `<p><strong>Updated:</strong> ${formatDate(workshop.updated_at)}</p>`;
        html += '</div>';

        html += '</div>';

        ModalComponent.show('Workshop Detail', html);
    }

    function init() {
        $('#workshops-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'workshops.csv'));
    }

    return { init, onNavigate: load };
})();
