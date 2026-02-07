/**
 * Gen3 Admin — Main Application
 * Pure vanilla JS SPA. No build step. No framework dependencies.
 * Designed for static hosting (e.g., HostingUK shared server).
 */

const App = (() => {
    let currentPage = 'dashboard';

    // ========================================================================
    // UTILITIES
    // ========================================================================

    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    function toast(msg, type = 'info') {
        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        $('#toast-container').appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function formatDate(d) {
        if (!d) return '-';
        return new Date(d).toLocaleString('en-GB', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    }

    function badge(text, type) {
        return `<span class="badge badge-${type}">${text}</span>`;
    }

    function statusBadge(status) {
        const map = {
            active: 'active', true: 'active', completed: 'active',
            false: 'inactive', inactive: 'inactive', decommissioned: 'inactive', cancelled: 'inactive',
            in_service: 'warning', stolen: 'danger', failed: 'danger',
            booked: 'primary', in_progress: 'primary', awaiting_parts: 'warning',
            ready_for_collection: 'active', started: 'primary', scanned: 'primary',
        };
        return badge(status, map[String(status)] || 'primary');
    }

    function resolveFk(row, key) {
        const val = row[key];
        if (val && typeof val === 'object') return val.name || val.email || '-';
        return val || '-';
    }

    function loading() {
        return '<div class="loading"><div class="spinner"></div><p>Loading...</p></div>';
    }

    function showModal(title, html) {
        $('#modal-title').textContent = title;
        $('#modal-body').innerHTML = html;
        $('#detail-modal').classList.remove('hidden');
    }

    function closeModal() {
        $('#detail-modal').classList.add('hidden');
    }

    function detailRow(label, value) {
        return `<div class="detail-label">${label}</div><div class="detail-value">${value ?? '-'}</div>`;
    }

    function detailSection(title) {
        return `<div class="detail-section">${title}</div>`;
    }

    function exportCSV(data, filename) {
        if (!data || data.length === 0) { toast('No data to export', 'error'); return; }
        const headers = Object.keys(data[0]);
        const rows = data.map(r => headers.map(h => {
            let v = r[h];
            if (v && typeof v === 'object') v = JSON.stringify(v);
            if (typeof v === 'string' && (v.includes(',') || v.includes('"')))
                v = '"' + v.replace(/"/g, '""') + '"';
            return v ?? '';
        }).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        URL.revokeObjectURL(url);
        toast(`Exported ${data.length} rows`, 'success');
    }

    // ========================================================================
    // NAVIGATION
    // ========================================================================

    function navigate(page) {
        currentPage = page;
        $$('.nav-item').forEach(el => {
            el.classList.toggle('active', el.dataset.page === page);
        });
        renderPage(page);
    }

    // ========================================================================
    // PAGE RENDERERS
    // ========================================================================

    async function renderPage(page) {
        const container = $('#page-content');
        container.innerHTML = loading();

        try {
            switch (page) {
                case 'dashboard':    await renderDashboard(container); break;
                case 'users':        await renderUsers(container); break;
                case 'scooters':     await renderScooters(container); break;
                case 'distributors': await renderDistributors(container); break;
                case 'workshops':    await renderWorkshops(container); break;
                case 'service-jobs': await renderServiceJobs(container); break;
                case 'firmware':     await renderFirmware(container); break;
                case 'telemetry':    await renderTelemetry(container); break;
                case 'logs':         await renderLogs(container); break;
                case 'events':       await renderEvents(container); break;
                case 'validation':   await renderValidation(container); break;
                default: container.innerHTML = '<p>Page not found</p>';
            }
        } catch (err) {
            container.innerHTML = `<div class="card"><div class="card-body"><p class="error-msg">Error: ${err.message}</p></div></div>`;
            toast(err.message, 'error');
        }
    }

    // ---- Dashboard ----
    async function renderDashboard(el) {
        const data = await API.call('dashboard', 'stats');
        const d = data.dashboard;
        el.innerHTML = `
            <div class="page-header"><h2>Dashboard</h2></div>
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-value">${d.users}</div><div class="stat-label">Active Users</div></div>
                <div class="stat-card"><div class="stat-value">${d.scooters}</div><div class="stat-label">Scooters</div></div>
                <div class="stat-card"><div class="stat-value">${d.distributors}</div><div class="stat-label">Distributors</div></div>
                <div class="stat-card"><div class="stat-value">${d.workshops}</div><div class="stat-label">Workshops</div></div>
                <div class="stat-card"><div class="stat-value">${d.active_service_jobs}</div><div class="stat-label">Active Jobs</div></div>
                <div class="stat-card"><div class="stat-value">${d.active_firmware}</div><div class="stat-label">Active Firmware</div></div>
                <div class="stat-card"><div class="stat-value">${d.events_24h}</div><div class="stat-label">Events (24h)</div></div>
                <div class="stat-card"><div class="stat-value">${d.uploads_7d}</div><div class="stat-label">Uploads (7d)</div></div>
            </div>`;
    }

    // ---- Generic List Page Builder ----
    function buildListPage(title, resource, columns, rowFn, opts = {}) {
        return async function(el) {
            const params = { limit: 50, offset: 0, ...(opts.defaultParams || {}) };

            async function load() {
                const data = await API.call(resource, 'list', params);
                const items = data[opts.dataKey || resource] || [];
                const total = data.total || items.length;

                let tableHtml = '<div class="table-container"><table><thead><tr>';
                for (const col of columns) tableHtml += `<th>${col.label}</th>`;
                tableHtml += '</tr></thead><tbody>';
                if (items.length === 0) {
                    tableHtml += `<tr><td colspan="${columns.length}" style="text-align:center;color:var(--gray-400)">No records found</td></tr>`;
                } else {
                    for (const item of items) {
                        tableHtml += `<tr data-id="${item.id}" class="list-row">`;
                        tableHtml += rowFn(item);
                        tableHtml += '</tr>';
                    }
                }
                tableHtml += '</tbody></table></div>';

                // Pagination
                const page = Math.floor(params.offset / params.limit) + 1;
                const totalPages = Math.ceil(total / params.limit) || 1;
                tableHtml += `<div class="pagination">
                    <span>Showing ${params.offset + 1}-${Math.min(params.offset + params.limit, total)} of ${total}</span>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-outline" id="prev-page" ${page <= 1 ? 'disabled' : ''}>Prev</button>
                        <button class="btn btn-sm btn-outline" id="next-page" ${page >= totalPages ? 'disabled' : ''}>Next</button>
                    </div>
                </div>`;

                el.querySelector('#table-area').innerHTML = tableHtml;

                // Row click handlers
                el.querySelectorAll('.list-row').forEach(row => {
                    row.addEventListener('click', () => {
                        if (opts.onRowClick) opts.onRowClick(row.dataset.id);
                    });
                });

                // Pagination handlers
                const prevBtn = el.querySelector('#prev-page');
                const nextBtn = el.querySelector('#next-page');
                if (prevBtn) prevBtn.addEventListener('click', () => { params.offset -= params.limit; load(); });
                if (nextBtn) nextBtn.addEventListener('click', () => { params.offset += params.limit; load(); });
            }

            // Build toolbar
            let toolbarHtml = '';
            if (opts.searchable) {
                toolbarHtml += `<input type="search" id="list-search" placeholder="Search..." value="">`;
            }
            if (opts.filters) {
                for (const f of opts.filters) {
                    toolbarHtml += `<select id="filter-${f.key}"><option value="">${f.label}: All</option>`;
                    for (const o of f.options) toolbarHtml += `<option value="${o.value}">${o.label}</option>`;
                    toolbarHtml += '</select>';
                }
            }
            if (opts.exportable) {
                toolbarHtml += `<button class="btn btn-sm btn-outline" id="export-btn">Export CSV</button>`;
            }

            el.innerHTML = `
                <div class="page-header">
                    <h2>${title}</h2>
                    <div class="btn-group">${opts.headerButtons || ''}</div>
                </div>
                <div class="card">
                    <div class="card-header"><div class="toolbar">${toolbarHtml}</div></div>
                    <div id="table-area">${loading()}</div>
                </div>`;

            // Search handler
            if (opts.searchable) {
                let timer;
                el.querySelector('#list-search').addEventListener('input', (e) => {
                    clearTimeout(timer);
                    timer = setTimeout(() => {
                        params.search = e.target.value;
                        params.offset = 0;
                        load();
                    }, 400);
                });
            }

            // Filter handlers
            if (opts.filters) {
                for (const f of opts.filters) {
                    el.querySelector(`#filter-${f.key}`).addEventListener('change', (e) => {
                        if (e.target.value) params[f.key] = e.target.value;
                        else delete params[f.key];
                        params.offset = 0;
                        load();
                    });
                }
            }

            // Export handler
            if (opts.exportable) {
                el.querySelector('#export-btn').addEventListener('click', async () => {
                    try {
                        const data = await API.call(resource, 'export', {});
                        exportCSV(data[opts.dataKey || resource], `${resource}.csv`);
                    } catch (err) { toast(err.message, 'error'); }
                });
            }

            await load();
        };
    }

    // ---- Users ----
    const renderUsers = buildListPage('Users', 'users',
        [{ label: 'Email' }, { label: 'Name' }, { label: 'Level' }, { label: 'Status' }, { label: 'Verified' }, { label: 'Created' }],
        (u) => `<td>${u.email}</td>
            <td>${u.first_name || ''} ${u.last_name || ''}</td>
            <td>${statusBadge(u.user_level)}</td>
            <td>${u.is_active ? badge('Active', 'active') : badge('Inactive', 'inactive')}</td>
            <td>${u.is_verified ? badge('Yes', 'active') : badge('No', 'danger')}</td>
            <td>${formatDate(u.created_at)}</td>`,
        {
            searchable: true,
            exportable: true,
            filters: [
                { key: 'user_level', label: 'Level', options: [
                    { value: 'user', label: 'User' }, { value: 'distributor', label: 'Distributor' },
                    { value: 'maintenance', label: 'Maintenance' }, { value: 'admin', label: 'Admin' }
                ]},
                { key: 'is_active', label: 'Status', options: [
                    { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }
                ]}
            ],
            onRowClick: async (id) => {
                try {
                    const data = await API.call('users', 'get', { id });
                    const u = data.user;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Email', u.email);
                    html += detailRow('Name', `${u.first_name || ''} ${u.last_name || ''}`);
                    html += detailRow('Level', u.user_level);
                    html += detailRow('Roles', (u.roles || []).join(', '));
                    html += detailRow('Active', u.is_active ? 'Yes' : 'No');
                    html += detailRow('Verified', u.is_verified ? 'Yes' : 'No');
                    html += detailRow('Distributor', resolveFk(u, 'distributors'));
                    html += detailRow('Workshop', resolveFk(u, 'workshops'));
                    html += detailRow('Country', u.home_country || '-');
                    html += detailRow('Last Login', formatDate(u.last_login));
                    html += detailRow('Created', formatDate(u.created_at));

                    if (data.scooters.length > 0) {
                        html += detailSection('Linked Scooters');
                        for (const s of data.scooters) {
                            html += detailRow('Serial', resolveFk(s, 'scooters'));
                            html += detailRow('Primary', s.is_primary ? 'Yes' : 'No');
                        }
                    }

                    if (data.sessions.length > 0) {
                        html += detailSection('Recent Sessions');
                        for (const s of data.sessions) {
                            html += detailRow('Device', s.device_info || '-');
                            html += detailRow('Created', formatDate(s.created_at));
                            html += detailRow('Last Active', formatDate(s.last_activity));
                        }
                    }
                    html += '</div>';
                    showModal('User Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Scooters ----
    const renderScooters = buildListPage('Scooters', 'scooters',
        [{ label: 'Serial' }, { label: 'Model' }, { label: 'Distributor' }, { label: 'Status' }, { label: 'FW' }, { label: 'Created' }],
        (s) => `<td>${s.zyd_serial}</td>
            <td>${s.model || '-'}</td>
            <td>${resolveFk(s, 'distributors')}</td>
            <td>${statusBadge(s.status)}</td>
            <td>${s.firmware_version || '-'}</td>
            <td>${formatDate(s.created_at)}</td>`,
        {
            searchable: true,
            exportable: true,
            filters: [
                { key: 'status', label: 'Status', options: [
                    { value: 'active', label: 'Active' }, { value: 'in_service', label: 'In Service' },
                    { value: 'stolen', label: 'Stolen' }, { value: 'decommissioned', label: 'Decommissioned' }
                ]}
            ],
            onRowClick: async (id) => {
                try {
                    const data = await API.call('scooters', 'get', { id });
                    const s = data.scooter;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Serial', s.zyd_serial);
                    html += detailRow('Model', s.model);
                    html += detailRow('Status', statusBadge(s.status));
                    html += detailRow('HW Version', s.hw_version);
                    html += detailRow('Firmware', s.firmware_version);
                    html += detailRow('Distributor', resolveFk(s, 'distributors'));
                    html += detailRow('Country', s.country_of_registration);
                    html += detailRow('Created', formatDate(s.created_at));

                    if (data.owners.length > 0) {
                        html += detailSection('Owners');
                        for (const o of data.owners) {
                            html += detailRow('User', resolveFk(o, 'users'));
                            html += detailRow('Primary', o.is_primary ? 'Yes' : 'No');
                            html += detailRow('Registered', formatDate(o.registered_at));
                        }
                    }

                    if (data.latest_telemetry) {
                        const t = data.latest_telemetry;
                        html += detailSection('Latest Telemetry');
                        html += detailRow('Odometer', t.odometer_km ? t.odometer_km + ' km' : '-');
                        html += detailRow('Battery', t.battery_soc ? t.battery_soc + '%' : '-');
                        html += detailRow('Charge Cycles', t.charge_cycles);
                        html += detailRow('Captured', formatDate(t.captured_at));
                    }

                    if (data.service_jobs.length > 0) {
                        html += detailSection('Service Jobs');
                        for (const j of data.service_jobs) {
                            html += detailRow('Status', statusBadge(j.status));
                            html += detailRow('Issue', j.issue_description);
                            html += detailRow('Workshop', resolveFk(j, 'workshops'));
                            html += detailRow('Booked', formatDate(j.booked_date));
                        }
                    }
                    html += '</div>';
                    showModal('Scooter Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Distributors ----
    const renderDistributors = buildListPage('Distributors', 'distributors',
        [{ label: 'Name' }, { label: 'Countries' }, { label: 'Status' }, { label: 'Phone' }, { label: 'Email' }],
        (d) => `<td>${d.name}</td>
            <td>${(d.countries || []).join(', ') || '-'}</td>
            <td>${d.is_active ? badge('Active', 'active') : badge('Inactive', 'inactive')}</td>
            <td>${d.phone || '-'}</td>
            <td>${d.email || '-'}</td>`,
        {
            searchable: true,
            exportable: true,
            onRowClick: async (id) => {
                try {
                    const data = await API.call('distributors', 'get', { id });
                    const d = data.distributor;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Name', d.name);
                    html += detailRow('Activation Code', d.activation_code);
                    html += detailRow('Status', d.is_active ? 'Active' : 'Inactive');
                    html += detailRow('Countries', (d.countries || []).join(', '));
                    html += detailRow('Phone', d.phone);
                    html += detailRow('Email', d.email);
                    html += detailRow('Staff', data.staff_count);
                    html += detailRow('Scooters', data.scooter_count);
                    html += detailRow('Created', formatDate(d.created_at));

                    if (data.addresses.length > 0) {
                        html += detailSection('Addresses');
                        for (const a of data.addresses) {
                            html += detailRow('Address', `${a.line_1}, ${a.city}, ${a.postcode}, ${a.country}`);
                        }
                    }

                    if (data.workshops.length > 0) {
                        html += detailSection('Workshops');
                        for (const w of data.workshops) {
                            html += detailRow(w.name, w.is_active ? badge('Active', 'active') : badge('Inactive', 'inactive'));
                        }
                    }
                    html += '</div>';
                    showModal('Distributor Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Workshops ----
    const renderWorkshops = buildListPage('Workshops', 'workshops',
        [{ label: 'Name' }, { label: 'Distributor' }, { label: 'Status' }, { label: 'Phone' }, { label: 'Email' }],
        (w) => `<td>${w.name}</td>
            <td>${resolveFk(w, 'distributors')}</td>
            <td>${w.is_active ? badge('Active', 'active') : badge('Inactive', 'inactive')}</td>
            <td>${w.phone || '-'}</td>
            <td>${w.email || '-'}</td>`,
        {
            searchable: false,
            exportable: true,
            onRowClick: async (id) => {
                try {
                    const data = await API.call('workshops', 'get', { id });
                    const w = data.workshop;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Name', w.name);
                    html += detailRow('Status', w.is_active ? 'Active' : 'Inactive');
                    html += detailRow('Distributor', resolveFk(w, 'distributors'));
                    html += detailRow('Phone', w.phone);
                    html += detailRow('Email', w.email);
                    html += detailRow('Countries', (w.service_area_countries || []).join(', '));
                    html += detailRow('Active Jobs', data.active_job_count);

                    if (data.addresses.length > 0) {
                        html += detailSection('Addresses');
                        for (const a of data.addresses) {
                            html += detailRow('Address', `${a.line_1}, ${a.city}, ${a.postcode}, ${a.country}`);
                        }
                    }

                    if (data.staff.length > 0) {
                        html += detailSection('Staff');
                        for (const s of data.staff) {
                            html += detailRow(s.email, `${s.first_name || ''} ${s.last_name || ''}`);
                        }
                    }
                    html += '</div>';
                    showModal('Workshop Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Service Jobs ----
    const renderServiceJobs = buildListPage('Service Jobs', 'service-jobs',
        [{ label: 'Scooter' }, { label: 'Workshop' }, { label: 'Customer' }, { label: 'Status' }, { label: 'Booked' }],
        (j) => `<td>${resolveFk(j, 'scooters')}</td>
            <td>${resolveFk(j, 'workshops')}</td>
            <td>${resolveFk(j, 'users')}</td>
            <td>${statusBadge(j.status)}</td>
            <td>${formatDate(j.booked_date)}</td>`,
        {
            dataKey: 'jobs',
            exportable: true,
            filters: [
                { key: 'status', label: 'Status', options: [
                    { value: 'booked', label: 'Booked' }, { value: 'in_progress', label: 'In Progress' },
                    { value: 'awaiting_parts', label: 'Awaiting Parts' },
                    { value: 'ready_for_collection', label: 'Ready' },
                    { value: 'completed', label: 'Completed' }, { value: 'cancelled', label: 'Cancelled' }
                ]}
            ],
            onRowClick: async (id) => {
                try {
                    const data = await API.call('service-jobs', 'get', { id });
                    const j = data.job;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Status', statusBadge(j.status));
                    html += detailRow('Scooter', resolveFk(j, 'scooters'));
                    html += detailRow('Workshop', resolveFk(j, 'workshops'));
                    html += detailRow('Customer', resolveFk(j, 'users'));
                    html += detailRow('Issue', j.issue_description);
                    html += detailRow('Technician Notes', j.technician_notes);
                    html += detailRow('Parts Used', j.parts_used ? JSON.stringify(j.parts_used) : '-');
                    html += detailRow('Firmware Updated', j.firmware_updated ? 'Yes' : 'No');
                    html += detailRow('Booked', formatDate(j.booked_date));
                    html += detailRow('Started', formatDate(j.started_date));
                    html += detailRow('Completed', formatDate(j.completed_date));
                    html += '</div>';
                    showModal('Service Job Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Firmware ----
    const renderFirmware = buildListPage('Firmware', 'firmware',
        [{ label: 'Version' }, { label: 'HW Target' }, { label: 'Active' }, { label: 'Access' }, { label: 'Created' }],
        (f) => `<td>${f.version_label}</td>
            <td>${f.target_hw_version || '-'}</td>
            <td>${f.is_active ? badge('Active', 'active') : badge('Inactive', 'inactive')}</td>
            <td>${f.access_level || '-'}</td>
            <td>${formatDate(f.created_at)}</td>`,
        {
            exportable: true,
            onRowClick: async (id) => {
                try {
                    const data = await API.call('firmware', 'get', { id });
                    const f = data.firmware;
                    const s = data.upload_stats;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Version', f.version_label);
                    html += detailRow('Active', f.is_active ? 'Yes' : 'No');
                    html += detailRow('HW Target', f.target_hw_version);
                    html += detailRow('Min SW', f.min_sw_version);
                    html += detailRow('File Path', f.file_path);
                    html += detailRow('File Size', f.file_size_bytes ? Math.round(f.file_size_bytes / 1024) + ' KB' : '-');
                    html += detailRow('Access Level', f.access_level);
                    html += detailRow('Release Notes', f.release_notes);
                    html += detailRow('HW Targets', data.hw_targets.join(', '));
                    html += detailRow('Created', formatDate(f.created_at));
                    html += detailSection('Upload Stats');
                    html += detailRow('Total Uploads', s.total);
                    html += detailRow('Completed', s.completed);
                    html += detailRow('Failed', s.failed);
                    html += detailRow('Success Rate', s.success_rate + '%');
                    html += '</div>';
                    showModal('Firmware Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Telemetry ----
    const renderTelemetry = buildListPage('Telemetry', 'telemetry',
        [{ label: 'Scooter' }, { label: 'Odometer' }, { label: 'Battery' }, { label: 'Cycles' }, { label: 'Captured' }],
        (t) => `<td>${resolveFk(t, 'scooters')}</td>
            <td>${t.odometer_km ? t.odometer_km + ' km' : '-'}</td>
            <td>${t.battery_soc ? t.battery_soc + '%' : '-'}</td>
            <td>${t.charge_cycles ?? '-'}</td>
            <td>${formatDate(t.captured_at)}</td>`,
        {
            exportable: true,
            onRowClick: async (id) => {
                try {
                    const data = await API.call('telemetry', 'get', { id });
                    const t = data.telemetry;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Scooter', resolveFk(t, 'scooters'));
                    html += detailRow('User', resolveFk(t, 'users'));
                    html += detailRow('Odometer', t.odometer_km ? t.odometer_km + ' km' : '-');
                    html += detailRow('Battery SOC', t.battery_soc ? t.battery_soc + '%' : '-');
                    html += detailRow('Charge Cycles', t.charge_cycles);
                    html += detailRow('Discharge Cycles', t.discharge_cycles);
                    html += detailRow('Battery Voltage', t.battery_voltage ? t.battery_voltage + 'V' : '-');
                    html += detailRow('Battery Current', t.battery_current ? t.battery_current + 'A' : '-');
                    html += detailRow('Motor Temp', t.motor_temp ? t.motor_temp + 'C' : '-');
                    html += detailRow('Controller Temp', t.controller_temp ? t.controller_temp + 'C' : '-');
                    html += detailRow('Speed', t.speed_kmh ? t.speed_kmh + ' km/h' : '-');
                    html += detailRow('Fault Codes', t.fault_codes ? JSON.stringify(t.fault_codes) : 'None');
                    html += detailRow('Captured', formatDate(t.captured_at));
                    html += '</div>';
                    showModal('Telemetry Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Upload Logs ----
    const renderLogs = buildListPage('Upload Logs', 'logs',
        [{ label: 'Scooter' }, { label: 'Firmware' }, { label: 'Status' }, { label: 'Distributor' }, { label: 'Started' }],
        (l) => `<td>${resolveFk(l, 'scooters')}</td>
            <td>${resolveFk(l, 'firmware_versions')}</td>
            <td>${statusBadge(l.status)}</td>
            <td>${resolveFk(l, 'distributors')}</td>
            <td>${formatDate(l.started_at)}</td>`,
        {
            exportable: true,
            filters: [
                { key: 'status', label: 'Status', options: [
                    { value: 'started', label: 'Started' }, { value: 'completed', label: 'Completed' },
                    { value: 'failed', label: 'Failed' }, { value: 'scanned', label: 'Scanned' }
                ]}
            ],
            onRowClick: async (id) => {
                try {
                    const data = await API.call('logs', 'get', { id });
                    const l = data.log;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Status', statusBadge(l.status));
                    html += detailRow('Scooter', resolveFk(l, 'scooters'));
                    html += detailRow('Firmware', resolveFk(l, 'firmware_versions'));
                    html += detailRow('Distributor', resolveFk(l, 'distributors'));
                    html += detailRow('Old HW', l.old_hw_version);
                    html += detailRow('Old SW', l.old_sw_version);
                    html += detailRow('New Version', l.new_version);
                    html += detailRow('Error', l.error_message);
                    html += detailRow('Started', formatDate(l.started_at));
                    html += detailRow('Completed', formatDate(l.completed_at));
                    html += '</div>';
                    showModal('Upload Log Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Events ----
    const renderEvents = buildListPage('Activity Events', 'events',
        [{ label: 'Type' }, { label: 'User' }, { label: 'Scooter' }, { label: 'Country' }, { label: 'Time' }],
        (e) => `<td>${badge(e.event_type, 'primary')}</td>
            <td>${resolveFk(e, 'users')}</td>
            <td>${resolveFk(e, 'scooters')}</td>
            <td>${e.country || '-'}</td>
            <td>${formatDate(e.timestamp)}</td>`,
        {
            exportable: true,
            onRowClick: async (id) => {
                try {
                    const data = await API.call('events', 'get', { id });
                    const e = data.event;
                    let html = '<div class="detail-grid">';
                    html += detailRow('Type', e.event_type);
                    html += detailRow('User', resolveFk(e, 'users'));
                    html += detailRow('Scooter', resolveFk(e, 'scooters'));
                    html += detailRow('Country', e.country);
                    html += detailRow('App Version', e.app_version);
                    html += detailRow('Device Type', e.device_type);
                    html += detailRow('Timestamp', formatDate(e.timestamp));
                    html += detailRow('Payload', `<pre style="white-space:pre-wrap;font-size:0.8rem">${JSON.stringify(e.payload, null, 2)}</pre>`);
                    html += '</div>';
                    showModal('Event Details', html);
                } catch (err) { toast(err.message, 'error'); }
            }
        }
    );

    // ---- Validation ----
    async function renderValidation(el) {
        el.innerHTML = `
            <div class="page-header">
                <h2>Validation Checks</h2>
                <button class="btn btn-primary" id="run-all-btn">Run All Checks</button>
            </div>
            <div id="validation-results">${loading()}</div>`;

        // Run all checks
        async function runAll() {
            const resultsEl = el.querySelector('#validation-results');
            resultsEl.innerHTML = loading();

            try {
                const [orphaned, expired, stale] = await Promise.all([
                    API.call('validation', 'orphaned-scooters'),
                    API.call('validation', 'expired-sessions'),
                    API.call('validation', 'stale-jobs'),
                ]);

                let html = '';

                // Orphaned scooters
                const oc = orphaned.count;
                html += `<div class="validation-result ${oc > 0 ? 'validation-warn' : 'validation-ok'}">
                    <strong>Orphaned Scooters:</strong> ${oc} scooter(s) with no distributor assigned.
                    ${oc > 0 ? '<br>Serials: ' + orphaned.orphaned_scooters.map(s => s.zyd_serial).join(', ') : ''}
                </div>`;

                // Expired sessions
                const ec = expired.count;
                html += `<div class="validation-result ${ec > 0 ? 'validation-warn' : 'validation-ok'}">
                    <strong>Expired Sessions:</strong> ${ec} expired session(s) found.
                    ${ec > 0 ? `<br><button class="btn btn-sm btn-warning" id="cleanup-sessions-btn">Clean Up</button>` : ''}
                </div>`;

                // Stale jobs
                const sc = stale.count;
                html += `<div class="validation-result ${sc > 0 ? 'validation-error' : 'validation-ok'}">
                    <strong>Stale Service Jobs:</strong> ${sc} job(s) open for more than 30 days.
                    ${sc > 0 ? '<br>Jobs: ' + stale.stale_jobs.map(j => `${resolveFk(j, 'scooters')} at ${resolveFk(j, 'workshops')} (${j.status})`).join('; ') : ''}
                </div>`;

                resultsEl.innerHTML = html;

                // Cleanup handler
                const cleanupBtn = el.querySelector('#cleanup-sessions-btn');
                if (cleanupBtn) {
                    cleanupBtn.addEventListener('click', async () => {
                        try {
                            const result = await API.call('sessions', 'cleanup');
                            toast(`Cleaned up ${result.deleted} expired sessions`, 'success');
                            runAll();
                        } catch (err) { toast(err.message, 'error'); }
                    });
                }

            } catch (err) {
                resultsEl.innerHTML = `<div class="validation-result validation-error"><strong>Error:</strong> ${err.message}</div>`;
            }
        }

        el.querySelector('#run-all-btn').addEventListener('click', runAll);
        await runAll();
    }

    // ========================================================================
    // INITIALIZATION
    // ========================================================================

    function init() {
        // Modal close
        $('#modal-close').addEventListener('click', closeModal);
        $('#modal-close-btn').addEventListener('click', closeModal);
        $('.modal-overlay').addEventListener('click', closeModal);
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

        // Login form
        $('#login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('#login-email').value;
            const password = $('#login-password').value;
            const errorEl = $('#login-error');
            const btn = $('#login-btn');

            btn.disabled = true;
            btn.textContent = 'Signing in...';
            errorEl.classList.add('hidden');

            try {
                const user = await API.login(email, password);
                showApp(user);
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.classList.remove('hidden');
            } finally {
                btn.disabled = false;
                btn.textContent = 'Sign In';
            }
        });

        // Logout
        $('#logout-btn').addEventListener('click', () => {
            API.logout();
            showLogin();
        });

        // Sidebar navigation
        $$('.nav-item').forEach(item => {
            item.addEventListener('click', () => navigate(item.dataset.page));
        });

        // Try restore session
        const user = API.restoreSession();
        if (user) {
            showApp(user);
        } else {
            showLogin();
        }
    }

    function showLogin() {
        $('#login-screen').classList.remove('hidden');
        $('#app').classList.add('hidden');
    }

    function showApp(user) {
        $('#login-screen').classList.add('hidden');
        $('#app').classList.remove('hidden');
        $('#admin-email').textContent = user.email;
        navigate('dashboard');
    }

    // Start
    document.addEventListener('DOMContentLoaded', init);

    return { navigate, toast };
})();
