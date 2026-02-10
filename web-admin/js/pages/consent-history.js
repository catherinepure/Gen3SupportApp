/**
 * Consent History Page
 * View user acceptance records with filtering and export
 */

const ConsentHistoryPage = (() => {
    const { $, toast, formatDateTime, languageName, loading, emptyState, errorState } = Utils;

    function init() {
        console.log('[consent-history] Initializing page module');
    }

    async function onNavigate() {
        console.log('[consent-history] Loading page');
        render();
        await loadConsentHistory();
    }

    function render() {
        const user = State.get('user');
        const isAdmin = user?.user_level === 'admin';
        const region = user?.detected_region || 'US';

        const html = `
            <div class="page-header">
                <h2>Consent History</h2>
                <p class="text-secondary">View T&C acceptance records${isAdmin ? '' : ` for ${region}`}</p>
                <div class="page-actions">
                    <button class="btn btn-outline" id="export-csv-btn">
                        &#8681; Export CSV
                    </button>
                </div>
            </div>

            <div class="card mb-4">
                <div class="card-header">
                    <h3>Filters</h3>
                </div>
                <div class="card-body">
                    <form id="filterForm" class="form-row">
                        <div class="form-group">
                            <label>Version</label>
                            <input type="text" class="form-control" name="version"
                                   placeholder="e.g., 1.0">
                        </div>
                        <div class="form-group">
                            <label>User Email</label>
                            <input type="email" class="form-control" name="user_email"
                                   placeholder="user@example.com">
                        </div>
                        ${isAdmin ? `
                        <div class="form-group">
                            <label>Region</label>
                            <select class="form-control" name="region">
                                <option value="">All Regions</option>
                                <option value="US">United States</option>
                                <option value="GB">United Kingdom</option>
                                <option value="EU">Europe</option>
                                <option value="CN">China</option>
                            </select>
                        </div>
                        ` : ''}
                        <div class="form-group">
                            <label>Status</label>
                            <select class="form-control" name="accepted">
                                <option value="">All</option>
                                <option value="true" selected>Accepted</option>
                                <option value="false">Declined</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>&nbsp;</label>
                            <button type="submit" class="btn btn-primary btn-block">
                                &#128269; Search
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h3>Acceptance Records</h3>
                </div>
                <div class="card-body">
                    <div id="consentTable">${loading()}</div>
                </div>
            </div>
        `;

        $('#consent-history-page').innerHTML = html;

        // Attach event handlers
        $('#filterForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            loadConsentHistory();
        });

        $('#export-csv-btn')?.addEventListener('click', exportCSV);
    }

    async function loadConsentHistory() {
        try {
            const form = $('#filterForm');
            const formData = new FormData(form);
            const sessionToken = State.get('sessionToken');

            // Build query parameters
            const params = new URLSearchParams({
                session_token: sessionToken,
                limit: '100',
                offset: '0'
            });

            // Add filters if provided
            if (formData.get('version')) {
                params.append('version', formData.get('version'));
            }
            if (formData.get('region')) {
                params.append('region', formData.get('region'));
            }

            // Call edge function
            const response = await fetch(
                `${API.baseUrl}/terms/acceptance-history?${params}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }

            const result = await response.json();
            let records = result.records || [];

            // Client-side filtering for user email (edge function doesn't support this)
            const userEmail = formData.get('user_email');
            if (userEmail) {
                records = records.filter(r =>
                    r.users?.email?.toLowerCase().includes(userEmail.toLowerCase())
                );
            }

            // Client-side filtering for acceptance status
            const acceptedFilter = formData.get('accepted');
            if (acceptedFilter) {
                const acceptedValue = acceptedFilter === 'true';
                records = records.filter(r => r.accepted === acceptedValue);
            }

            renderConsentTable(records);

        } catch (error) {
            console.error('[consent-history] Error loading history:', error);
            const table = $('#consentTable');
            if (table) {
                table.innerHTML = errorState('Error loading history: ' + error.message);
            }
        }
    }

    function renderConsentTable(records) {
        if (records.length === 0) {
            $('#consentTable').innerHTML = emptyState('No records found');
            return;
        }

        const tableHtml = `
            <div class="table-responsive">
                <table class="table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>User</th>
                            <th>Version</th>
                            <th>Language</th>
                            <th>Region</th>
                            <th>Status</th>
                            <th>Read Time</th>
                            <th>Scrolled</th>
                            <th>Device</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${records.map(record => `
                            <tr>
                                <td>
                                    <small>${formatDateTime(record.accepted_at)}</small>
                                </td>
                                <td>
                                    <div>
                                        <strong>${record.users?.first_name || ''} ${record.users?.last_name || ''}</strong>
                                    </div>
                                    <small class="text-secondary">${record.users?.email || 'N/A'}</small>
                                </td>
                                <td><span class="badge badge-info">${record.version}</span></td>
                                <td>${languageName(record.language_code)}</td>
                                <td>${record.region_code}</td>
                                <td>
                                    ${record.accepted
                                        ? '<span class="badge badge-active">Accepted</span>'
                                        : '<span class="badge badge-danger">Declined</span>'}
                                </td>
                                <td>
                                    ${record.time_to_read_seconds
                                        ? `${Math.floor(record.time_to_read_seconds / 60)}m ${record.time_to_read_seconds % 60}s`
                                        : 'N/A'}
                                </td>
                                <td>
                                    ${record.scrolled_to_bottom
                                        ? '<span class="text-active">&#10003;</span>'
                                        : '<span class="text-danger">&#10007;</span>'}
                                </td>
                                <td>
                                    <small class="text-secondary" title="${record.user_agent || 'N/A'}">
                                        ${extractDeviceInfo(record.device_info, record.user_agent)}
                                    </small>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="text-secondary small mt-2">
                Showing ${records.length} record${records.length === 1 ? '' : 's'}
            </div>
        `;

        $('#consentTable').innerHTML = tableHtml;
    }

    async function exportCSV() {
        try {
            const form = $('#filterForm');
            const formData = new FormData(form);
            const sessionToken = State.get('sessionToken');

            // Build query parameters
            const params = new URLSearchParams({
                session_token: sessionToken,
                limit: '1000',  // Export more records
                offset: '0'
            });

            if (formData.get('version')) {
                params.append('version', formData.get('version'));
            }
            if (formData.get('region')) {
                params.append('region', formData.get('region'));
            }

            // Fetch data
            const response = await fetch(
                `${API.baseUrl}/terms/acceptance-history?${params}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': API.anonKey,
                        'Authorization': `Bearer ${API.anonKey}`,
                        'X-Session-Token': sessionToken
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();
            let records = result.records || [];

            // Apply client-side filters
            const userEmail = formData.get('user_email');
            if (userEmail) {
                records = records.filter(r =>
                    r.users?.email?.toLowerCase().includes(userEmail.toLowerCase())
                );
            }

            const acceptedFilter = formData.get('accepted');
            if (acceptedFilter) {
                const acceptedValue = acceptedFilter === 'true';
                records = records.filter(r => r.accepted === acceptedValue);
            }

            // Generate CSV
            const csv = generateCSV(records);

            // Download
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `consent-history-${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            toast('CSV exported successfully', 'success');

        } catch (error) {
            console.error('[consent-history] Export error:', error);
            toast('Export failed: ' + error.message, 'error');
        }
    }

    function generateCSV(records) {
        const headers = [
            'Date',
            'User Email',
            'User Name',
            'Version',
            'Language',
            'Region',
            'Document Type',
            'Accepted',
            'Read Time (seconds)',
            'Scrolled to Bottom',
            'IP Address',
            'Device Info'
        ];

        const rows = records.map(r => [
            r.accepted_at,
            r.users?.email || '',
            `${r.users?.first_name || ''} ${r.users?.last_name || ''}`.trim(),
            r.version,
            r.language_code,
            r.region_code,
            r.document_type,
            r.accepted ? 'Yes' : 'No',
            r.time_to_read_seconds || '',
            r.scrolled_to_bottom ? 'Yes' : 'No',
            r.ip_address || '',
            r.device_info || ''
        ]);

        // Escape CSV values
        const escape = (val) => {
            if (val === null || val === undefined) return '';
            const str = String(val);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const csvContent = [
            headers.map(escape).join(','),
            ...rows.map(row => row.map(escape).join(','))
        ].join('\n');

        return csvContent;
    }

    function extractDeviceInfo(deviceInfo, userAgent) {
        if (deviceInfo) {
            try {
                const info = JSON.parse(deviceInfo);
                return `${info.manufacturer || ''} ${info.model || ''}`.trim() || 'Unknown';
            } catch (e) {
                return deviceInfo.substring(0, 20);
            }
        }
        if (userAgent) {
            // Extract basic info from user agent
            if (userAgent.includes('Android')) return 'Android';
            if (userAgent.includes('iPhone')) return 'iPhone';
            if (userAgent.includes('iPad')) return 'iPad';
            return 'Unknown';
        }
        return 'N/A';
    }

    return {
        init,
        onNavigate
    };
})();
