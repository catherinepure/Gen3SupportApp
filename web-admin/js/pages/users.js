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
            $('#users-content').innerHTML = Utils.loading('Loading users...');

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
                    }
                ],
                emptyMessage: 'No users found'
            });

        } catch (err) {
            toast(err.message, 'error');
            $('#users-content').innerHTML = Utils.errorState('Failed to load users');
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

    function showUserDetail(user) {
        let html = '<div class="detail-grid">';

        html += detailSection('Account Information');
        html += detailRow('Email', user.email);
        html += detailRow('Name', `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-');
        html += detailRow('User Level', user.user_level);
        html += detailRow('Roles', user.roles?.map(r => Utils.roleBadge(r)).join(' ') || '-');
        html += detailRow('Verified', user.is_verified ? '✓ Yes' : '✗ No');
        html += detailRow('Active', user.is_active ? '✓ Yes' : '✗ No');

        html += detailSection('Location');
        html += detailRow('Home Country', user.home_country || '-');
        html += detailRow('Current Country', user.current_country || '-');

        if (user.distributor_id || user.workshop_id) {
            html += detailSection('Assignments');
            html += detailRow('Distributor', user.distributor_id || '-');
            html += detailRow('Workshop', user.workshop_id || '-');
        }

        html += detailSection('Account Activity');
        html += detailRow('Created', formatDate(user.created_at));
        html += detailRow('Last Login', formatDate(user.last_login) || 'Never');

        html += detailSection('Additional Info');
        html += detailRow('Date of Birth', formatDate(user.date_of_birth) || '-');
        html += detailRow('Gender', user.gender || '-');
        html += detailRow('User ID', user.id);

        html += '</div>';

        ModalComponent.show(`User: ${user.email}`, html);
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
            { name: 'home_country', label: 'Home Country', value: user.home_country },
            { name: 'current_country', label: 'Current Country', value: user.current_country },
            { name: 'is_active', label: 'Active', type: 'checkbox', value: user.is_active },
            { name: 'is_verified', label: 'Verified', type: 'checkbox', value: user.is_verified }
        ], async (formData) => {
            await API.call('users', 'update', {
                id: user.id,
                ...formData
            });

            toast('User updated successfully', 'success');
            load(currentFilters);
        });
    }

    function handleSearch(e) {
        const query = e.target.value.trim();
        load({ ...currentFilters, search: query });
    }

    function handleExport() {
        exportCSV(currentUsers, 'users.csv');
    }

    function init() {
        const searchInput = $('#users-search');
        if (searchInput) {
            searchInput.addEventListener('input', Utils.debounce(handleSearch, 300));
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
