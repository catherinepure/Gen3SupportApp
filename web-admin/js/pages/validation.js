/** Validation Page */
const ValidationPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#validation-content').innerHTML = Utils.loading();
            const result = await API.call('validation', 'list', { limit: 50 });
            currentData = result.validation || result.data || [];

            TableComponent.render('#validation-content', currentData, [
                { key: 'check_type', label: 'Check Type', format: (val) => val || 'N/A' },
                { key: 'status', label: 'Status', format: (val) => {
                    const badges = {
                        'passed': 'badge-success',
                        'failed': 'badge-danger',
                        'warning': 'badge-warning',
                        'running': 'badge-active'
                    };
                    const badgeClass = badges[val] || 'badge-inactive';
                    return `<span class="badge ${badgeClass}">${val || 'Unknown'}</span>`;
                }},
                { key: 'issues_found', label: 'Issues', format: (val) => val || 0 },
                { key: 'records_checked', label: 'Records', format: (val) => val || 0 },
                { key: 'timestamp', label: 'Run At', format: formatDate }
            ], {
                onRowClick: showValidationDetail
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#validation-content').innerHTML = Utils.errorState('Failed to load validation results');
        }
    }

    function showValidationDetail(validation) {
        let html = '<div class="detail-grid">';

        html += '<div class="detail-section">';
        html += '<h4>Validation Check</h4>';
        html += `<p><strong>Check Type:</strong> ${validation.check_type || 'N/A'}</p>`;
        html += `<p><strong>Status:</strong> ${getStatusBadge(validation.status)}</p>`;
        html += `<p><strong>Run At:</strong> ${formatDate(validation.timestamp)}</p>`;
        html += '</div>';

        html += '<div class="detail-section">';
        html += '<h4>Results</h4>';
        html += `<p><strong>Records Checked:</strong> ${validation.records_checked || 0}</p>`;
        html += `<p><strong>Issues Found:</strong> ${validation.issues_found || 0}</p>`;
        html += `<p><strong>Duration:</strong> ${validation.duration_ms ? validation.duration_ms + 'ms' : 'N/A'}</p>`;
        html += '</div>';

        if (validation.issues && validation.issues.length > 0) {
            html += '<div class="detail-section">';
            html += '<h4>Issues</h4>';
            html += '<ul>';
            validation.issues.forEach(issue => {
                html += `<li><strong>${issue.severity || 'Error'}:</strong> ${issue.message || issue}</li>`;
            });
            html += '</ul>';
            html += '</div>';
        }

        if (validation.details) {
            html += '<div class="detail-section">';
            html += '<h4>Details</h4>';
            html += `<pre>${JSON.stringify(validation.details, null, 2)}</pre>`;
            html += '</div>';
        }

        html += '</div>';

        ModalComponent.show('Validation Detail', html);
    }

    function getStatusBadge(status) {
        const badges = {
            'passed': 'badge-success',
            'failed': 'badge-danger',
            'warning': 'badge-warning',
            'running': 'badge-active'
        };
        const badgeClass = badges[status] || 'badge-inactive';
        return `<span class="badge ${badgeClass}">${status || 'Unknown'}</span>`;
    }

    function init() {
        $('#validation-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'validation-results.csv'));
    }

    return { init, onNavigate: load };
})();
