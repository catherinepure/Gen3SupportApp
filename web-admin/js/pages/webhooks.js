/**
 * Webhooks Page — Subscription management + Delivery log
 * Two tabs: Subscriptions (list + pause/resume/test) and Deliveries (audit log)
 */
const WebhooksPage = (() => {
    let activeTab = 'subscriptions';
    let selectedSubscription = null;
    let cachedSubscriptions = []; // Cache for URL lookup in deliveries

    function init() {
        console.log('[webhooks] Initializing page module');
    }

    async function onNavigate() {
        render();
        bindEvents();
        if (activeTab === 'subscriptions') {
            await loadSubscriptions();
        } else {
            await loadDeliveries();
        }
    }

    function onLeave() {
        selectedSubscription = null;
    }

    // ============================================================
    // Main Render
    // ============================================================

    function render() {
        const container = document.querySelector('#webhooks-page');
        if (!container) return;

        container.innerHTML = `
            <div class="page-header">
                <h2>Webhooks</h2>
                <div class="page-actions">
                    <button class="btn btn-secondary" id="webhooks-refresh-btn">Refresh</button>
                </div>
            </div>
            <div class="tab-bar" style="margin-bottom: 20px;">
                <button class="tab-btn ${activeTab === 'subscriptions' ? 'active' : ''}" data-tab="subscriptions">Subscriptions</button>
                <button class="tab-btn ${activeTab === 'deliveries' ? 'active' : ''}" data-tab="deliveries">Delivery Log</button>
            </div>
            <div id="webhooks-content"></div>
        `;
    }

    function bindEvents() {
        const refreshBtn = document.querySelector('#webhooks-refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (activeTab === 'subscriptions') loadSubscriptions();
                else loadDeliveries();
            });
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                activeTab = btn.dataset.tab;
                render();
                bindEvents();
                if (activeTab === 'subscriptions') await loadSubscriptions();
                else await loadDeliveries();
            });
        });
    }

    // ============================================================
    // Subscriptions Tab
    // ============================================================

    async function loadSubscriptions() {
        const content = document.querySelector('#webhooks-content');
        if (!content) return;

        content.innerHTML = '<div class="loading">Loading webhooks...</div>';

        try {
            const result = await API.call('webhooks', 'list');
            const webhooks = result.webhooks || [];
            cachedSubscriptions = webhooks; // Cache for delivery URL lookup

            if (webhooks.length === 0) {
                content.innerHTML = `
                    <div class="empty-state">
                        <p>No webhook subscriptions found.</p>
                        <p style="color: var(--gray-500); font-size: 0.875rem;">
                            Webhooks are created by API key holders via the Public REST API using the <code>webhooks:create</code> action.
                        </p>
                    </div>
                `;
                return;
            }

            // Stats summary
            const active = webhooks.filter(w => w.is_active && !w.paused_at).length;
            const paused = webhooks.filter(w => w.paused_at).length;
            const inactive = webhooks.filter(w => !w.is_active && !w.paused_at).length;

            let html = `
                <div class="stats-row" style="display: flex; gap: 16px; margin-bottom: 20px;">
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--success);">${active}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Active</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--warning);">${paused}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Paused</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--gray-400);">${inactive}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Inactive</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600;">${webhooks.length}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Total</div>
                    </div>
                </div>
            `;

            html += `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>URL</th>
                            <th>API Key</th>
                            <th>Event Types</th>
                            <th>Status</th>
                            <th>Failures</th>
                            <th>Last Success</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            for (const wh of webhooks) {
                const status = getStatusBadge(wh);
                const keyName = wh.api_keys ? `${wh.api_keys.name} (${wh.api_keys.key_prefix}...)` : 'Unknown';
                const eventTypes = wh.event_types && wh.event_types.length > 0
                    ? wh.event_types.map(t => `<span class="badge badge-sm">${t}</span>`).join(' ')
                    : '<span class="badge badge-sm badge-info">All events</span>';
                const lastSuccess = wh.last_success_at ? formatRelativeTime(wh.last_success_at) : 'Never';
                const failures = wh.consecutive_failures || 0;
                const failureClass = failures >= (wh.failure_threshold || 10) ? 'color: var(--danger); font-weight: 600;' : failures > 0 ? 'color: var(--warning);' : '';

                html += `
                    <tr class="wh-row" data-id="${wh.id}" style="cursor: pointer;" title="Click to view details">
                        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(wh.url)}">${escapeHtml(wh.url)}</td>
                        <td style="font-size: 0.8rem;">${escapeHtml(keyName)}</td>
                        <td>${eventTypes}</td>
                        <td>${status}</td>
                        <td style="${failureClass}">${failures}</td>
                        <td style="font-size: 0.8rem;">${lastSuccess}</td>
                        <td>
                            <div style="display: flex; gap: 4px;">
                                ${wh.paused_at
                                    ? `<button class="btn btn-sm btn-success wh-resume-btn" data-id="${wh.id}">Resume</button>`
                                    : wh.is_active
                                        ? `<button class="btn btn-sm btn-warning wh-pause-btn" data-id="${wh.id}">Pause</button>`
                                        : ''
                                }
                                <button class="btn btn-sm btn-primary wh-test-btn" data-id="${wh.id}" data-url="${escapeHtml(wh.url)}">Test</button>
                            </div>
                        </td>
                    </tr>
                `;
            }

            html += `</tbody></table>`;
            content.innerHTML = html;

            // Bind row click — clicking anywhere on the row opens the detail
            content.querySelectorAll('.wh-row').forEach(row => {
                row.addEventListener('click', (e) => {
                    // Don't trigger row click if a button was clicked
                    if (e.target.closest('button')) return;
                    showSubscriptionDetail(row.dataset.id);
                });
            });
            content.querySelectorAll('.wh-pause-btn').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); pauseSubscription(btn.dataset.id); });
            });
            content.querySelectorAll('.wh-resume-btn').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); resumeSubscription(btn.dataset.id); });
            });
            content.querySelectorAll('.wh-test-btn').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); testSubscription(btn.dataset.id, btn.dataset.url); });
            });

        } catch (err) {
            content.innerHTML = `<div class="error-state">Failed to load webhooks: ${err.message}</div>`;
        }
    }

    function getStatusBadge(wh) {
        if (wh.paused_at) return '<span class="badge badge-warning">Paused</span>';
        if (wh.is_active) return '<span class="badge badge-success">Active</span>';
        return '<span class="badge badge-secondary">Inactive</span>';
    }

    async function showSubscriptionDetail(id) {
        try {
            const result = await API.call('webhooks', 'get', { id });
            const wh = result.webhook;
            if (!wh) return;

            const stats = wh.delivery_stats_24h || {};
            const keyInfo = wh.api_keys ? `${wh.api_keys.name} (${wh.api_keys.key_prefix}..., ${wh.api_keys.organisation_type})` : 'Unknown';

            // Also load recent deliveries for this subscription inline
            let deliveriesHtml = '';
            try {
                const delResult = await API.call('webhooks', 'deliveries', { id, limit: 5 });
                const deliveries = delResult.deliveries || [];
                if (deliveries.length > 0) {
                    deliveriesHtml = `
                        <div class="detail-section">
                            <h4>Recent Deliveries</h4>
                            <table class="detail-table" style="width: 100%;">
                                <thead>
                                    <tr style="font-size: 0.75rem; color: var(--gray-500);">
                                        <th style="padding: 4px 8px;">Event Type</th>
                                        <th style="padding: 4px 8px;">Status</th>
                                        <th style="padding: 4px 8px;">HTTP</th>
                                        <th style="padding: 4px 8px;">Latency</th>
                                        <th style="padding: 4px 8px;">Time</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${deliveries.map(d => `
                                        <tr style="font-size: 0.8rem;">
                                            <td style="padding: 4px 8px;"><span class="badge badge-sm">${escapeHtml(d.request_payload?.event_type || '-')}</span></td>
                                            <td style="padding: 4px 8px;">${getDeliveryStatusBadge(d.status)}</td>
                                            <td style="padding: 4px 8px;">${d.response_status || '-'}</td>
                                            <td style="padding: 4px 8px;">${d.response_time_ms ? d.response_time_ms + 'ms' : '-'}</td>
                                            <td style="padding: 4px 8px;">${formatRelativeTime(d.created_at)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    `;
                } else {
                    deliveriesHtml = `
                        <div class="detail-section">
                            <h4>Recent Deliveries</h4>
                            <p style="color: var(--gray-400); font-size: 0.875rem;">No deliveries yet for this subscription.</p>
                        </div>
                    `;
                }
            } catch(e) {
                deliveriesHtml = '';
            }

            const bodyHtml = `
                <div style="display: grid; gap: 16px;">
                    <div class="detail-section">
                        <h4>Configuration</h4>
                        <table class="detail-table">
                            <tr><td><strong>URL</strong></td><td><code style="word-break: break-all;">${escapeHtml(wh.url)}</code></td></tr>
                            <tr><td><strong>Description</strong></td><td>${escapeHtml(wh.description || '-')}</td></tr>
                            <tr><td><strong>API Key</strong></td><td>${escapeHtml(keyInfo)}</td></tr>
                            <tr><td><strong>Event Types</strong></td><td>${wh.event_types && wh.event_types.length > 0 ? wh.event_types.map(t => `<span class="badge badge-sm">${t}</span>`).join(' ') : 'All partner events'}</td></tr>
                            <tr><td><strong>Timeout</strong></td><td>${wh.timeout_seconds || 10}s</td></tr>
                            <tr><td><strong>Max Retries</strong></td><td>${wh.max_retries || 3}</td></tr>
                            <tr><td><strong>Failure Threshold</strong></td><td>${wh.failure_threshold || 10}</td></tr>
                        </table>
                    </div>

                    <div class="detail-section">
                        <h4>Status</h4>
                        <table class="detail-table">
                            <tr><td><strong>Active</strong></td><td>${getStatusBadge(wh)}</td></tr>
                            <tr><td><strong>Consecutive Failures</strong></td><td>${wh.consecutive_failures || 0}</td></tr>
                            ${wh.paused_at ? `<tr><td><strong>Paused At</strong></td><td>${formatDate(wh.paused_at)}</td></tr>` : ''}
                            ${wh.paused_reason ? `<tr><td><strong>Pause Reason</strong></td><td>${escapeHtml(wh.paused_reason)}</td></tr>` : ''}
                            <tr><td><strong>Last Delivery</strong></td><td>${wh.last_delivery_at ? formatDate(wh.last_delivery_at) : 'Never'}</td></tr>
                            <tr><td><strong>Last Success</strong></td><td>${wh.last_success_at ? formatDate(wh.last_success_at) : 'Never'}</td></tr>
                            <tr><td><strong>Created</strong></td><td>${formatDate(wh.created_at)}</td></tr>
                        </table>
                    </div>

                    <div class="detail-section">
                        <h4>Deliveries (Last 24h)</h4>
                        <div style="display: flex; gap: 12px;">
                            <div style="text-align: center; padding: 8px 16px; background: var(--gray-50); border-radius: 6px;">
                                <div style="font-size: 1.25rem; font-weight: 600; color: var(--success);">${stats.sent || 0}</div>
                                <div style="font-size: 0.7rem; color: var(--gray-500);">Sent</div>
                            </div>
                            <div style="text-align: center; padding: 8px 16px; background: var(--gray-50); border-radius: 6px;">
                                <div style="font-size: 1.25rem; font-weight: 600; color: var(--danger);">${stats.failed || 0}</div>
                                <div style="font-size: 0.7rem; color: var(--gray-500);">Failed</div>
                            </div>
                            <div style="text-align: center; padding: 8px 16px; background: var(--gray-50); border-radius: 6px;">
                                <div style="font-size: 1.25rem; font-weight: 600; color: var(--warning);">${stats.retrying || 0}</div>
                                <div style="font-size: 0.7rem; color: var(--gray-500);">Retrying</div>
                            </div>
                            <div style="text-align: center; padding: 8px 16px; background: var(--gray-50); border-radius: 6px;">
                                <div style="font-size: 1.25rem; font-weight: 600; color: var(--info);">${stats.avg_response_ms || 0}ms</div>
                                <div style="font-size: 0.7rem; color: var(--gray-500);">Avg Response</div>
                            </div>
                        </div>
                    </div>

                    ${deliveriesHtml}

                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-primary" onclick="WebhooksPage.viewDeliveries('${wh.id}')">View Full Delivery Log</button>
                    </div>
                </div>
            `;

            ModalComponent.show('Webhook Details', bodyHtml);
        } catch (err) {
            ModalComponent.show('Error', `Failed to load webhook: ${err.message}`);
        }
    }

    async function pauseSubscription(id) {
        if (!confirm('Pause this webhook? It will stop receiving deliveries.')) return;
        try {
            await API.call('webhooks', 'pause', { id });
            await loadSubscriptions();
        } catch (err) {
            alert('Failed to pause: ' + err.message);
        }
    }

    async function resumeSubscription(id) {
        if (!confirm('Resume this webhook? It will start receiving deliveries again and the failure counter will be reset.')) return;
        try {
            await API.call('webhooks', 'resume', { id });
            await loadSubscriptions();
        } catch (err) {
            alert('Failed to resume: ' + err.message);
        }
    }

    async function testSubscription(id, url) {
        const btn = document.querySelector(`.wh-test-btn[data-id="${id}"]`);
        if (btn) { btn.disabled = true; btn.textContent = 'Testing...'; }

        try {
            const result = await API.call('webhooks', 'get', { id });
            const wh = result.webhook;

            ModalComponent.show('Test Result', `
                <div style="padding: 16px;">
                    <p><strong>URL:</strong> <code>${escapeHtml(url)}</code></p>
                    <p>A test delivery has been triggered. Check the Delivery Log tab for the result.</p>
                    <p style="color: var(--gray-500); font-size: 0.875rem;">
                        Note: Test deliveries are sent via the API key holder's Public API <code>webhooks:test</code> action.
                        The admin dashboard shows delivery results in the Delivery Log tab.
                    </p>
                </div>
            `);
        } catch (err) {
            ModalComponent.show('Test Failed', `Error: ${err.message}`);
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Test'; }
        }
    }

    // ============================================================
    // Deliveries Tab
    // ============================================================

    async function loadDeliveries(subscriptionId) {
        const content = document.querySelector('#webhooks-content');
        if (!content) return;

        // If called with a subscription ID, switch to deliveries tab and filter
        if (subscriptionId) {
            activeTab = 'deliveries';
            selectedSubscription = subscriptionId;
            render();
            bindEvents();
        }

        content.innerHTML = '<div class="loading">Loading deliveries...</div>';

        try {
            // First load stats
            const statsResult = await API.call('webhooks', 'stats');
            const stats = statsResult.stats || {};

            // Build stats row
            let html = `
                <div class="stats-row" style="display: flex; gap: 16px; margin-bottom: 20px;">
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--success);">${stats.deliveries_24h?.sent || 0}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Sent (24h)</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600; color: var(--danger);">${stats.deliveries_24h?.failed || 0}</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Failed (24h)</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600;">${stats.success_rate_24h || 100}%</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Success Rate</div>
                    </div>
                    <div class="stat-card" style="flex:1; padding: 12px 16px; background: var(--gray-50); border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: 600;">${stats.avg_response_ms_24h || 0}ms</div>
                        <div style="font-size: 0.75rem; color: var(--gray-500);">Avg Latency</div>
                    </div>
                </div>
            `;

            // Load deliveries — either filtered by subscription or all recent
            const deliveryParams = { limit: 50 };
            if (selectedSubscription) {
                deliveryParams.id = selectedSubscription;
            }
            const result = await API.call('webhooks', 'deliveries', deliveryParams);
            const deliveries = result.deliveries || [];

            // Filter bar
            if (selectedSubscription) {
                const subUrl = cachedSubscriptions.find(s => s.id === selectedSubscription)?.url || selectedSubscription.substring(0, 8) + '...';
                html += `
                    <div style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                        <button class="btn btn-sm btn-secondary" id="clear-filter-btn">Show All</button>
                        <span style="color: var(--gray-500); font-size: 0.875rem;">
                            Filtered: <strong>${escapeHtml(subUrl)}</strong> (${deliveries.length} of ${result.total || deliveries.length})
                        </span>
                    </div>
                `;
            } else {
                html += `
                    <div style="margin-bottom: 12px;">
                        <span style="color: var(--gray-500); font-size: 0.875rem;">
                            Showing ${deliveries.length} most recent deliveries across all subscriptions
                        </span>
                    </div>
                `;
            }

            if (deliveries.length === 0) {
                html += `<div class="empty-state"><p>No deliveries found.</p></div>`;
                content.innerHTML = html;
                document.querySelector('#clear-filter-btn')?.addEventListener('click', () => {
                    selectedSubscription = null;
                    loadDeliveries();
                });
                return;
            }

            html += `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Event Type</th>
                            <th>URL</th>
                            <th>Status</th>
                            <th>Response</th>
                            <th>Latency</th>
                            <th>Attempt</th>
                            <th>Time</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            for (const d of deliveries) {
                const eventType = d.request_payload?.event_type || '-';
                const statusBadge = getDeliveryStatusBadge(d.status);
                const responseCode = d.response_status ? `${d.response_status}` : '-';
                const latency = d.response_time_ms ? `${d.response_time_ms}ms` : '-';

                html += `
                    <tr class="delivery-row" data-payload='${escapeHtml(JSON.stringify(d))}' style="cursor: pointer;" title="Click to view details">
                        <td><span class="badge badge-sm">${escapeHtml(eventType)}</span></td>
                        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(d.request_url)}">${escapeHtml(d.request_url)}</td>
                        <td>${statusBadge}</td>
                        <td>${responseCode}</td>
                        <td>${latency}</td>
                        <td>${d.attempt_number || 1}</td>
                        <td style="font-size: 0.8rem;">${formatRelativeTime(d.created_at)}</td>
                    </tr>
                `;
            }

            html += `</tbody></table>`;
            content.innerHTML = html;

            // Bind clear filter
            document.querySelector('#clear-filter-btn')?.addEventListener('click', () => {
                selectedSubscription = null;
                loadDeliveries();
            });

            // Bind row clicks to show delivery detail
            content.querySelectorAll('.delivery-row').forEach(row => {
                row.addEventListener('click', () => {
                    try {
                        const data = JSON.parse(row.dataset.payload);
                        showDeliveryDetail(data);
                    } catch { /* */ }
                });
            });

        } catch (err) {
            content.innerHTML = `<div class="error-state">Failed to load deliveries: ${err.message}</div>`;
        }
    }

    function getDeliveryStatusBadge(status) {
        switch (status) {
            case 'sent':     return '<span class="badge badge-success">Sent</span>';
            case 'failed':   return '<span class="badge badge-danger">Failed</span>';
            case 'retrying': return '<span class="badge badge-warning">Retrying</span>';
            case 'pending':  return '<span class="badge badge-info">Pending</span>';
            default:         return `<span class="badge">${status}</span>`;
        }
    }

    function showDeliveryDetail(d) {
        const payload = d.request_payload ? JSON.stringify(d.request_payload, null, 2) : '-';

        const bodyHtml = `
            <div style="display: grid; gap: 16px;">
                <div class="detail-section">
                    <h4>Request</h4>
                    <table class="detail-table">
                        <tr><td><strong>URL</strong></td><td><code style="word-break: break-all;">${escapeHtml(d.request_url)}</code></td></tr>
                        <tr><td><strong>Event ID</strong></td><td><code>${d.event_id || '-'}</code></td></tr>
                    </table>
                    <div style="margin-top: 8px;">
                        <strong>Payload:</strong>
                        <pre style="background: var(--gray-50); padding: 12px; border-radius: 6px; font-size: 0.8rem; max-height: 200px; overflow: auto;">${escapeHtml(payload)}</pre>
                    </div>
                </div>

                <div class="detail-section">
                    <h4>Response</h4>
                    <table class="detail-table">
                        <tr><td><strong>Status</strong></td><td>${getDeliveryStatusBadge(d.status)}</td></tr>
                        <tr><td><strong>HTTP Code</strong></td><td>${d.response_status || '-'}</td></tr>
                        <tr><td><strong>Latency</strong></td><td>${d.response_time_ms ? d.response_time_ms + 'ms' : '-'}</td></tr>
                        <tr><td><strong>Attempt</strong></td><td>${d.attempt_number || 1}</td></tr>
                        ${d.error_message ? `<tr><td><strong>Error</strong></td><td style="color: var(--danger);">${escapeHtml(d.error_message)}</td></tr>` : ''}
                        ${d.next_retry_at ? `<tr><td><strong>Next Retry</strong></td><td>${formatDate(d.next_retry_at)}</td></tr>` : ''}
                    </table>
                    ${d.response_body ? `
                        <div style="margin-top: 8px;">
                            <strong>Response Body:</strong>
                            <pre style="background: var(--gray-50); padding: 12px; border-radius: 6px; font-size: 0.8rem; max-height: 150px; overflow: auto;">${escapeHtml(d.response_body)}</pre>
                        </div>
                    ` : ''}
                </div>

                <div class="detail-section">
                    <h4>Timing</h4>
                    <table class="detail-table">
                        <tr><td><strong>Created</strong></td><td>${formatDate(d.created_at)}</td></tr>
                        ${d.delivered_at ? `<tr><td><strong>Delivered</strong></td><td>${formatDate(d.delivered_at)}</td></tr>` : ''}
                    </table>
                </div>
            </div>
        `;

        ModalComponent.show('Delivery Details', bodyHtml);
    }

    // ============================================================
    // Helpers
    // ============================================================

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatDate(dateStr) {
        if (!dateStr) return '-';
        try { return new Date(dateStr).toLocaleString(); } catch { return dateStr; }
    }

    function formatRelativeTime(dateStr) {
        if (!dateStr) return '-';
        try {
            const diff = Date.now() - new Date(dateStr).getTime();
            if (diff < 60000) return 'Just now';
            if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
            if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
            return `${Math.floor(diff / 86400000)}d ago`;
        } catch { return dateStr; }
    }

    // Public methods
    function viewDeliveries(subscriptionId) {
        loadDeliveries(subscriptionId);
    }

    return { init, onNavigate, onLeave, viewDeliveries };
})();
