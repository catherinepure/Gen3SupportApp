# Web Admin Refactoring Approach - RECOMMENDED

## Strategy: Modular Vanilla JS (No Build Step)

Keep the current vanilla JS approach but split into focused modules. Load files in order using `<script>` tags.

---

## Proposed File Structure

```
web-admin/
├── index.html                      # Shell + script loading order
├── serve.sh
├── test-connection.html
│
├── css/
│   ├── 00-variables.css           # Design tokens (new)
│   ├── 01-base.css                # Base styles (split from styles.css)
│   ├── 02-components.css          # Component styles (split from styles.css)
│   └── 03-pages.css               # Page-specific styles (split from styles.css)
│
└── js/
    ├── 00-utils.js                # NEW: Utilities (formatDate, toast, badge, etc.)
    ├── 01-state.js                # NEW: Global state management
    ├── 02-api.js                  # EXISTING: API client (keep as-is)
    ├── 03-auth.js                 # NEW: Auth logic (split from app.js)
    ├── 04-router.js               # NEW: Navigation/routing (split from app.js)
    │
    ├── components/
    │   ├── table.js               # Reusable data table
    │   ├── modal.js               # Modal dialogs
    │   ├── form.js                # Form builder
    │   └── filters.js             # Advanced filters
    │
    ├── pages/
    │   ├── dashboard.js           # Dashboard page
    │   ├── users.js               # Users page
    │   ├── scooters.js            # Scooters page
    │   ├── distributors.js        # Distributors page
    │   ├── workshops.js           # Workshops page
    │   ├── service-jobs.js        # Service jobs page
    │   ├── firmware.js            # Firmware page
    │   ├── telemetry.js           # Telemetry page
    │   ├── logs.js                # Upload logs page
    │   ├── events.js              # Activity events page
    │   └── validation.js          # Validation page
    │
    └── main.js                    # App initialization (last to load)
```

---

## Loading Order in index.html

```html
<!-- Core utilities (no dependencies) -->
<script src="js/00-utils.js"></script>
<script src="js/01-state.js"></script>
<script src="js/02-api.js"></script>
<script src="js/03-auth.js"></script>
<script src="js/04-router.js"></script>

<!-- Reusable components -->
<script src="js/components/table.js"></script>
<script src="js/components/modal.js"></script>
<script src="js/components/form.js"></script>
<script src="js/components/filters.js"></script>

<!-- Page modules (can be loaded in any order) -->
<script src="js/pages/dashboard.js"></script>
<script src="js/pages/users.js"></script>
<script src="js/pages/scooters.js"></script>
<script src="js/pages/distributors.js"></script>
<script src="js/pages/workshops.js"></script>
<script src="js/pages/service-jobs.js"></script>
<script src="js/pages/firmware.js"></script>
<script src="js/pages/telemetry.js"></script>
<script src="js/pages/logs.js"></script>
<script src="js/pages/events.js"></script>
<script src="js/pages/validation.js"></script>

<!-- App initialization (last) -->
<script src="js/main.js"></script>
```

---

## Module Pattern Examples

### 00-utils.js (Utilities)
```javascript
const Utils = (() => {
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
            false: 'inactive', inactive: 'inactive',
            in_service: 'warning', stolen: 'danger',
        };
        return badge(status, map[String(status)] || 'primary');
    }

    function exportCSV(data, filename) {
        if (!data || data.length === 0) {
            toast('No data to export', 'error');
            return;
        }
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
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast(`Exported ${data.length} rows`, 'success');
    }

    return { $, $$, toast, formatDate, badge, statusBadge, exportCSV };
})();
```

### 01-state.js (Global State)
```javascript
const State = (() => {
    let state = {
        user: null,
        currentPage: 'dashboard',
        filters: {},
        cache: {}
    };

    const listeners = {};

    function get(key) {
        return state[key];
    }

    function set(key, value) {
        state[key] = value;
        if (listeners[key]) {
            listeners[key].forEach(fn => fn(value));
        }
    }

    function subscribe(key, callback) {
        if (!listeners[key]) listeners[key] = [];
        listeners[key].push(callback);
    }

    return { get, set, subscribe };
})();
```

### 04-router.js (Routing)
```javascript
const Router = (() => {
    const { $, $$ } = Utils;

    function navigate(page) {
        State.set('currentPage', page);

        // Update active nav item
        $$('.nav-item').forEach(item => item.classList.remove('active'));
        $(`.nav-item[data-page="${page}"]`)?.classList.add('active');

        // Hide all pages, show current
        $$('.page-content').forEach(p => p.classList.add('hidden'));
        $(`#${page}-page`)?.classList.remove('hidden');

        // Trigger page load
        if (Pages[page] && Pages[page].onNavigate) {
            Pages[page].onNavigate();
        }
    }

    function init() {
        // Nav click handlers
        $$('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                navigate(item.dataset.page);
            });
        });
    }

    return { navigate, init };
})();
```

### components/table.js (Reusable Table)
```javascript
const TableComponent = (() => {
    const { $, formatDate, statusBadge } = Utils;

    function render(containerId, data, columns, options = {}) {
        const container = $(containerId);
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="empty-state">No data available</p>';
            return;
        }

        let html = '<table class="data-table"><thead><tr>';

        columns.forEach(col => {
            html += `<th>${col.label}</th>`;
        });

        if (options.actions) {
            html += '<th>Actions</th>';
        }

        html += '</tr></thead><tbody>';

        data.forEach((row, idx) => {
            const clickable = options.onRowClick ? 'class="clickable"' : '';
            html += `<tr ${clickable} data-index="${idx}">`;

            columns.forEach(col => {
                let value = row[col.key];

                if (col.format === 'date') value = formatDate(value);
                else if (col.format === 'status') value = statusBadge(value);
                else if (col.format && typeof col.format === 'function') value = col.format(value, row);

                html += `<td>${value ?? '-'}</td>`;
            });

            if (options.actions) {
                html += '<td class="actions">';
                options.actions.forEach(action => {
                    html += `<button class="btn btn-sm ${action.class || 'btn-secondary'}"
                             data-action="${action.name}" data-index="${idx}">
                             ${action.label}
                            </button>`;
                });
                html += '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // Attach event listeners
        if (options.onRowClick) {
            container.querySelectorAll('tr.clickable').forEach(tr => {
                tr.addEventListener('click', (e) => {
                    if (!e.target.closest('button')) {
                        const idx = parseInt(tr.dataset.index);
                        options.onRowClick(data[idx]);
                    }
                });
            });
        }

        if (options.actions) {
            container.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const actionName = btn.dataset.action;
                    const idx = parseInt(btn.dataset.index);
                    const action = options.actions.find(a => a.name === actionName);
                    if (action && action.handler) {
                        action.handler(data[idx]);
                    }
                });
            });
        }

        // Pagination (if needed)
        if (options.pagination) {
            renderPagination(container, options.pagination);
        }
    }

    function renderPagination(container, paginationData) {
        // TODO: Implement pagination UI
    }

    return { render };
})();
```

### pages/users.js (Page Module)
```javascript
const UsersPage = (() => {
    const { $, toast, exportCSV } = Utils;
    const { render } = TableComponent;

    let currentUsers = [];

    async function load() {
        try {
            $('#users-content').innerHTML = '<div class="loading">Loading users...</div>';

            const result = await API.call('users', 'list', { limit: 50 });
            currentUsers = result.users || [];

            renderTable();
        } catch (err) {
            toast(err.message, 'error');
            $('#users-content').innerHTML = '<p class="error">Failed to load users</p>';
        }
    }

    function renderTable() {
        render('#users-content', currentUsers, [
            { key: 'email', label: 'Email' },
            { key: 'first_name', label: 'Name', format: (val, row) => `${val || ''} ${row.last_name || ''}`.trim() || '-' },
            { key: 'user_level', label: 'Level' },
            { key: 'roles', label: 'Roles', format: (val) => val?.join(', ') || '-' },
            { key: 'is_active', label: 'Active', format: 'status' },
            { key: 'created_at', label: 'Created', format: 'date' }
        ], {
            onRowClick: showUserDetail,
            actions: [
                { name: 'edit', label: 'Edit', class: 'btn-primary', handler: editUser }
            ]
        });
    }

    function showUserDetail(user) {
        // Show modal with user details
        const html = `
            <div class="detail-grid">
                <div class="detail-label">Email</div>
                <div class="detail-value">${user.email}</div>
                <div class="detail-label">Name</div>
                <div class="detail-value">${user.first_name} ${user.last_name}</div>
                <!-- ... more fields ... -->
            </div>
        `;
        ModalComponent.show('User Details', html);
    }

    function editUser(user) {
        // Show edit form
        FormComponent.show('Edit User', [
            { name: 'first_name', label: 'First Name', value: user.first_name },
            { name: 'last_name', label: 'Last Name', value: user.last_name },
            // ...
        ], async (formData) => {
            await API.call('users', 'update', { id: user.id, ...formData });
            toast('User updated', 'success');
            load(); // Reload
        });
    }

    function handleExport() {
        exportCSV(currentUsers, 'users.csv');
    }

    function init() {
        // Set up event listeners for this page
        $('#users-export-btn')?.addEventListener('click', handleExport);
        $('#users-search')?.addEventListener('input', handleSearch);
    }

    function onNavigate() {
        load(); // Called when user navigates to this page
    }

    return { init, onNavigate };
})();
```

### main.js (App Initialization)
```javascript
// Global pages registry
const Pages = {
    dashboard: DashboardPage,
    users: UsersPage,
    scooters: ScootersPage,
    distributors: DistributorsPage,
    workshops: WorkshopsPage,
    'service-jobs': ServiceJobsPage,
    firmware: FirmwarePage,
    telemetry: TelemetryPage,
    logs: LogsPage,
    events: EventsPage,
    validation: ValidationPage
};

// App initialization
(async function init() {
    // Check auth
    const sessionToken = localStorage.getItem('session_token');
    if (!sessionToken) {
        // Show login screen
        return;
    }

    // Load user data
    try {
        const user = await API.validateSession();
        State.set('user', user);

        // Initialize router
        Router.init();

        // Initialize all pages
        Object.values(Pages).forEach(page => {
            if (page.init) page.init();
        });

        // Show app, hide login
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('login-screen').classList.add('hidden');

        // Navigate to default page
        Router.navigate('dashboard');

    } catch (err) {
        // Session invalid, show login
        localStorage.removeItem('session_token');
        location.reload();
    }
})();
```

---

## Migration Plan

### Step 1: Create Core Infrastructure (Today)
1. Create new file structure
2. Split CSS into 4 files (variables, base, components, pages)
3. Extract utilities to `00-utils.js`
4. Extract state to `01-state.js`
5. Extract routing to `04-router.js`
6. Extract auth to `03-auth.js`
7. Update `index.html` with new script loading order

### Step 2: Build Components (Today)
1. Create `components/table.js` - Reusable data table
2. Create `components/modal.js` - Modal dialogs
3. Create `components/form.js` - Form builder
4. Create `components/filters.js` - Advanced filters

### Step 3: Migrate Pages (Tomorrow)
1. Start with Dashboard - simplest page
2. Then Users - most complex, good test
3. Then remaining pages one by one
4. Delete old `app.js` when done

### Step 4: Test & Verify
1. Test all pages load
2. Test navigation works
3. Test CRUD operations
4. Test export functionality

### Step 5: Ready for Enhancements
Now each page is isolated and can be enhanced independently!

---

## Benefits

✅ **No build step** - Still pure vanilla JS
✅ **Modular** - Each page is its own file
✅ **Reusable** - Components used across pages
✅ **Maintainable** - Small, focused files
✅ **Scalable** - Easy to add new pages/features
✅ **Testable** - Can test modules independently

Ready to start? I recommend beginning with Step 1 today.
