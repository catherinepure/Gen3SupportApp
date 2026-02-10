/** Validation Page */
const ValidationPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];

    async function load() {
        try {
            $('#validation-content').innerHTML = Utils.loading();

            // Try to get previous results first
            const result = await API.call('validation', 'list', { limit: 50 });
            currentData = result.validation || result.data || [];

            if (currentData.length > 0) {
                renderResults();
            } else {
                renderEmpty();
            }
        } catch {
            // If 'list' action isn't supported, show the run-checks UI
            renderEmpty();
        }
    }

    function renderEmpty() {
        $('#validation-content').innerHTML = `
            <div class="empty-state">
                <div class="icon">&#10003;</div>
                <h3>Data Validation</h3>
                <p>Run checks to find orphaned scooters, expired sessions, stale service jobs, and other data issues.</p>
                <div class="flex-center flex-wrap gap-3">
                    <button class="btn btn-primary" id="run-all-inline">Run All Checks</button>
                    <button class="btn btn-secondary" id="run-orphaned">Orphaned Scooters</button>
                    <button class="btn btn-secondary" id="run-sessions">Expired Sessions</button>
                    <button class="btn btn-secondary" id="run-stale">Stale Jobs</button>
                </div>
            </div>
        `;
        attachRunButtons();
    }

    function attachRunButtons() {
        $('#run-all-inline')?.addEventListener('click', () => runCheck('run-all'));
        $('#run-orphaned')?.addEventListener('click', () => runCheck('orphaned-scooters'));
        $('#run-sessions')?.addEventListener('click', () => runCheck('expired-sessions'));
        $('#run-stale')?.addEventListener('click', () => runCheck('stale-jobs'));
    }

    async function runCheck(action) {
        try {
            $('#validation-content').innerHTML = Utils.loading('Running validation checks...');
            const result = await API.call('validation', action, {});

            // The result could be a single check or multiple
            if (result.results && Array.isArray(result.results)) {
                currentData = result.results;
            } else {
                currentData = [result];
            }

            renderResults();
            toast('Validation checks completed', 'success');
        } catch (err) {
            toast(err.message, 'error');
            renderEmpty();
        }
    }

    function renderResults() {
        let html = '<div class="mb-4 inline-flex gap-3">';
        html += '<button class="btn btn-primary btn-sm" id="rerun-all">Re-run All Checks</button>';
        html += '</div>';

        html += '<div class="flex-col gap-4">';

        currentData.forEach((check, idx) => {
            const statusColor = {
                'passed': '#22c55e',
                'warning': '#f59e0b',
                'failed': '#ef4444'
            }[check.status] || '#94a3b8';

            const statusIcon = {
                'passed': '&#10003;',
                'warning': '&#9888;',
                'failed': '&#10007;'
            }[check.status] || '&#8226;';

            html += `
                <div class="check-card" style="border-left: 4px solid ${statusColor};" data-index="${idx}">
                    <div class="flex-header">
                        <div class="inline-flex gap-3">
                            <span style="color: ${statusColor}; font-size: 1.2em;">${statusIcon}</span>
                            <div>
                                <div class="font-bold">${formatCheckType(check.check_type || check.action || 'Check')}</div>
                                <div class="text-sm text-muted">${check.records_checked || 0} records checked</div>
                            </div>
                        </div>
                        <div class="text-center">
                            <div class="font-bold" style="font-size: 1.4em; color: ${statusColor};">${check.issues_found || 0}</div>
                            <div class="text-xs text-muted">issues</div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        $('#validation-content').innerHTML = html;

        // Attach handlers
        $('#rerun-all')?.addEventListener('click', () => runCheck('run-all'));

        document.querySelectorAll('.check-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.dataset.index);
                showCheckDetail(currentData[idx]);
            });
        });
    }

    function showCheckDetail(check) {
        const sections = [
            {
                title: 'Validation Check',
                fields: [
                    { label: 'Check Type', value: formatCheckType(check.check_type || check.action || 'Unknown') },
                    { label: 'Status', value: check.status, type: 'badge-status' },
                    { label: 'Records Checked', value: check.records_checked || 0 },
                    { label: 'Issues Found', value: check.issues_found || 0 },
                    { label: 'Duration', value: check.duration_ms ? check.duration_ms + 'ms' : 'N/A' },
                    { label: 'Run At', value: check.timestamp || check.created_at, type: 'date' }
                ]
            }
        ];

        // Issues list
        if (check.issues && check.issues.length > 0) {
            let issueHtml = '<div style="max-height: 300px; overflow: auto;">';
            check.issues.forEach(issue => {
                const severity = issue.severity || 'error';
                const color = severity === 'warning' ? '#f59e0b' : '#ef4444';
                issueHtml += `<div class="issue-item" style="border-left: 3px solid ${color};">
                    <strong style="color: ${color};">${severity.toUpperCase()}</strong>: ${issue.message || issue}
                </div>`;
            });
            issueHtml += '</div>';
            sections.push({ title: 'Issues', html: issueHtml });
        }

        // Details
        if (check.details) {
            sections.push({
                title: 'Details',
                html: `<pre class="scrollable-pre">${JSON.stringify(check.details, null, 2)}</pre>`
            });
        }

        DetailModal.show('Validation Detail', {
            sections,
            breadcrumbs: [
                { label: 'Validation', onClick: () => { ModalComponent.close(); } },
                { label: formatCheckType(check.check_type || 'Check') }
            ]
        });
    }

    function formatCheckType(type) {
        if (!type) return 'Unknown';
        return type.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function init() {
        $('#validation-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'validation-results.csv'));
        $('#validation-run-all-btn')?.addEventListener('click', () => runCheck('run-all'));
    }

    function onNavigate() {
        RefreshController.attach('#validation-content', load);
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
