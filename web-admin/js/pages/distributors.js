/** Distributors Page */
const DistributorsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#distributors-content').innerHTML = Utils.loading();
            const result = await API.call('distributors', 'list', { limit: 50 });
            currentData = result.distributors || [];

            TableComponent.render('#distributors-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'countries', label: 'Countries', format: 'array' },
                { key: 'phone', label: 'Phone', format: (val) => val || 'N/A' },
                { key: 'email', label: 'Email', format: (val) => val || 'N/A' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showDistributorDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#distributors-content').innerHTML = Utils.errorState('Failed to load distributors');
        }
    }

    function showDistributorDetail(distributor) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Distributor Information</h4>';
        html += `<p><strong>Name:</strong> ${distributor.name}</p>`;
        html += `<p><strong>Email:</strong> ${distributor.email || 'N/A'}</p>`;
        html += `<p><strong>Phone:</strong> ${distributor.phone || 'N/A'}</p>`;
        html += `<p><strong>Status:</strong> ${distributor.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Territory Coverage</h4>';
        if (distributor.countries && distributor.countries.length > 0) {
            html += '<p><strong>Countries:</strong></p><ul>';
            distributor.countries.forEach(country => {
                html += `<li>${country}</li>`;
            });
            html += '</ul>';
        } else {
            html += '<p>No countries assigned</p>';
        }
        html += '</div>';

        if (distributor.activation_code) {
            html += '<div class="detail-section">';
            html += '<h4>Activation Code</h4>';
            html += `<p><code>${distributor.activation_code}</code></p>`;
            html += '</div>';
        }

        html += '<div class="detail-section">';
        html += '<h4>Timestamps</h4>';
        html += `<p><strong>Created:</strong> ${formatDate(distributor.created_at)}</p>`;
        html += `<p><strong>Updated:</strong> ${formatDate(distributor.updated_at)}</p>`;
        html += '</div>';

        html += '</div>';

        ModalComponent.show('Distributor Detail', html);
    }

    function init() {
        $('#distributors-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'distributors.csv'));
    }

    return { init, onNavigate: load };
})();
