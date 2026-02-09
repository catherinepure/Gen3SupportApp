/**
 * Users Page
 * Manage users, search, filter, view details, edit, deactivate/reactivate
 */

const UsersPage = (() => {
    const { $, toast, exportCSV, formatDate, detailRow, detailSection, debounce } = Utils;
    const { render: renderTable } = TableComponent;

    const PAGE_SIZE = 50;

    const COUNTRY_OPTIONS = [
        { value: 'GB', label: 'United Kingdom' },
        { value: 'DE', label: 'Germany' },
        { value: 'FR', label: 'France' },
        { value: 'IT', label: 'Italy' },
        { value: 'ES', label: 'Spain' },
        { value: 'NL', label: 'Netherlands' },
        { value: 'BE', label: 'Belgium' },
        { value: 'AT', label: 'Austria' },
        { value: 'CH', label: 'Switzerland' },
        { value: 'US', label: 'United States' },
        { value: 'IE', label: 'Ireland' },
        { value: 'PT', label: 'Portugal' },
        { value: 'SE', label: 'Sweden' },
        { value: 'DK', label: 'Denmark' },
        { value: 'NO', label: 'Norway' },
        { value: 'PL', label: 'Poland' }
    ];

    const ROLE_OPTIONS = [
        { value: 'customer', label: 'Customer' },
        { value: 'distributor_staff', label: 'Distributor Staff' },
        { value: 'workshop_staff', label: 'Workshop Staff' },
        { value: 'manufacturer_admin', label: 'Manufacturer Admin' }
    ];

    let currentUsers = [];
    let currentFilters = {};
    let totalRecords = 0;
    let distributorsList = [];
    let workshopsList = [];

    // ---- Reference Data ----

    async function loadReferenceData() {
        // Try cache first
        const cachedDistributors = State.getCache('distributors_list');
        const cachedWorkshops = State.getCache('workshops_list');

        if (cachedDistributors && cachedWorkshops) {
            distributorsList = cachedDistributors;
            workshopsList = cachedWorkshops;
            populateDistributorDropdown();
            return;
        }

        try {
            const [distResult, workshopResult] = await Promise.all([
                API.call('distributors', 'list', { limit: 200 }),
                API.call('workshops', 'list', { limit: 200 })
            ]);

            distributorsList = distResult.distributors || [];
            workshopsList = workshopResult.workshops || [];

            State.setCache('distributors_list', distributorsList);
            State.setCache('workshops_list', workshopsList);

            populateDistributorDropdown();
        } catch (err) {
            console.error('Error loading reference data:', err);
            // Non-fatal — filters just won't have distributor options
        }
    }

    function populateDistributorDropdown() {
        const select = $('#users-distributor-filter');
        if (!select) return;

        // Keep the "All Distributors" option, clear the rest
        select.innerHTML = '<option value="">All Distributors</option>';

        distributorsList.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.name || d.id;
            select.appendChild(opt);
        });
    }

    // ---- Client-Side Filtering (deprecated - now using server-side) ----

    function getDisplayUsers() {
        // All filtering now happens server-side
        // This function kept for compatibility but just returns the data as-is
        return currentUsers;
    }

    // ---- Load & Render ----

    async function load(filters = {}) {
        try {
            const content = $('#users-content');
            if (!content) {
                console.error('users-content div not found');
                return;
            }

            content.innerHTML = Utils.loading('Loading users...');

            currentFilters = filters;

            // Separate client-side filters from server-side params
            const serverParams = {};
            Object.entries(filters).forEach(([key, val]) => {
                if (!key.startsWith('_client') && val !== undefined && val !== '') {
                    serverParams[key] = val;
                }
            });

            // Pagination
            const { pageNum, pageSize } = State.getPagination('users');
            serverParams.limit = pageSize || PAGE_SIZE;
            serverParams.offset = ((pageNum || 1) - 1) * serverParams.limit;

            const result = await API.call('users', serverParams.search ? 'search' : 'list', serverParams);

            currentUsers = result.users || [];
            totalRecords = result.total || currentUsers.length;

            const displayUsers = getDisplayUsers();
            const totalPages = Math.ceil(totalRecords / (pageSize || PAGE_SIZE));

            renderTable('#users-content', displayUsers, getColumns(), {
                onRowClick: showUserDetail,
                actions: [
                    {
                        name: 'edit',
                        label: 'Edit',
                        className: 'btn-sm btn-primary',
                        handler: editUser
                    },
                    {
                        name: 'deactivate',
                        label: 'Deactivate',
                        className: 'btn-sm btn-danger',
                        handler: deactivateUser,
                        shouldShow: (user) => user.is_active
                    },
                    {
                        name: 'reactivate',
                        label: 'Reactivate',
                        className: 'btn-sm btn-success',
                        handler: reactivateUser,
                        shouldShow: (user) => !user.is_active
                    }
                ],
                pagination: totalPages > 1 ? {
                    current: pageNum || 1,
                    total: totalPages,
                    pageSize: pageSize || PAGE_SIZE,
                    totalRecords: totalRecords
                } : null,
                onPageChange: handlePageChange,
                emptyMessage: 'No users found'
            });

        } catch (err) {
            console.error('Error loading users:', err);
            toast(err.message, 'error');
            const content = $('#users-content');
            if (content) {
                content.innerHTML = Utils.errorState('Failed to load users');
            }
        }
    }

    function getColumns() {
        return [
            { key: 'email', label: 'Email' },
            {
                key: 'first_name',
                label: 'Name',
                format: (val, row) => {
                    const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
                    return name || '-';
                }
            },
            { key: 'user_level', label: 'Level' },
            {
                key: 'roles',
                label: 'Roles',
                format: 'roles'
            },
            { key: 'home_country', label: 'Country' },
            { key: 'is_verified', label: 'Verified', format: 'status' },
            { key: 'is_active', label: 'Active', format: 'status' },
            { key: 'created_at', label: 'Created', format: 'date' }
        ];
    }

    // ---- Detail Modal ----

    async function showUserDetail(user) {
        try {
            const result = await API.call('users', 'get', { id: user.id });
            const fullUser = result.user;
            const scooters = result.scooters || [];
            const sessions = result.sessions || [];

            // Resolve distributor and workshop names
            const distName = fullUser.distributor_id
                ? (distributorsList.find(d => d.id === fullUser.distributor_id)?.name
                    || fullUser.distributors?.name || fullUser.distributor_id)
                : 'N/A';
            const workshopName = fullUser.workshop_id
                ? (workshopsList.find(w => w.id === fullUser.workshop_id)?.name
                    || fullUser.workshops?.name || fullUser.workshop_id)
                : 'N/A';

            // Build sections using DetailModal component
            const sections = [
                // Account Information
                {
                    title: 'Account Information',
                    fields: [
                        { label: 'Email', value: fullUser.email },
                        { label: 'Name', value: `${fullUser.first_name || ''} ${fullUser.last_name || ''}`.trim() || 'N/A' },
                        { label: 'User Level', value: fullUser.user_level },
                        { label: 'Roles', value: fullUser.roles?.map(r => Utils.roleBadge(r)).join(' ') || 'N/A', type: 'html' },
                        { label: 'Verified', value: fullUser.is_verified ? 'Yes ✓' : 'No ✗' },
                        { label: 'Active', value: fullUser.is_active, type: 'badge-boolean' }
                    ]
                },
                // Location
                {
                    title: 'Location',
                    fields: [
                        { label: 'Home Country', value: fullUser.home_country || 'N/A' },
                        { label: 'Current Country', value: fullUser.current_country || 'N/A' }
                    ]
                }
            ];

            // Assignments (only show if assigned)
            if (fullUser.distributor_id || fullUser.workshop_id) {
                sections.push({
                    title: 'Assignments',
                    fields: [
                        { label: 'Distributor', value: distName },
                        { label: 'Workshop', value: workshopName }
                    ]
                });
            }

            // Linked Scooters
            if (scooters.length > 0) {
                let scootersHtml = '<div>';
                scooters.forEach(link => {
                    const scooter = link.scooters;
                    const isPrimary = link.is_primary ? ' ⭐ Primary' : '';
                    scootersHtml += `
                        <div style="margin-bottom: 10px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
                            <strong>${scooter.zyd_serial}${isPrimary}</strong><br>
                            <span class="text-muted">${scooter.model || 'Unknown Model'}</span>
                            ${Utils.statusBadge(scooter.status)}
                        </div>
                    `;
                });
                scootersHtml += '</div>';
                sections.push({
                    title: `Linked Scooters (${scooters.length})`,
                    html: scootersHtml
                });
            }

            // Recent Sessions
            if (sessions.length > 0) {
                let sessionsHtml = '<div>';
                sessions.slice(0, 5).forEach(session => {
                    const isExpired = new Date(session.expires_at) < new Date();
                    sessionsHtml += `
                        <div style="margin-bottom: 8px; padding: 6px; background: #f9f9f9; border-radius: 4px;">
                            <strong>${session.device_info || 'Unknown Device'}</strong><br>
                            <span class="text-muted">Created: ${formatDate(session.created_at)}</span>
                            ${isExpired ? ' <span class="badge badge-inactive">Expired</span>' : ' <span class="badge badge-active">Active</span>'}
                        </div>
                    `;
                });
                sessionsHtml += '</div>';
                sections.push({
                    title: `Recent Sessions (${sessions.length})`,
                    html: sessionsHtml
                });
            }

            // Account Activity
            sections.push({
                title: 'Account Activity',
                fields: [
                    { label: 'Created', value: formatDate(fullUser.created_at), type: 'date' },
                    { label: 'Last Login', value: fullUser.last_login ? formatDate(fullUser.last_login) : 'Never' }
                ]
            });

            // Additional Info
            sections.push({
                title: 'Additional Info',
                fields: [
                    { label: 'Date of Birth', value: fullUser.date_of_birth, type: 'date' },
                    { label: 'Gender', value: fullUser.gender || 'N/A' },
                    { label: 'User ID', value: fullUser.id, type: 'code' }
                ]
            });

            // Action buttons
            const actions = [
                {
                    label: 'Edit User',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editUser(fullUser), 100);
                    }
                }
            ];

            if (fullUser.is_active) {
                actions.push({
                    label: 'Deactivate',
                    class: 'btn-danger',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => deactivateUser(fullUser), 100);
                    }
                });
            } else {
                actions.push({
                    label: 'Reactivate',
                    class: 'btn-success',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => reactivateUser(fullUser), 100);
                    }
                });
            }

            // Show with DetailModal
            DetailModal.show(`User: ${fullUser.email}`, {
                sections,
                actions
            });

        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ---- Edit Form ----

    function editUser(user) {
        // Build distributor options from cached list
        const distributorOptions = [
            { value: '', label: '-- None --' },
            ...distributorsList.map(d => ({ value: d.id, label: d.name || d.id }))
        ];

        // Build workshop options from cached list
        const workshopOptions = [
            { value: '', label: '-- None --' },
            ...workshopsList.map(w => ({ value: w.id, label: w.name || w.id }))
        ];

        FormComponent.show('Edit User', [
            { name: 'first_name', label: 'First Name', value: user.first_name },
            { name: 'last_name', label: 'Last Name', value: user.last_name },
            {
                name: 'user_level',
                label: 'User Level',
                type: 'select',
                value: user.user_level,
                options: [
                    { value: 'user', label: 'User' },
                    { value: 'distributor', label: 'Distributor' },
                    { value: 'maintenance', label: 'Maintenance' },
                    { value: 'admin', label: 'Admin' }
                ],
                required: true
            },
            {
                name: 'roles',
                label: 'Roles',
                type: 'multiselect',
                value: user.roles || [],
                options: ROLE_OPTIONS
            },
            {
                name: 'home_country',
                label: 'Home Country',
                type: 'select',
                value: user.home_country || '',
                options: COUNTRY_OPTIONS
            },
            {
                name: 'current_country',
                label: 'Current Country',
                type: 'select',
                value: user.current_country || '',
                options: COUNTRY_OPTIONS
            },
            {
                name: 'distributor_id',
                label: 'Distributor',
                type: 'select',
                value: user.distributor_id || '',
                options: distributorOptions
            },
            {
                name: 'workshop_id',
                label: 'Workshop',
                type: 'select',
                value: user.workshop_id || '',
                options: workshopOptions
            },
            { name: 'is_active', label: 'Active', type: 'checkbox', value: user.is_active },
            { name: 'is_verified', label: 'Verified', type: 'checkbox', value: user.is_verified }
        ], async (formData) => {
            // Clean up empty strings to null for optional fields
            ['distributor_id', 'workshop_id', 'home_country', 'current_country'].forEach(key => {
                if (formData[key] === '') {
                    formData[key] = null;
                }
            });

            await API.call('users', 'update', {
                id: user.id,
                ...formData
            });

            toast('User updated successfully', 'success');
            load(currentFilters);
        });
    }

    // ---- Actions ----

    async function deactivateUser(user) {
        if (!confirm(`Deactivate user ${user.email}? This will log them out from all devices.`)) {
            return;
        }

        try {
            await API.call('users', 'deactivate', { id: user.id });
            toast(`User ${user.email} has been deactivated`, 'success');
            load(currentFilters);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function reactivateUser(user) {
        if (!confirm(`Reactivate user ${user.email}?`)) {
            return;
        }

        try {
            await API.call('users', 'update', { id: user.id, is_active: true });
            toast(`User ${user.email} has been reactivated`, 'success');
            load(currentFilters);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ---- Filter Handlers ----

    function resetPagination() {
        State.setPagination('users', 1, PAGE_SIZE);
    }

    function handleSearch(e) {
        const query = e.target.value.trim();
        resetPagination();
        load({ ...currentFilters, search: query || undefined });
    }

    function handleLevelFilter(e) {
        const user_level = e.target.value;
        const filters = { ...currentFilters };
        if (user_level) {
            filters.user_level = user_level;
        } else {
            delete filters.user_level;
        }
        resetPagination();
        load(filters);
    }

    function handleActiveFilter(e) {
        const is_active = e.target.value;
        const filters = { ...currentFilters };
        if (is_active === 'true') {
            filters.is_active = true;
        } else if (is_active === 'false') {
            filters.is_active = false;
        } else {
            delete filters.is_active;
        }
        resetPagination();
        load(filters);
    }

    function handleCountryFilter(e) {
        const country = e.target.value;
        const filters = { ...currentFilters };
        if (country) {
            filters.home_country = country;  // Server-side filter
        } else {
            delete filters.home_country;
        }
        resetPagination();
        load(filters);
    }

    function handleDistributorFilter(e) {
        const distributor_id = e.target.value;
        const filters = { ...currentFilters };
        if (distributor_id) {
            filters.distributor_id = distributor_id;
        } else {
            delete filters.distributor_id;
        }
        resetPagination();
        load(filters);
    }

    function handleRoleFilter(e) {
        const role = e.target.value;
        const filters = { ...currentFilters };
        if (role) {
            filters.role = role;  // Server-side filter
        } else {
            delete filters.role;
        }
        resetPagination();
        load(filters);
    }

    function handlePageChange(pageNum) {
        const { pageSize } = State.getPagination('users');
        State.setPagination('users', pageNum, pageSize || PAGE_SIZE);
        load(currentFilters);
    }

    function handleExport() {
        exportCSV(currentUsers, 'users.csv');
    }

    // ---- Init & Lifecycle ----

    async function init() {
        const searchInput = $('#users-search');
        if (searchInput) {
            searchInput.addEventListener('input', debounce(handleSearch, 300));
        }

        const levelFilter = $('#users-level-filter');
        if (levelFilter) {
            levelFilter.addEventListener('change', handleLevelFilter);
        }

        const activeFilter = $('#users-active-filter');
        if (activeFilter) {
            activeFilter.addEventListener('change', handleActiveFilter);
        }

        const countryFilter = $('#users-country-filter');
        if (countryFilter) {
            countryFilter.addEventListener('change', handleCountryFilter);
        }

        const distributorFilter = $('#users-distributor-filter');
        if (distributorFilter) {
            distributorFilter.addEventListener('change', handleDistributorFilter);
        }

        const roleFilter = $('#users-role-filter');
        if (roleFilter) {
            roleFilter.addEventListener('change', handleRoleFilter);
        }

        const exportBtn = $('#users-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExport);
        }

        // Initialize pagination
        State.setPagination('users', 1, PAGE_SIZE);

        // Pre-load reference data
        await loadReferenceData();
    }

    async function onNavigate() {
        // Refresh reference data if cache expired
        await loadReferenceData();

        // Reset filters and pagination
        currentFilters = {};
        resetPagination();

        // Reset dropdown UI
        ['#users-search', '#users-level-filter', '#users-active-filter',
         '#users-country-filter', '#users-distributor-filter', '#users-role-filter']
            .forEach(sel => {
                const el = $(sel);
                if (el) el.value = '';
            });

        load();
    }

    return {
        init,
        onNavigate
    };
})();
