/**
 * API Keys Page — Key management + Usage analytics
 * Two tabs: Keys (CRUD table) and Usage (analytics dashboard)
 */
const ApiKeysPage = (() => {
    let currentPage = 1;
    let usagePage = 1;
    const PAGE_SIZE = 25;
    let activeTab = 'keys';
    let scopePresets = {};
    let validScopes = [];

    function init() {
        console.log('[api-keys] Initializing page module');
    }

    async function onNavigate() {
        render();
        bindEvents();
        // Load scopes/presets once
        if (validScopes.length === 0) {
            try {
                const result = await API.call('api-keys', 'scopes');
                validScopes = result.valid_scopes || [];
                scopePresets = result.presets || {};
            } catch (_) { /* fallback to empty */ }
        }
        if (activeTab === 'keys') {
            await loadKeys();
        } else {
            await loadUsage();
        }
    }

    function onLeave() {}

    // ============================================================
    // Main Render
    // ============================================================

    function render() {
        const container = document.querySelector('#api-keys-page');
        if (!container) return;

        container.innerHTML = `
            <div class="page-header">
                <h2>API Keys</h2>
                <div class="page-actions">
                    <button class="btn btn-primary" id="api-keys-action-btn">
                        ${activeTab === 'keys' ? 'Generate New Key' : 'Refresh'}
                    </button>
                </div>
            </div>
            <div class="tab-bar" style="margin-bottom: 20px;">
                <button class="tab-btn ${activeTab === 'keys' ? 'active' : ''}" data-tab="keys">Keys</button>
                <button class="tab-btn ${activeTab === 'usage' ? 'active' : ''}" data-tab="usage">Usage</button>
            </div>
            <div id="api-keys-content"></div>
        `;
    }

    function bindEvents() {
        const actionBtn = document.querySelector('#api-keys-action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                if (activeTab === 'keys') showGenerateForm();
                else loadUsage();
            });
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                activeTab = btn.dataset.tab;
                render();
                bindEvents();
                if (activeTab === 'keys') await loadKeys();
                else await loadUsage();
            });
        });
    }

    // ============================================================
    // Keys Tab
    // ============================================================

    async function loadKeys() {
        const content = document.querySelector('#api-keys-content');
        if (!content) return;

        content.innerHTML = Utils.loading('Loading API keys...');

        try {
            const offset = (currentPage - 1) * PAGE_SIZE;
            const result = await API.call('api-keys', 'list', {
                limit: PAGE_SIZE,
                offset
            });

            const keys = result.api_keys || [];
            const total = result.total || 0;

            if (keys.length === 0) {
                content.innerHTML = Utils.emptyState('No API keys created yet. Click "Generate New Key" to get started.');
                return;
            }

            renderKeysTable(keys, total);
        } catch (err) {
            content.innerHTML = Utils.errorState('Failed to load API keys: ' + err.message);
        }
    }

    function renderKeysTable(keys, total) {
        const content = document.querySelector('#api-keys-content');
        if (!content) return;

        const totalPages = Math.ceil(total / PAGE_SIZE);

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Key Prefix</th>
                        <th>Name</th>
                        <th>Organisation</th>
                        <th>Type</th>
                        <th>Scopes</th>
                        <th>Rate Limit</th>
                        <th>Status</th>
                        <th>Last Used</th>
                        <th>Requests</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const k of keys) {
            const typeBadge = formatOrgType(k.organisation_type);
            const statusBadge = k.is_active
                ? '<span class="badge badge-active">Active</span>'
                : '<span class="badge badge-danger">Revoked</span>';
            const scopeCount = (k.scopes || []).length;
            const lastUsed = k.last_used_at
                ? (Utils.formatDate ? Utils.formatDate(k.last_used_at) : new Date(k.last_used_at).toLocaleDateString())
                : 'Never';
            const orgName = k.org_name || '-';

            html += `
                <tr>
                    <td><code style="font-size:0.85em">${escapeHtml(k.key_prefix)}...</code></td>
                    <td><strong class="key-name-link" data-id="${k.id}" style="cursor:pointer;color:var(--color-accent)">${escapeHtml(k.name)}</strong></td>
                    <td>${escapeHtml(orgName)}</td>
                    <td>${typeBadge}</td>
                    <td><span class="badge badge-info">${scopeCount} scopes</span></td>
                    <td>${k.rate_limit_per_minute}/min</td>
                    <td>${statusBadge}</td>
                    <td>${lastUsed}</td>
                    <td>${(k.request_count || 0).toLocaleString()}</td>
                    <td class="action-cell">
                        ${k.is_active ? `
                            <button class="btn btn-xs btn-primary key-edit-btn" data-id="${k.id}" title="Edit">Edit</button>
                            <button class="btn btn-xs btn-warning key-rotate-btn" data-id="${k.id}" title="Rotate Key">Rotate</button>
                            <button class="btn btn-xs btn-danger key-revoke-btn" data-id="${k.id}" data-name="${escapeHtml(k.name)}" title="Revoke">Revoke</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table>';

        if (totalPages > 1) {
            html += `<div class="pagination">`;
            if (currentPage > 1) html += `<button class="btn btn-sm btn-secondary" id="keys-prev">Previous</button>`;
            html += `<span class="pagination-info">Page ${currentPage} of ${totalPages} (${total} total)</span>`;
            if (currentPage < totalPages) html += `<button class="btn btn-sm btn-secondary" id="keys-next">Next</button>`;
            html += `</div>`;
        }

        content.innerHTML = html;

        // Bind clicks
        content.querySelectorAll('.key-name-link').forEach(link => {
            link.addEventListener('click', () => showKeyDetail(link.dataset.id));
        });
        content.querySelectorAll('.key-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); showEditForm(btn.dataset.id); });
        });
        content.querySelectorAll('.key-rotate-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); handleRotateKey(btn.dataset.id); });
        });
        content.querySelectorAll('.key-revoke-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); handleRevokeKey(btn.dataset.id, btn.dataset.name); });
        });

        const prevBtn = content.querySelector('#keys-prev');
        if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; loadKeys(); });
        const nextBtn = content.querySelector('#keys-next');
        if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadKeys(); });
    }

    // ============================================================
    // Generate Key Form
    // ============================================================

    async function showGenerateForm() {
        // Load distributors and workshops for the dropdown
        let distributors = [];
        let workshops = [];
        try {
            const [distResult, wsResult] = await Promise.all([
                API.call('distributors', 'list', { limit: 100 }),
                API.call('workshops', 'list', { limit: 100 })
            ]);
            distributors = distResult.distributors || [];
            workshops = wsResult.workshops || [];
        } catch (_) { /* proceed without org lists */ }

        const distOptions = distributors.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
        const wsOptions = workshops.map(w => `<option value="${w.id}">${escapeHtml(w.name)}</option>`).join('');

        const scopeCheckboxes = validScopes.map(s =>
            `<label style="display:inline-block;margin-right:12px;margin-bottom:4px">
                <input type="checkbox" class="scope-cb" value="${s}"> ${s}
            </label>`
        ).join('');

        const html = `
            <form id="generate-key-form" class="form-grid">
                <div class="form-group">
                    <label>Key Name <span class="required">*</span></label>
                    <input type="text" id="gen-name" placeholder="e.g. Production API Key for Distributor X" required maxlength="100">
                </div>
                <div class="form-group">
                    <label>Organisation Type <span class="required">*</span></label>
                    <select id="gen-org-type" required>
                        <option value="manufacturer">Manufacturer (Pure)</option>
                        <option value="distributor">Distributor</option>
                        <option value="workshop">Workshop</option>
                        <option value="custom">Custom</option>
                    </select>
                </div>
                <div class="form-group" id="gen-org-group" style="display:none">
                    <label>Organisation <span class="required">*</span></label>
                    <select id="gen-org-id">
                        <option value="">Select...</option>
                        <optgroup label="Distributors" id="gen-org-dist">${distOptions}</optgroup>
                        <optgroup label="Workshops" id="gen-org-ws">${wsOptions}</optgroup>
                    </select>
                </div>
                <div class="form-group">
                    <label>Scopes</label>
                    <div id="gen-scopes" style="max-height:200px;overflow-y:auto;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-size:0.9em">
                        ${scopeCheckboxes}
                    </div>
                    <small style="color:var(--text-secondary)">Pre-filled from type preset. Adjust as needed.</small>
                </div>
                <div class="form-group">
                    <label>Rate Limit (req/min)</label>
                    <input type="number" id="gen-rate-limit" value="60" min="1" max="1000">
                </div>
                <div class="form-group">
                    <label>Expires At (optional)</label>
                    <input type="date" id="gen-expires">
                </div>
            </form>
        `;

        const actions = [
            { label: 'Cancel', class: 'btn-secondary', onClick: () => ModalComponent.close() },
            { label: 'Generate Key', class: 'btn-primary', onClick: () => handleGenerateKey() }
        ];

        ModalComponent.show('Generate New API Key', html, actions);

        // Bind org type change
        const orgTypeSelect = document.querySelector('#gen-org-type');
        orgTypeSelect.addEventListener('change', () => {
            updateOrgDropdown();
            updateScopePreset();
        });

        // Initialize
        updateOrgDropdown();
        updateScopePreset();
    }

    function updateOrgDropdown() {
        const type = document.querySelector('#gen-org-type').value;
        const orgGroup = document.querySelector('#gen-org-group');
        const distGroup = document.querySelector('#gen-org-dist');
        const wsGroup = document.querySelector('#gen-org-ws');

        if (type === 'distributor' || type === 'workshop') {
            orgGroup.style.display = '';
            distGroup.style.display = type === 'distributor' ? '' : 'none';
            wsGroup.style.display = type === 'workshop' ? '' : 'none';
        } else {
            orgGroup.style.display = 'none';
        }
    }

    function updateScopePreset() {
        const type = document.querySelector('#gen-org-type').value;
        const preset = scopePresets[type] || [];
        document.querySelectorAll('.scope-cb').forEach(cb => {
            cb.checked = preset.includes(cb.value);
        });
    }

    async function handleGenerateKey() {
        const name = document.querySelector('#gen-name')?.value?.trim();
        const organisationType = document.querySelector('#gen-org-type')?.value;
        const organisationId = document.querySelector('#gen-org-id')?.value || null;
        const rateLimitStr = document.querySelector('#gen-rate-limit')?.value;
        const expiresStr = document.querySelector('#gen-expires')?.value;
        const scopes = Array.from(document.querySelectorAll('.scope-cb:checked')).map(cb => cb.value);

        if (!name) return alert('Name is required');
        if ((organisationType === 'distributor' || organisationType === 'workshop') && !organisationId) {
            return alert('Please select an organisation');
        }

        try {
            const params = {
                name,
                organisation_type: organisationType,
                scopes,
                rate_limit_per_minute: parseInt(rateLimitStr) || 60,
            };
            if (organisationId) params.organisation_id = organisationId;
            if (expiresStr) params.expires_at = new Date(expiresStr).toISOString();

            const result = await API.call('api-keys', 'generate', params);

            ModalComponent.close();

            // Show the key (ONCE only)
            showNewKeyModal(result.key, result.key_record);
        } catch (err) {
            alert('Failed to generate key: ' + err.message);
        }
    }

    function showNewKeyModal(fullKey, keyRecord) {
        const html = `
            <div style="text-align:center;padding:16px 0">
                <div style="background:var(--bg-secondary);border:2px solid var(--color-accent);border-radius:8px;padding:16px;margin:16px 0">
                    <code id="new-key-display" style="font-size:1.1em;word-break:break-all;user-select:all">${escapeHtml(fullKey)}</code>
                </div>
                <button class="btn btn-sm btn-primary" id="copy-key-btn" style="margin:8px 0">Copy to Clipboard</button>
                <p style="color:var(--color-warning);font-weight:600;margin-top:12px">
                    &#9888; This key will only be shown once. Copy it now!
                </p>
                <p style="font-size:0.9em;color:var(--text-secondary)">
                    Key: <code>${escapeHtml(keyRecord.key_prefix)}...</code> | Name: ${escapeHtml(keyRecord.name)}
                </p>
            </div>
        `;

        const actions = [
            { label: 'Done', class: 'btn-primary', onClick: () => { ModalComponent.close(); loadKeys(); } }
        ];

        ModalComponent.show('API Key Generated', html, actions);

        document.querySelector('#copy-key-btn')?.addEventListener('click', () => {
            navigator.clipboard.writeText(fullKey).then(() => {
                const btn = document.querySelector('#copy-key-btn');
                if (btn) { btn.textContent = 'Copied!'; btn.disabled = true; }
            });
        });
    }

    // ============================================================
    // Key Detail
    // ============================================================

    async function showKeyDetail(keyId) {
        try {
            const result = await API.call('api-keys', 'get', { id: keyId });
            const k = result.api_key;
            const usage = result.usage_24h;

            const scopeBadges = (k.scopes || []).map(s =>
                `<span class="badge badge-info" style="margin:2px">${escapeHtml(s)}</span>`
            ).join('');

            const html = `
                <div class="detail-grid">
                    ${detailRow('Key Prefix', `<code>${escapeHtml(k.key_prefix)}...</code>`)}
                    ${detailRow('Name', escapeHtml(k.name))}
                    ${detailRow('Organisation', escapeHtml(k.org_name || '-'))}
                    ${detailRow('Type', formatOrgType(k.organisation_type))}
                    ${detailRow('Status', k.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-danger">Revoked</span>')}
                    ${detailRow('Rate Limit', `${k.rate_limit_per_minute} req/min`)}
                    ${detailRow('Total Requests', (k.request_count || 0).toLocaleString())}
                    ${detailRow('Last Used', k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Never')}
                    ${detailRow('Created', new Date(k.created_at).toLocaleString())}
                    ${k.expires_at ? detailRow('Expires', new Date(k.expires_at).toLocaleString()) : ''}
                    ${detailRow('Scopes', scopeBadges || 'None')}
                    <hr style="margin:12px 0;border-color:var(--border-color)">
                    <h4 style="margin-bottom:8px">Last 24 Hours</h4>
                    ${detailRow('Requests', usage.requests)}
                    ${detailRow('Errors', usage.errors)}
                    ${detailRow('Error Rate', usage.error_rate)}
                </div>
            `;

            const actions = [
                { label: 'Close', class: 'btn-secondary', onClick: () => ModalComponent.close() }
            ];

            ModalComponent.show('API Key Details', html, actions);
        } catch (err) {
            alert('Failed to load key details: ' + err.message);
        }
    }

    // ============================================================
    // Edit Key
    // ============================================================

    async function showEditForm(keyId) {
        try {
            const result = await API.call('api-keys', 'get', { id: keyId });
            const k = result.api_key;

            const scopeCheckboxes = validScopes.map(s =>
                `<label style="display:inline-block;margin-right:12px;margin-bottom:4px">
                    <input type="checkbox" class="edit-scope-cb" value="${s}" ${(k.scopes || []).includes(s) ? 'checked' : ''}> ${s}
                </label>`
            ).join('');

            const html = `
                <form id="edit-key-form" class="form-grid">
                    <div class="form-group">
                        <label>Name</label>
                        <input type="text" id="edit-name" value="${escapeHtml(k.name)}" maxlength="100">
                    </div>
                    <div class="form-group">
                        <label>Scopes</label>
                        <div style="max-height:200px;overflow-y:auto;padding:8px;border:1px solid var(--border-color);border-radius:6px;font-size:0.9em">
                            ${scopeCheckboxes}
                        </div>
                    </div>
                    <div class="form-group">
                        <label>Rate Limit (req/min)</label>
                        <input type="number" id="edit-rate-limit" value="${k.rate_limit_per_minute}" min="1" max="1000">
                    </div>
                    <div class="form-group">
                        <label>Expires At</label>
                        <input type="date" id="edit-expires" value="${k.expires_at ? k.expires_at.substring(0, 10) : ''}">
                    </div>
                </form>
            `;

            const actions = [
                { label: 'Cancel', class: 'btn-secondary', onClick: () => ModalComponent.close() },
                { label: 'Save Changes', class: 'btn-primary', onClick: () => handleUpdateKey(keyId) }
            ];

            ModalComponent.show('Edit API Key', html, actions);
        } catch (err) {
            alert('Failed to load key: ' + err.message);
        }
    }

    async function handleUpdateKey(keyId) {
        const name = document.querySelector('#edit-name')?.value?.trim();
        const rateLimitStr = document.querySelector('#edit-rate-limit')?.value;
        const expiresStr = document.querySelector('#edit-expires')?.value;
        const scopes = Array.from(document.querySelectorAll('.edit-scope-cb:checked')).map(cb => cb.value);

        try {
            const params = { id: keyId, scopes, rate_limit_per_minute: parseInt(rateLimitStr) || 60 };
            if (name) params.name = name;
            if (expiresStr) params.expires_at = new Date(expiresStr).toISOString();
            else params.expires_at = null;

            await API.call('api-keys', 'update', params);
            ModalComponent.close();
            await loadKeys();
        } catch (err) {
            alert('Failed to update key: ' + err.message);
        }
    }

    // ============================================================
    // Rotate Key
    // ============================================================

    async function handleRotateKey(keyId) {
        if (!confirm('This will deactivate the current key and generate a new one. The old key will stop working immediately. Continue?')) return;

        try {
            const result = await API.call('api-keys', 'rotate', { id: keyId });
            showNewKeyModal(result.key, result.key_record);
        } catch (err) {
            alert('Failed to rotate key: ' + err.message);
        }
    }

    // ============================================================
    // Revoke Key
    // ============================================================

    async function handleRevokeKey(keyId, keyName) {
        if (!confirm(`Revoke key "${keyName}"? This action is immediate and cannot be undone.`)) return;

        try {
            await API.call('api-keys', 'revoke', { id: keyId });
            await loadKeys();
        } catch (err) {
            alert('Failed to revoke key: ' + err.message);
        }
    }

    // ============================================================
    // Usage Tab
    // ============================================================

    async function loadUsage() {
        const content = document.querySelector('#api-keys-content');
        if (!content) return;

        content.innerHTML = Utils.loading('Loading usage analytics...');

        try {
            // Get all keys for the selector
            const keysResult = await API.call('api-keys', 'list', { limit: 100 });
            const keys = keysResult.api_keys || [];

            renderUsageControls(keys);
            await loadUsageData(null); // All keys by default
        } catch (err) {
            content.innerHTML = Utils.errorState('Failed to load usage data: ' + err.message);
        }
    }

    function renderUsageControls(keys) {
        const content = document.querySelector('#api-keys-content');
        if (!content) return;

        const keyOptions = keys.map(k =>
            `<option value="${k.id}">${escapeHtml(k.key_prefix)}... — ${escapeHtml(k.name)}</option>`
        ).join('');

        content.innerHTML = `
            <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
                <div>
                    <label style="font-size:0.85em;color:var(--text-secondary)">API Key</label>
                    <select id="usage-key-select" style="margin-left:8px">
                        <option value="">All Keys</option>
                        ${keyOptions}
                    </select>
                </div>
                <div>
                    <label style="font-size:0.85em;color:var(--text-secondary)">From</label>
                    <input type="date" id="usage-from" value="${new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10)}" style="margin-left:8px">
                </div>
                <div>
                    <label style="font-size:0.85em;color:var(--text-secondary)">To</label>
                    <input type="date" id="usage-to" value="${new Date().toISOString().substring(0, 10)}" style="margin-left:8px">
                </div>
                <button class="btn btn-sm btn-primary" id="usage-refresh-btn">Load</button>
            </div>
            <div id="usage-summary" style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap"></div>
            <div id="usage-table"></div>
        `;

        document.querySelector('#usage-refresh-btn')?.addEventListener('click', () => {
            const keyId = document.querySelector('#usage-key-select')?.value || null;
            loadUsageData(keyId);
        });
    }

    async function loadUsageData(keyId) {
        const summaryEl = document.querySelector('#usage-summary');
        const tableEl = document.querySelector('#usage-table');
        if (!summaryEl || !tableEl) return;

        const from = document.querySelector('#usage-from')?.value;
        const to = document.querySelector('#usage-to')?.value;

        if (!keyId) {
            // If no key selected, show per-key summary
            summaryEl.innerHTML = Utils.loading('');
            tableEl.innerHTML = '';

            try {
                const keysResult = await API.call('api-keys', 'list', { limit: 100 });
                const keys = keysResult.api_keys || [];

                summaryEl.innerHTML = `
                    ${statCard('Total Keys', keys.length)}
                    ${statCard('Active Keys', keys.filter(k => k.is_active).length)}
                    ${statCard('Total Requests', keys.reduce((sum, k) => sum + (k.request_count || 0), 0).toLocaleString())}
                `;

                // Show recent usage across all keys
                let html = `
                    <h4 style="margin-bottom:8px">Key Summary</h4>
                    <table class="data-table">
                        <thead><tr>
                            <th>Key</th><th>Name</th><th>Type</th><th>Requests</th><th>Last Used</th><th>Status</th>
                        </tr></thead><tbody>
                `;
                for (const k of keys) {
                    html += `<tr>
                        <td><code>${escapeHtml(k.key_prefix)}...</code></td>
                        <td>${escapeHtml(k.name)}</td>
                        <td>${formatOrgType(k.organisation_type)}</td>
                        <td>${(k.request_count || 0).toLocaleString()}</td>
                        <td>${k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                        <td>${k.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-danger">Revoked</span>'}</td>
                    </tr>`;
                }
                html += '</tbody></table>';
                tableEl.innerHTML = html;
            } catch (err) {
                summaryEl.innerHTML = Utils.errorState('Failed: ' + err.message);
            }
            return;
        }

        // Specific key usage
        summaryEl.innerHTML = Utils.loading('');
        tableEl.innerHTML = '';

        try {
            const result = await API.call('api-keys', 'usage', {
                api_key_id: keyId,
                from: from ? new Date(from).toISOString() : undefined,
                to: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
            });

            const u = result.usage;

            summaryEl.innerHTML = `
                ${statCard('Total Requests', u.total_requests)}
                ${statCard('Errors', u.total_errors)}
                ${statCard('Error Rate', u.error_rate)}
                ${statCard('Avg Response', u.avg_response_time_ms + 'ms')}
            `;

            // Top endpoints
            let html = '';
            if (u.top_endpoints && u.top_endpoints.length > 0) {
                html += `<h4 style="margin-bottom:8px">Top Endpoints</h4>
                    <table class="data-table"><thead><tr><th>Endpoint</th><th>Count</th></tr></thead><tbody>`;
                for (const ep of u.top_endpoints) {
                    html += `<tr><td>${escapeHtml(ep.endpoint)}</td><td>${ep.count}</td></tr>`;
                }
                html += '</tbody></table>';
            }

            // Daily breakdown
            if (u.daily && Object.keys(u.daily).length > 0) {
                html += `<h4 style="margin-top:20px;margin-bottom:8px">Daily Breakdown</h4>
                    <table class="data-table"><thead><tr><th>Date</th><th>Requests</th><th>Errors</th></tr></thead><tbody>`;
                const sorted = Object.entries(u.daily).sort((a, b) => b[0].localeCompare(a[0]));
                for (const [day, data] of sorted) {
                    html += `<tr><td>${day}</td><td>${data.requests}</td><td>${data.errors}</td></tr>`;
                }
                html += '</tbody></table>';
            }

            tableEl.innerHTML = html || '<p style="color:var(--text-secondary)">No usage data in this period.</p>';
        } catch (err) {
            summaryEl.innerHTML = Utils.errorState('Failed: ' + err.message);
        }
    }

    // ============================================================
    // Helpers
    // ============================================================

    function statCard(label, value) {
        return `<div style="background:var(--bg-secondary);border-radius:8px;padding:16px 24px;min-width:140px;text-align:center">
            <div style="font-size:1.5em;font-weight:700;color:var(--text-primary)">${value}</div>
            <div style="font-size:0.85em;color:var(--text-secondary)">${label}</div>
        </div>`;
    }

    function detailRow(label, value) {
        return `<div style="display:flex;padding:6px 0;border-bottom:1px solid var(--border-color)">
            <div style="width:140px;font-weight:600;color:var(--text-secondary);flex-shrink:0">${label}</div>
            <div style="flex:1">${value}</div>
        </div>`;
    }

    function formatOrgType(type) {
        const map = {
            manufacturer: '<span class="badge badge-active">Manufacturer</span>',
            distributor: '<span class="badge badge-info">Distributor</span>',
            workshop: '<span class="badge badge-warning">Workshop</span>',
            custom: '<span class="badge badge-secondary">Custom</span>',
        };
        return map[type] || type;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    }

    return { init, onNavigate, onLeave };
})();
