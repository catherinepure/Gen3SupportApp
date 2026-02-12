/**
 * Live Runs Page
 * Global view of ride recording sessions and diagnostic requests.
 * Two tabs: Ride Sessions | Diagnostic Requests
 */
const LiveRunsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;

    let activeTab = 'sessions';
    let sessionsData = [];
    let sessionsPage = 1;
    let sessionsTotal = 0;
    const PAGE_SIZE = 50;
    let sessionsFilters = {};

    // ========================================================================
    // Tab switching
    // ========================================================================

    function switchTab(tab) {
        activeTab = tab;

        // Update tab button styles
        const sessionsBtn = $('#tab-sessions');
        const diagBtn = $('#tab-diagnostics');
        if (sessionsBtn) sessionsBtn.className = tab === 'sessions' ? 'btn btn-primary' : 'btn btn-secondary';
        if (diagBtn) diagBtn.className = tab === 'diagnostics' ? 'btn btn-primary' : 'btn btn-secondary';

        // Show/hide content
        const sessionsContent = $('#live-runs-sessions');
        const diagContent = $('#live-runs-diagnostics');
        if (sessionsContent) sessionsContent.style.display = tab === 'sessions' ? 'block' : 'none';
        if (diagContent) diagContent.style.display = tab === 'diagnostics' ? 'block' : 'none';

        if (tab === 'sessions') {
            loadSessions();
        } else {
            loadDiagnostics();
        }
    }

    // ========================================================================
    // Ride Sessions Tab
    // ========================================================================

    async function loadSessions() {
        const container = $('#live-runs-sessions');
        if (!container) return;
        container.innerHTML = Utils.loading('Loading ride sessions...');

        try {
            const offset = (sessionsPage - 1) * PAGE_SIZE;

            // Build query — join scooter serial
            let url = `${API.supabaseUrl}/rest/v1/ride_sessions?select=*,scooters(zyd_serial,serial_number)&order=started_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;

            // Apply filters
            if (sessionsFilters.trigger_type) {
                url += `&trigger_type=eq.${sessionsFilters.trigger_type}`;
            }
            if (sessionsFilters.status) {
                url += `&status=eq.${sessionsFilters.status}`;
            }
            if (sessionsFilters.search) {
                // Search by scooter serial — need to use scooters.zyd_serial
                url += `&scooters.zyd_serial=ilike.*${encodeURIComponent(sessionsFilters.search)}*`;
            }

            // Get total count
            const countUrl = url.replace(`&limit=${PAGE_SIZE}&offset=${offset}`, '') + '&select=id';
            const [dataResp, countResp] = await Promise.all([
                fetch(url, {
                    headers: {
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                    }
                }),
                fetch(countUrl.replace('select=*,scooters(zyd_serial,serial_number)', 'select=id'), {
                    headers: {
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'Prefer': 'count=exact',
                        'Range-Unit': 'items',
                        'Range': '0-0',
                    }
                })
            ]);

            if (!dataResp.ok) throw new Error('Failed to load ride sessions');

            sessionsData = await dataResp.json();

            // Parse content-range header for total count
            const contentRange = countResp.headers.get('content-range');
            if (contentRange) {
                const match = contentRange.match(/\/(\d+)/);
                if (match) sessionsTotal = parseInt(match[1]);
            } else {
                sessionsTotal = sessionsData.length;
            }

            renderSessionsTable();
        } catch (err) {
            container.innerHTML = Utils.errorState('Failed to load ride sessions');
            toast(err.message, 'error');
        }
    }

    function renderSessionsTable() {
        const container = $('#live-runs-sessions');
        if (!container) return;

        if (sessionsData.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No ride sessions recorded yet.</p><p class="text-muted">Sessions appear here when users record rides from the app.</p></div>';
            return;
        }

        const totalPages = Math.ceil(sessionsTotal / PAGE_SIZE);

        TableComponent.render('#live-runs-sessions', sessionsData, [
            { key: 'scooters', label: 'Scooter', format: (val) => {
                if (val?.zyd_serial) return val.zyd_serial;
                if (val?.serial_number) return val.serial_number;
                return '-';
            }},
            { key: 'trigger_type', label: 'Trigger', format: (val) => {
                if (val === 'diagnostic') return '<span class="badge badge-warning">diagnostic</span>';
                return '<span class="badge badge-inactive">manual</span>';
            }},
            { key: 'started_at', label: 'Started', format: formatDate },
            { key: 'ended_at', label: 'Duration', format: (val, row) => {
                if (!row.started_at || !val) return '-';
                const secs = Math.round((new Date(val) - new Date(row.started_at)) / 1000);
                return `${Math.floor(secs / 60)}m ${secs % 60}s`;
            }},
            { key: 'sample_count', label: 'Samples', format: (val) => val || 0 },
            { key: 'status', label: 'Status', format: (val) => {
                if (val === 'uploaded') return '<span class="badge badge-active">uploaded</span>';
                if (val === 'recording') return '<span class="badge badge-warning">recording</span>';
                return `<span class="badge badge-inactive">${val}</span>`;
            }}
        ], {
            onRowClick: (row) => RideSessionViewer.show(row.id),
            emptyMessage: 'No ride sessions found',
            pagination: totalPages > 1 ? {
                current: sessionsPage,
                total: totalPages,
                pageSize: PAGE_SIZE,
                totalRecords: sessionsTotal
            } : null,
            onPageChange: (page) => {
                sessionsPage = page;
                loadSessions();
            }
        });
    }

    // ========================================================================
    // Diagnostic Requests Tab
    // ========================================================================

    async function loadDiagnostics() {
        const container = $('#live-runs-diagnostics');
        if (!container) return;
        container.innerHTML = Utils.loading('Loading diagnostic requests...');

        try {
            // Fetch active diagnostic requests + recent diagnostic sessions in parallel
            const [activeResp, recentResp] = await Promise.all([
                fetch(`${API.supabaseUrl}/rest/v1/scooters?diagnostic_requested=eq.true&select=id,zyd_serial,serial_number,diagnostic_config,diagnostic_requested_at,diagnostic_requested_by`, {
                    headers: { 'apikey': API.anonKey, 'Authorization': `Bearer ${API.anonKey}` }
                }),
                fetch(`${API.supabaseUrl}/rest/v1/ride_sessions?trigger_type=eq.diagnostic&order=started_at.desc&limit=20&select=*,scooters(zyd_serial,serial_number)`, {
                    headers: { 'apikey': API.anonKey, 'Authorization': `Bearer ${API.anonKey}` }
                })
            ]);

            const activeRequests = activeResp.ok ? await activeResp.json() : [];
            const recentSessions = recentResp.ok ? await recentResp.json() : [];

            renderDiagnostics(container, activeRequests, recentSessions);
        } catch (err) {
            container.innerHTML = Utils.errorState('Failed to load diagnostics');
            toast(err.message, 'error');
        }
    }

    function renderDiagnostics(container, activeRequests, recentSessions) {
        let html = '';

        // --- Active Requests ---
        html += `<h3 style="margin-bottom: 12px;">Active Requests (${activeRequests.length})</h3>`;

        if (activeRequests.length === 0) {
            html += '<div class="empty-state" style="padding: 16px;"><p class="text-muted">No active diagnostic requests.</p></div>';
        } else {
            html += `<table class="data-table" style="margin-bottom: 24px;">
                <thead><tr>
                    <th>Scooter</th>
                    <th>Reason</th>
                    <th>Duration</th>
                    <th>Requested</th>
                    <th>Actions</th>
                </tr></thead><tbody>`;

            activeRequests.forEach(s => {
                const serial = s.zyd_serial || s.serial_number || s.id.substring(0, 8);
                const config = s.diagnostic_config || {};
                const reason = config.reason || '-';
                const duration = config.max_duration_minutes ? `${config.max_duration_minutes} min` : '-';

                html += `<tr>
                    <td><code>${serial}</code></td>
                    <td>${reason}</td>
                    <td>${duration}</td>
                    <td>${formatDate(s.diagnostic_requested_at)}</td>
                    <td>
                        <button class="btn btn-sm btn-danger" onclick="LiveRunsPage.cancelDiagnostic('${s.id}')">Cancel</button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table>';
        }

        // --- Recent Completions ---
        html += `<h3 style="margin-bottom: 12px;">Recent Diagnostic Sessions (${recentSessions.length})</h3>`;

        if (recentSessions.length === 0) {
            html += '<div class="empty-state" style="padding: 16px;"><p class="text-muted">No diagnostic sessions recorded yet.</p></div>';
        } else {
            html += `<table class="data-table">
                <thead><tr>
                    <th>Scooter</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Samples</th>
                    <th>Status</th>
                    <th></th>
                </tr></thead><tbody>`;

            recentSessions.forEach(s => {
                const serial = s.scooters?.zyd_serial || s.scooters?.serial_number || '-';
                const duration = s.started_at && s.ended_at
                    ? Math.round((new Date(s.ended_at) - new Date(s.started_at)) / 1000)
                    : 0;
                const durationStr = duration > 0 ? `${Math.floor(duration / 60)}m ${duration % 60}s` : '-';
                const statusBadge = s.status === 'uploaded'
                    ? '<span class="badge badge-active">uploaded</span>'
                    : `<span class="badge badge-warning">${s.status}</span>`;

                html += `<tr style="cursor:pointer;" onclick="RideSessionViewer.show('${s.id}')">
                    <td><code>${serial}</code></td>
                    <td>${formatDate(s.started_at)}</td>
                    <td>${durationStr}</td>
                    <td>${s.sample_count || 0}</td>
                    <td>${statusBadge}</td>
                    <td><button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); RideSessionViewer.show('${s.id}')">View</button></td>
                </tr>`;
            });

            html += '</tbody></table>';
        }

        container.innerHTML = html;
    }

    async function cancelDiagnostic(scooterId) {
        if (!confirm('Cancel the diagnostic request for this scooter?')) return;

        try {
            const response = await fetch(`${API.baseUrl}/update-scooter`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${API.anonKey}`,
                    'apikey': API.anonKey,
                },
                body: JSON.stringify({
                    action: 'clear-diagnostic',
                    session_token: API.getSessionToken(),
                    scooter_id: scooterId,
                    declined: false
                })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to cancel diagnostic');
            }

            toast('Diagnostic request cancelled', 'success');
            loadDiagnostics();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ========================================================================
    // Init / Navigation
    // ========================================================================

    function init() {
        // Tab click handlers
        $('#tab-sessions')?.addEventListener('click', () => switchTab('sessions'));
        $('#tab-diagnostics')?.addEventListener('click', () => switchTab('diagnostics'));

        // New Request button
        $('#live-runs-new-request')?.addEventListener('click', () => {
            DiagnosticHelper.showRequestWithPicker(() => {
                if (activeTab === 'diagnostics') loadDiagnostics();
            });
        });

        // Filters
        let searchTimeout;
        $('#live-runs-search')?.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                sessionsFilters.search = $('#live-runs-search').value.trim() || undefined;
                sessionsPage = 1;
                loadSessions();
            }, 500);
        });

        $('#live-runs-trigger-filter')?.addEventListener('change', () => {
            sessionsFilters.trigger_type = $('#live-runs-trigger-filter').value || undefined;
            sessionsPage = 1;
            loadSessions();
        });

        $('#live-runs-status-filter')?.addEventListener('change', () => {
            sessionsFilters.status = $('#live-runs-status-filter').value || undefined;
            sessionsPage = 1;
            loadSessions();
        });

        // Export
        $('#live-runs-export-btn')?.addEventListener('click', () => {
            exportCSV(sessionsData, 'ride-sessions.csv');
        });
    }

    function onNavigate() {
        RefreshController.attach('#live-runs-sessions', loadSessions);
        activeTab = 'sessions';
        sessionsPage = 1;
        sessionsFilters = {};
        switchTab('sessions');
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave, cancelDiagnostic };
})();
