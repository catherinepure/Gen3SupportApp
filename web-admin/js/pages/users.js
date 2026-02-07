/**
 * Users Page
 * Manage users, search, filter, view details, edit
 */

const UsersPage = (() => {
    const { $, toast, exportCSV, formatDate, detailRow, detailSection } = Utils;
    const { render: renderTable } = TableComponent;

    let currentUsers = [];
    let currentFilters = {};

    async function load(filters = {}) {
        try {
            const content = $('#users-content');
            if (!content) {
                console.error('users-content div not found');
                return;
            }

            content.innerHTML = Utils.loading('Loading users...');

            currentFilters = filters;

            const result = await API.call('users', filters.search ? 'search' : 'list', {
                ...filters,
                limit: 50
            });

            currentUsers = result.users || [];

            renderTable('#users-content', currentUsers, getColumns(), {
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
                        condition: (user) => user.is_active
                    }
                ],
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

    async function showUserDetail(user) {
        // Show loading state first
        ModalComponent.show(`User: ${user.email}`, Utils.loading('Loading user details...'));

        try {
            // Fetch full user details including scooters and sessions
            const result = await API.call('users', 'get', { id: user.id });
            const fullUser = result.user;
            const scooters = result.scooters || [];
            const sessions = result.sessions || [];

            let html = '<div class="detail-grid">';

            html += detailSection('Account Information');
            html += detailRow('Email', fullUser.email);
            html += detailRow('Name', `${fullUser.first_name || ''} ${fullUser.last_name || ''}`.trim() || '-');
            html += detailRow('User Level', fullUser.user_level);
            html += detailRow('Roles', fullUser.roles?.map(r => Utils.roleBadge(r)).join(' ') || '-');
            html += detailRow('Verified', fullUser.is_verified ? '✓ Yes' : '✗ No');
            html += detailRow('Active', fullUser.is_active ? '✓ Yes' : '✗ No');

            html += detailSection('Location');
            html += detailRow('Home Country', fullUser.home_country || '-');
            html += detailRow('Current Country', fullUser.current_country || '-');

            if (fullUser.distributor_id || fullUser.workshop_id) {
                html += detailSection('Assignments');
                html += detailRow('Distributor', fullUser.distributors?.name || fullUser.distributor_id || '-');
                html += detailRow('Workshop', fullUser.workshops?.name || fullUser.workshop_id || '-');
            }

            // Linked Scooters
            if (scooters.length > 0) {
                html += detailSection(`Linked Scooters (${scooters.length})`);
                scooters.forEach(link => {
                    const scooter = link.scooters;
                    const isPrimary = link.is_primary ? ' ⭐' : '';
                    html += detailRow(
                        scooter.zyd_serial + isPrimary,
                        `${scooter.model || '-'} • ${Utils.statusBadge(scooter.status)}`
                    );
                });
            }

            // Active Sessions
            if (sessions.length > 0) {
                html += detailSection(`Recent Sessions (${sessions.length})`);
                sessions.slice(0, 5).forEach(session => {
                    const isExpired = new Date(session.expires_at) < new Date();
                    html += detailRow(
                        session.device_info || 'Unknown Device',
                        `Created: ${formatDate(session.created_at)}${isExpired ? ' (expired)' : ' ✓'}`
                    );
                });
            }

            html += detailSection('Account Activity');
            html += detailRow('Created', formatDate(fullUser.created_at));
            html += detailRow('Last Login', formatDate(fullUser.last_login) || 'Never');

            html += detailSection('Additional Info');
            html += detailRow('Date of Birth', formatDate(fullUser.date_of_birth) || '-');
            html += detailRow('Gender', fullUser.gender || '-');
            html += detailRow('User ID', fullUser.id);

            html += '</div>';

            ModalComponent.show(`User: ${fullUser.email}`, html);

        } catch (err) {
            ModalComponent.show(`User: ${user.email}`, `<p class="error-msg">${err.message}</p>`);
        }
    }

    function editUser(user) {
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
                label: 'Roles (comma-separated)',
                value: user.roles?.join(', ') || '',
                placeholder: 'e.g., customer, distributor_staff, manufacturer_admin'
            },
            { name: 'home_country', label: 'Home Country', value: user.home_country, placeholder: 'GB, US, DE, etc.' },
            { name: 'current_country', label: 'Current Country', value: user.current_country, placeholder: 'GB, US, DE, etc.' },
            { name: 'distributor_id', label: 'Distributor ID (optional)', value: user.distributor_id },
            { name: 'workshop_id', label: 'Workshop ID (optional)', value: user.workshop_id },
            { name: 'is_active', label: 'Active', type: 'checkbox', value: user.is_active },
            { name: 'is_verified', label: 'Verified', type: 'checkbox', value: user.is_verified }
        ], async (formData) => {
            // Convert roles from comma-separated string to array
            if (formData.roles) {
                formData.roles = formData.roles.split(',').map(r => r.trim()).filter(Boolean);
            }

            await API.call('users', 'update', {
                id: user.id,
                ...formData
            });

            toast('User updated successfully', 'success');
            load(currentFilters);
        });
    }

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

    function handleSearch(e) {
        const query = e.target.value.trim();
        load({ ...currentFilters, search: query });
    }

    function handleLevelFilter(e) {
        const user_level = e.target.value;
        const filters = { ...currentFilters };
        if (user_level) {
            filters.user_level = user_level;
        } else {
            delete filters.user_level;
        }
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
        load(filters);
    }

    function handleExport() {
        exportCSV(currentUsers, 'users.csv');
    }

    function init() {
        const searchInput = $('#users-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(handleSearch, 300));
        }

        const levelFilter = $('#users-level-filter');
        if (levelFilter) {
            levelFilter.addEventListener('change', handleLevelFilter);
        }

        const activeFilter = $('#users-active-filter');
        if (activeFilter) {
            activeFilter.addEventListener('change', handleActiveFilter);
        }

        const exportBtn = $('#users-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', handleExport);
        }
    }

    function onNavigate() {
        load();
    }

    return {
        init,
        onNavigate
    };
})();
