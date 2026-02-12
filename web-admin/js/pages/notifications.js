/**
 * Notifications Page — Push notification history + Templates management
 * Two tabs: History (sent notifications) and Templates (reusable templates with triggers)
 */
const NotificationsPage = (() => {
    let currentPage = 1;
    let templatePage = 1;
    const PAGE_SIZE = 25;
    let activeTab = 'history';

    function init() {
        console.log('[notifications] Initializing page module');
    }

    async function onNavigate() {
        render();
        bindEvents();
        if (activeTab === 'history') {
            await loadHistory();
        } else {
            await loadTemplates();
        }
    }

    function onLeave() {}

    // ============================================================
    // Main Render
    // ============================================================

    function render() {
        const container = document.querySelector('#notifications-page');
        if (!container) return;

        container.innerHTML = `
            <div class="page-header">
                <h2>Push Notifications</h2>
                <div class="page-actions">
                    <button class="btn btn-primary" id="notifications-action-btn">
                        ${activeTab === 'history' ? 'Send Notification' : 'Create Template'}
                    </button>
                </div>
            </div>
            <div class="tab-bar" style="margin-bottom: 20px;">
                <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">History</button>
                <button class="tab-btn ${activeTab === 'templates' ? 'active' : ''}" data-tab="templates">Templates</button>
            </div>
            <div id="notifications-content"></div>
        `;
    }

    function bindEvents() {
        const actionBtn = document.querySelector('#notifications-action-btn');
        if (actionBtn) {
            actionBtn.addEventListener('click', () => {
                if (activeTab === 'history') showSendForm();
                else showTemplateForm();
            });
        }

        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                activeTab = btn.dataset.tab;
                render();
                bindEvents();
                if (activeTab === 'history') await loadHistory();
                else await loadTemplates();
            });
        });
    }

    // ============================================================
    // History Tab
    // ============================================================

    async function loadHistory() {
        const content = document.querySelector('#notifications-content');
        if (!content) return;

        content.innerHTML = Utils.loading('Loading notification history...');

        try {
            const offset = (currentPage - 1) * PAGE_SIZE;
            const result = await API.call('notifications', 'list', {
                limit: PAGE_SIZE,
                offset
            });

            const notifications = result.notifications || [];
            const total = result.total || 0;

            if (notifications.length === 0) {
                content.innerHTML = Utils.emptyState('No notifications sent yet. Click "Send Notification" to get started.');
                return;
            }

            renderHistoryTable(notifications, total);
        } catch (err) {
            content.innerHTML = Utils.errorState('Failed to load notifications: ' + err.message);
        }
    }

    function renderHistoryTable(notifications, total) {
        const content = document.querySelector('#notifications-content');
        if (!content) return;

        const totalPages = Math.ceil(total / PAGE_SIZE);

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>Target</th>
                        <th>Status</th>
                        <th>Delivered</th>
                        <th>Sent</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const n of notifications) {
            const targetBadge = formatTarget(n.target_type, n.target_value);
            const statusBadge = formatStatus(n.status);
            const delivered = `${n.success_count || 0}/${n.total_recipients || 0}`;
            const sentAt = Utils.formatDate ? Utils.formatDate(n.sent_at) : new Date(n.sent_at).toLocaleString();

            html += `
                <tr class="clickable-row" data-id="${n.id}">
                    <td><strong>${escapeHtml(n.title)}</strong></td>
                    <td>${targetBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${delivered}</td>
                    <td>${sentAt}</td>
                </tr>
            `;
        }

        html += '</tbody></table>';

        if (totalPages > 1) {
            html += `<div class="pagination">`;
            if (currentPage > 1) html += `<button class="btn btn-sm btn-secondary" id="notif-prev">Previous</button>`;
            html += `<span class="pagination-info">Page ${currentPage} of ${totalPages} (${total} total)</span>`;
            if (currentPage < totalPages) html += `<button class="btn btn-sm btn-secondary" id="notif-next">Next</button>`;
            html += `</div>`;
        }

        content.innerHTML = html;

        content.querySelectorAll('.clickable-row').forEach(row => {
            row.addEventListener('click', () => showDetail(row.dataset.id));
        });

        const prevBtn = content.querySelector('#notif-prev');
        if (prevBtn) prevBtn.addEventListener('click', () => { currentPage--; loadHistory(); });
        const nextBtn = content.querySelector('#notif-next');
        if (nextBtn) nextBtn.addEventListener('click', () => { currentPage++; loadHistory(); });
    }

    // ============================================================
    // Templates Tab
    // ============================================================

    async function loadTemplates() {
        const content = document.querySelector('#notifications-content');
        if (!content) return;

        content.innerHTML = Utils.loading('Loading templates...');

        try {
            const offset = (templatePage - 1) * PAGE_SIZE;
            const result = await API.call('notifications', 'list-templates', {
                limit: PAGE_SIZE,
                offset
            });

            const templates = result.templates || [];
            const total = result.total || 0;

            if (templates.length === 0) {
                content.innerHTML = Utils.emptyState('No templates created yet. Click "Create Template" to get started.');
                return;
            }

            renderTemplatesTable(templates, total);
        } catch (err) {
            content.innerHTML = Utils.errorState('Failed to load templates: ' + err.message);
        }
    }

    function renderTemplatesTable(templates, total) {
        const content = document.querySelector('#notifications-content');
        if (!content) return;

        const totalPages = Math.ceil(total / PAGE_SIZE);

        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Trigger</th>
                        <th>Target</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const t of templates) {
            const triggerBadge = formatTrigger(t.trigger_type);
            const targetBadge = formatTarget(t.target_type, t.target_value);
            const statusBadge = t.is_active
                ? '<span class="badge badge-active">Active</span>'
                : '<span class="badge badge-warning">Inactive</span>';
            const created = Utils.formatDate ? Utils.formatDate(t.created_at) : new Date(t.created_at).toLocaleDateString();

            html += `
                <tr>
                    <td><strong class="template-name-link" data-id="${t.id}" style="cursor:pointer;color:var(--color-accent)">${escapeHtml(t.name)}</strong></td>
                    <td>${triggerBadge}</td>
                    <td>${targetBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${created}</td>
                    <td class="action-cell">
                        <button class="btn btn-xs btn-primary tpl-send-btn" data-id="${t.id}" title="Send Now">Send</button>
                        <button class="btn btn-xs ${t.is_active ? 'btn-warning' : 'btn-secondary'} tpl-toggle-btn" data-id="${t.id}" data-active="${t.is_active}" title="${t.is_active ? 'Deactivate' : 'Activate'}">${t.is_active ? 'Stop' : 'Start'}</button>
                        <button class="btn btn-xs btn-danger tpl-delete-btn" data-id="${t.id}" title="Delete">Del</button>
                    </td>
                </tr>
            `;
        }

        html += '</tbody></table>';

        if (totalPages > 1) {
            html += `<div class="pagination">`;
            if (templatePage > 1) html += `<button class="btn btn-sm btn-secondary" id="tpl-prev">Previous</button>`;
            html += `<span class="pagination-info">Page ${templatePage} of ${totalPages} (${total} total)</span>`;
            if (templatePage < totalPages) html += `<button class="btn btn-sm btn-secondary" id="tpl-next">Next</button>`;
            html += `</div>`;
        }

        content.innerHTML = html;

        // Bind template name clicks (edit)
        content.querySelectorAll('.template-name-link').forEach(link => {
            link.addEventListener('click', () => showTemplateDetail(link.dataset.id));
        });

        // Bind action buttons
        content.querySelectorAll('.tpl-send-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); handleSendTemplate(btn.dataset.id); });
        });
        content.querySelectorAll('.tpl-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); handleToggleTemplate(btn.dataset.id, btn.dataset.active === 'true'); });
        });
        content.querySelectorAll('.tpl-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); handleDeleteTemplate(btn.dataset.id); });
        });

        const prevBtn = content.querySelector('#tpl-prev');
        if (prevBtn) prevBtn.addEventListener('click', () => { templatePage--; loadTemplates(); });
        const nextBtn = content.querySelector('#tpl-next');
        if (nextBtn) nextBtn.addEventListener('click', () => { templatePage++; loadTemplates(); });
    }

    // ============================================================
    // Template Form (Create / Edit)
    // ============================================================

    function showTemplateForm(existing = null) {
        const isEdit = !!existing;
        const t = existing || {};

        const placeholderHelp = `
            <div style="margin-top:10px;padding:10px;background:var(--bg-secondary);border-radius:6px;font-size:0.85em">
                <strong>Available placeholders:</strong><br>
                <code>{{user_name}}</code> <code>{{user_email}}</code> — all triggers<br>
                <code>{{scooter_serial}}</code> <code>{{scooter_model}}</code> — firmware, scooter status<br>
                <code>{{firmware_version}}</code> <code>{{release_notes}}</code> — firmware update<br>
                <code>{{old_status}}</code> <code>{{new_status}}</code> — scooter status change
            </div>
        `;

        const triggerConfig = t.trigger_config || {};

        const html = `
            <form id="template-form" class="form-grid">
                <div class="form-group">
                    <label>Template Name <span class="required">*</span></label>
                    <input type="text" id="tpl-name" value="${escapeHtml(t.name || '')}" placeholder="e.g. Firmware Update Alert" required maxlength="100">
                </div>
                <div class="form-group">
                    <label>Notification Title <span class="required">*</span></label>
                    <input type="text" id="tpl-title" value="${escapeHtml(t.title_template || '')}" placeholder="e.g. Firmware Update Available" required maxlength="100">
                </div>
                <div class="form-group">
                    <label>Notification Body <span class="required">*</span></label>
                    <textarea id="tpl-body" placeholder="e.g. Version {{firmware_version}} is now available." required rows="3" maxlength="500">${escapeHtml(t.body_template || '')}</textarea>
                </div>
                ${placeholderHelp}
                <div class="form-group" style="margin-top:12px">
                    <label>On Tap Action</label>
                    <select id="tpl-tap-action">
                        <option value="none" ${t.tap_action === 'none' || !t.tap_action ? 'selected' : ''}>Open App (default)</option>
                        <option value="open_dashboard" ${t.tap_action === 'open_dashboard' ? 'selected' : ''}>Open Dashboard</option>
                        <option value="open_settings" ${t.tap_action === 'open_settings' ? 'selected' : ''}>Open Settings</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Trigger Type <span class="required">*</span></label>
                    <select id="tpl-trigger-type" required>
                        <option value="firmware_update" ${t.trigger_type === 'firmware_update' ? 'selected' : ''}>Firmware Update</option>
                        <option value="scooter_status" ${t.trigger_type === 'scooter_status' ? 'selected' : ''}>Scooter Status Change</option>
                        <option value="user_event" ${t.trigger_type === 'user_event' ? 'selected' : ''}>User Event</option>
                        <option value="scheduled" ${t.trigger_type === 'scheduled' ? 'selected' : ''}>Scheduled</option>
                        <option value="diagnostic_request" ${t.trigger_type === 'diagnostic_request' ? 'selected' : ''}>Diagnostic Request</option>
                        <option value="manual" ${t.trigger_type === 'manual' ? 'selected' : ''}>Manual Only</option>
                    </select>
                </div>
                <div class="form-group" id="tpl-trigger-config-group" style="display:none">
                    <label id="tpl-trigger-config-label">Trigger Config</label>
                    <div id="tpl-trigger-config-fields"></div>
                </div>
                <div class="form-group">
                    <label>Target Audience</label>
                    <select id="tpl-target-type">
                        <option value="trigger_match" ${t.target_type === 'trigger_match' || !t.target_type ? 'selected' : ''}>Auto (based on trigger)</option>
                        <option value="all" ${t.target_type === 'all' ? 'selected' : ''}>All Users</option>
                        <option value="role" ${t.target_type === 'role' ? 'selected' : ''}>Users by Role</option>
                        <option value="hw_version" ${t.target_type === 'hw_version' ? 'selected' : ''}>Users by HW Version</option>
                        <option value="scooter_owner" ${t.target_type === 'scooter_owner' ? 'selected' : ''}>Scooter Owner</option>
                    </select>
                </div>
                <div class="form-group" id="tpl-target-value-group" style="display:none">
                    <label id="tpl-target-value-label">Target Value</label>
                    <input type="text" id="tpl-target-value" value="${escapeHtml(t.target_value || '')}" placeholder="">
                </div>
            </form>
        `;

        const actions = [
            { label: 'Cancel', class: 'btn-secondary', onClick: () => ModalComponent.close() },
            { label: isEdit ? 'Save Changes' : 'Create Template', class: 'btn-primary', onClick: () => handleSaveTemplate(isEdit ? t.id : null) }
        ];

        ModalComponent.show(isEdit ? 'Edit Template' : 'Create Notification Template', html, actions);

        // Setup dynamic fields
        setupTriggerConfigFields(triggerConfig);
        setupTargetValueField();

        document.querySelector('#tpl-trigger-type').addEventListener('change', () => setupTriggerConfigFields({}));
        document.querySelector('#tpl-target-type').addEventListener('change', setupTargetValueField);
    }

    function setupTriggerConfigFields(existingConfig) {
        const triggerType = document.querySelector('#tpl-trigger-type')?.value;
        const group = document.querySelector('#tpl-trigger-config-group');
        const fields = document.querySelector('#tpl-trigger-config-fields');
        if (!group || !fields) return;

        if (triggerType === 'scooter_status') {
            group.style.display = 'block';
            fields.innerHTML = `
                <div style="display:flex;gap:10px">
                    <div style="flex:1">
                        <label style="font-size:0.85em">From Status (optional)</label>
                        <input type="text" id="tpl-config-from" value="${escapeHtml(existingConfig.from || '')}" placeholder="e.g. active">
                    </div>
                    <div style="flex:1">
                        <label style="font-size:0.85em">To Status</label>
                        <input type="text" id="tpl-config-to" value="${escapeHtml(existingConfig.to || '')}" placeholder="e.g. stolen">
                    </div>
                </div>
            `;
        } else if (triggerType === 'user_event') {
            group.style.display = 'block';
            fields.innerHTML = `
                <label style="font-size:0.85em">Event</label>
                <select id="tpl-config-event">
                    <option value="first_login" ${existingConfig.event === 'first_login' ? 'selected' : ''}>First Login</option>
                    <option value="registration" ${existingConfig.event === 'registration' ? 'selected' : ''}>Registration</option>
                    <option value="scooter_registered" ${existingConfig.event === 'scooter_registered' ? 'selected' : ''}>Scooter Registered</option>
                </select>
            `;
        } else if (triggerType === 'diagnostic_request') {
            group.style.display = 'block';
            fields.innerHTML = `
                <label style="font-size:0.85em">Event</label>
                <select id="tpl-config-event">
                    <option value="requested" ${existingConfig.event === 'requested' ? 'selected' : ''}>Diagnostic Requested</option>
                    <option value="cancelled" ${existingConfig.event === 'cancelled' ? 'selected' : ''}>Diagnostic Cancelled</option>
                </select>
                <p style="font-size:0.8em;color:var(--text-secondary);margin-top:4px">Fires automatically when CS requests or cancels a diagnostic. Target should be "Auto" to notify the scooter owner.</p>
            `;
        } else if (triggerType === 'scheduled') {
            group.style.display = 'block';
            fields.innerHTML = `
                <label style="font-size:0.85em">Interval (days)</label>
                <input type="number" id="tpl-config-interval" value="${existingConfig.interval_days || 7}" min="1" max="365" placeholder="7">
                <p style="font-size:0.8em;color:var(--text-secondary);margin-top:4px">Scheduled triggers require separate cron setup.</p>
            `;
        } else {
            group.style.display = 'none';
            fields.innerHTML = '';
        }
    }

    function setupTargetValueField() {
        const targetType = document.querySelector('#tpl-target-type')?.value;
        const valueGroup = document.querySelector('#tpl-target-value-group');
        const valueInput = document.querySelector('#tpl-target-value');
        const valueLabel = document.querySelector('#tpl-target-value-label');
        if (!valueGroup || !valueInput || !valueLabel) return;

        if (targetType === 'role') {
            valueGroup.style.display = 'block';
            valueLabel.textContent = 'Role';
            valueInput.placeholder = 'admin, manager, or normal';
        } else if (targetType === 'hw_version') {
            valueGroup.style.display = 'block';
            valueLabel.textContent = 'Hardware Version';
            valueInput.placeholder = 'e.g. V0.3';
        } else if (targetType === 'scooter_owner') {
            valueGroup.style.display = 'block';
            valueLabel.textContent = 'Scooter ID';
            valueInput.placeholder = 'UUID of the scooter (auto-filled by trigger)';
        } else {
            valueGroup.style.display = 'none';
            valueInput.value = '';
        }
    }

    async function handleSaveTemplate(editId) {
        const name = document.querySelector('#tpl-name')?.value?.trim();
        const titleTemplate = document.querySelector('#tpl-title')?.value?.trim();
        const bodyTemplate = document.querySelector('#tpl-body')?.value?.trim();
        const tapAction = document.querySelector('#tpl-tap-action')?.value;
        const triggerType = document.querySelector('#tpl-trigger-type')?.value;
        const targetType = document.querySelector('#tpl-target-type')?.value;
        const targetValue = document.querySelector('#tpl-target-value')?.value?.trim();

        if (!name || !titleTemplate || !bodyTemplate) {
            Utils.toast('Name, title, and body are required', 'error');
            return;
        }

        // Build trigger config
        let triggerConfig = {};
        if (triggerType === 'scooter_status') {
            const from = document.querySelector('#tpl-config-from')?.value?.trim();
            const to = document.querySelector('#tpl-config-to')?.value?.trim();
            if (from) triggerConfig.from = from;
            if (to) triggerConfig.to = to;
        } else if (triggerType === 'user_event') {
            triggerConfig.event = document.querySelector('#tpl-config-event')?.value || 'first_login';
        } else if (triggerType === 'diagnostic_request') {
            triggerConfig.event = document.querySelector('#tpl-config-event')?.value || 'requested';
        } else if (triggerType === 'scheduled') {
            triggerConfig.interval_days = parseInt(document.querySelector('#tpl-config-interval')?.value) || 7;
        }

        try {
            const actionName = editId ? 'update-template' : 'create-template';
            const params = {
                name,
                title_template: titleTemplate,
                body_template: bodyTemplate,
                tap_action: tapAction || 'none',
                trigger_type: triggerType,
                trigger_config: triggerConfig,
                target_type: targetType,
                target_value: (targetType === 'role' || targetType === 'hw_version') ? targetValue : null,
            };
            if (editId) params.id = editId;

            await API.call('notifications', actionName, params);
            Utils.toast(editId ? 'Template updated' : 'Template created', 'success');
            ModalComponent.close();
            templatePage = 1;
            await loadTemplates();
        } catch (err) {
            Utils.toast('Failed: ' + err.message, 'error');
        }
    }

    async function showTemplateDetail(id) {
        try {
            const result = await API.call('notifications', 'get-template', { id });
            const t = result.template;
            if (!t) return;

            showTemplateForm(t);
        } catch (err) {
            Utils.toast(err.message, 'error');
        }
    }

    async function handleSendTemplate(id) {
        // First fetch the template to check for placeholders
        try {
            const result = await API.call('notifications', 'get-template', { id });
            const t = result.template;
            if (!t) return;

            // Find placeholders in title and body (excluding per-user ones which auto-resolve)
            const allText = (t.title_template || '') + ' ' + (t.body_template || '');
            const placeholderRegex = /\{\{([^}]+)\}\}/g;
            const allPlaceholders = [];
            let match;
            while ((match = placeholderRegex.exec(allText)) !== null) {
                if (!allPlaceholders.includes(match[1])) allPlaceholders.push(match[1]);
            }

            // Per-user placeholders are auto-resolved from the users table
            const autoResolved = ['user_name', 'user_email'];
            const manualPlaceholders = allPlaceholders.filter(p => !autoResolved.includes(p));

            if (manualPlaceholders.length === 0) {
                // No manual placeholders needed — just confirm and send
                ModalComponent.confirm('Send Template', 'Send this notification now to all matching recipients?<br><br><small>Per-user placeholders like <code>{{user_name}}</code> will be resolved automatically.</small>', async () => {
                    try {
                        await API.call('notifications', 'send-template', { id });
                        Utils.toast('Notification queued', 'success');
                    } catch (err) {
                        Utils.toast('Failed: ' + err.message, 'error');
                    }
                });
            } else {
                // Show form to fill in placeholder values
                const fieldsHtml = manualPlaceholders.map(p =>
                    `<div class="form-group">
                        <label><code>{{${escapeHtml(p)}}}</code></label>
                        <input type="text" id="ph-${escapeHtml(p)}" placeholder="Value for ${escapeHtml(p)}" class="ph-input" data-key="${escapeHtml(p)}">
                    </div>`
                ).join('');

                const html = `
                    <p>This template uses placeholders that need values. Fill them in below:</p>
                    <p style="font-size:0.85em;color:var(--text-secondary)"><code>{{user_name}}</code> and <code>{{user_email}}</code> are resolved automatically per recipient.</p>
                    <form id="ph-form" style="margin-top:12px">
                        ${fieldsHtml}
                    </form>
                    <div style="margin-top:12px;padding:10px;background:var(--bg-secondary);border-radius:6px;font-size:0.85em">
                        <strong>Preview:</strong><br>
                        <strong>Title:</strong> ${escapeHtml(t.title_template)}<br>
                        <strong>Body:</strong> ${escapeHtml(t.body_template)}
                    </div>
                `;

                const actions = [
                    { label: 'Send Now', class: 'btn-primary', onClick: async () => {
                        const templateData = {};
                        document.querySelectorAll('#ph-form .ph-input').forEach(input => {
                            templateData[input.dataset.key] = input.value || '';
                        });
                        try {
                            await API.call('notifications', 'send-template', { id, template_data: templateData });
                            Utils.toast('Notification queued', 'success');
                            ModalComponent.close();
                        } catch (err) {
                            Utils.toast('Failed: ' + err.message, 'error');
                        }
                    }}
                ];
                ModalComponent.show('Send Template', html, actions);
            }
        } catch (err) {
            Utils.toast('Failed to load template: ' + err.message, 'error');
        }
    }

    async function handleToggleTemplate(id, currentlyActive) {
        try {
            await API.call('notifications', 'toggle-template', { id, is_active: !currentlyActive });
            Utils.toast(currentlyActive ? 'Template deactivated' : 'Template activated', 'success');
            await loadTemplates();
        } catch (err) {
            Utils.toast('Failed: ' + err.message, 'error');
        }
    }

    async function handleDeleteTemplate(id) {
        ModalComponent.confirm('Delete Template', 'Are you sure you want to delete this template? This cannot be undone.', async () => {
            try {
                await API.call('notifications', 'delete-template', { id });
                Utils.toast('Template deleted', 'success');
                await loadTemplates();
            } catch (err) {
                Utils.toast('Failed: ' + err.message, 'error');
            }
        });
    }

    // ============================================================
    // Shared: Send Notification Form (manual one-off)
    // ============================================================

    function showSendForm() {
        const html = `
            <form id="notification-send-form" class="form-grid">
                <div class="form-group">
                    <label for="notif-title">Title <span class="required">*</span></label>
                    <input type="text" id="notif-title" placeholder="Notification title" required maxlength="100">
                </div>
                <div class="form-group">
                    <label for="notif-body">Message <span class="required">*</span></label>
                    <textarea id="notif-body" placeholder="Notification message body" required rows="4" maxlength="500"></textarea>
                </div>
                <div class="form-group">
                    <label for="notif-target-type">Send To <span class="required">*</span></label>
                    <select id="notif-target-type" required>
                        <option value="all">All Users</option>
                        <option value="role">Users by Role</option>
                        <option value="hw_version">Users by HW Version</option>
                        <option value="user">Specific User</option>
                    </select>
                </div>
                <div class="form-group" id="notif-target-value-group" style="display:none">
                    <label for="notif-target-value" id="notif-target-value-label">Target Value</label>
                    <input type="text" id="notif-target-value" placeholder="">
                </div>
                <div class="form-group">
                    <label for="notif-action">On Tap Action</label>
                    <select id="notif-action">
                        <option value="none">Open App (default)</option>
                        <option value="open_dashboard">Open Dashboard</option>
                        <option value="open_settings">Open Settings</option>
                    </select>
                </div>
            </form>
        `;

        ModalComponent.show('Send Push Notification', html, [
            { label: 'Cancel', class: 'btn-secondary', onClick: () => ModalComponent.close() },
            { label: 'Send', class: 'btn-primary', onClick: handleSend }
        ]);

        const targetTypeSelect = document.querySelector('#notif-target-type');
        targetTypeSelect.addEventListener('change', () => {
            const type = targetTypeSelect.value;
            const valueGroup = document.querySelector('#notif-target-value-group');
            const valueInput = document.querySelector('#notif-target-value');
            const valueLabel = document.querySelector('#notif-target-value-label');

            if (type === 'all') {
                valueGroup.style.display = 'none';
                valueInput.value = '';
            } else if (type === 'role') {
                valueGroup.style.display = 'block';
                valueLabel.textContent = 'Role';
                valueInput.placeholder = 'admin, manager, or normal';
            } else if (type === 'hw_version') {
                valueGroup.style.display = 'block';
                valueLabel.textContent = 'Hardware Version';
                valueInput.placeholder = 'e.g. V0.3';
            } else if (type === 'user') {
                valueGroup.style.display = 'block';
                valueLabel.textContent = 'User ID';
                valueInput.placeholder = 'User UUID';
            }
        });
    }

    async function handleSend() {
        const title = document.querySelector('#notif-title')?.value?.trim();
        const body = document.querySelector('#notif-body')?.value?.trim();
        const targetType = document.querySelector('#notif-target-type')?.value;
        const targetValue = document.querySelector('#notif-target-value')?.value?.trim();
        const action = document.querySelector('#notif-action')?.value;

        if (!title || !body) {
            Utils.toast('Title and message are required', 'error');
            return;
        }

        if (targetType === 'role' && !['admin', 'manager', 'normal'].includes(targetValue)) {
            Utils.toast('Role must be admin, manager, or normal', 'error');
            return;
        }

        if (targetType === 'user' && !targetValue) {
            Utils.toast('User ID is required for user target', 'error');
            return;
        }

        if (targetType === 'hw_version' && !targetValue) {
            Utils.toast('Hardware version is required', 'error');
            return;
        }

        try {
            await API.call('notifications', 'send', {
                title,
                body,
                target_type: targetType,
                target_value: targetType === 'all' ? null : targetValue,
                tap_action: action || 'none'
            });

            Utils.toast('Notification sent successfully', 'success');
            ModalComponent.close();
            currentPage = 1;
            await loadHistory();
        } catch (err) {
            Utils.toast('Failed to send: ' + err.message, 'error');
        }
    }

    // ============================================================
    // Shared: Detail View
    // ============================================================

    async function showDetail(id) {
        try {
            const result = await API.call('notifications', 'get', { id });
            const n = result.notification;
            if (!n) return;

            const sentAt = Utils.formatDate ? Utils.formatDate(n.sent_at) : new Date(n.sent_at).toLocaleString();

            const html = `
                <div class="detail-section">
                    <h4>Notification Details</h4>
                    ${Utils.detailRow('Title', n.title)}
                    ${Utils.detailRow('Message', n.body)}
                    ${Utils.detailRow('Target', formatTarget(n.target_type, n.target_value))}
                    ${Utils.detailRow('On Tap Action', n.action || 'none')}
                    ${Utils.detailRow('Status', formatStatus(n.status))}
                    ${Utils.detailRow('Recipients', `${n.success_count || 0} delivered / ${n.total_recipients || 0} total`)}
                    ${Utils.detailRow('Failures', n.failure_count || 0)}
                    ${Utils.detailRow('Sent By', n.sent_by_email || 'Unknown')}
                    ${Utils.detailRow('Sent At', sentAt)}
                    ${n.template_id ? Utils.detailRow('From Template', 'Yes') : ''}
                    ${n.error_details ? Utils.detailRow('Error', '<code>' + escapeHtml(JSON.stringify(n.error_details)) + '</code>') : ''}
                </div>
            `;

            ModalComponent.show('Notification Details', html, [
                { label: 'Close', class: 'btn-secondary', onClick: () => ModalComponent.close() }
            ]);
        } catch (err) {
            Utils.toast(err.message, 'error');
        }
    }

    // ============================================================
    // Formatting Helpers
    // ============================================================

    function formatTarget(type, value) {
        if (type === 'all') return '<span class="badge badge-primary">All Users</span>';
        if (type === 'role') return `<span class="badge badge-info">Role: ${escapeHtml(value || '')}</span>`;
        if (type === 'user') return `<span class="badge badge-secondary">User: ${escapeHtml((value || '').substring(0, 8))}...</span>`;
        if (type === 'hw_version') return `<span class="badge badge-info">HW: ${escapeHtml(value || '')}</span>`;
        if (type === 'scooter_owner') return `<span class="badge badge-secondary">Scooter Owner</span>`;
        if (type === 'trigger_match') return '<span class="badge badge-primary">Auto (trigger)</span>';
        return type || '';
    }

    function formatTrigger(type) {
        const labels = {
            firmware_update: '<span class="badge badge-info">Firmware Update</span>',
            scooter_status: '<span class="badge badge-warning">Status Change</span>',
            user_event: '<span class="badge badge-secondary">User Event</span>',
            scheduled: '<span class="badge badge-primary">Scheduled</span>',
            diagnostic_request: '<span class="badge badge-warning">Diagnostic Request</span>',
            manual: '<span class="badge">Manual</span>',
        };
        return labels[type] || type;
    }

    function formatStatus(status) {
        const classes = {
            pending: 'badge-warning',
            sending: 'badge-info',
            completed: 'badge-active',
            failed: 'badge-danger'
        };
        return `<span class="badge ${classes[status] || ''}">${status}</span>`;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    return { init, onNavigate, onLeave };
})();
