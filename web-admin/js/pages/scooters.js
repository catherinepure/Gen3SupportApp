/**
 * Scooters Page
 * Full CRUD with search, filters, pagination, and enhanced detail
 */

const ScootersPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;

    let currentScooters = [];
    let totalRecords = 0;
    let currentPage = 1;
    const pageSize = 50;
    let currentFilters = {};

    async function load(filters = {}) {
        try {
            $('#scooters-content').innerHTML = Utils.loading('Loading scooters...');

            currentFilters = filters;
            const offset = (currentPage - 1) * pageSize;

            // Build query params
            const params = {
                limit: pageSize,
                offset: offset,
                ...filters
            };

            const result = await API.call('scooters', 'list', params);
            currentScooters = result.scooters || [];
            totalRecords = result.total || currentScooters.length;

            // Apply client-side filters
            let displayScooters = getDisplayScooters();

            renderTable(displayScooters);
        } catch (err) {
            toast(err.message, 'error');
            $('#scooters-content').innerHTML = Utils.errorState('Failed to load scooters');
        }
    }

    function getDisplayScooters() {
        // All filtering now happens server-side
        // This function kept for compatibility but just returns the data as-is
        return currentScooters;
    }

    function renderTable(scooters) {
        const totalPages = Math.ceil(totalRecords / pageSize);

        TableComponent.render('#scooters-content', scooters, [
            { key: 'serial_number', label: 'Serial Number' },
            { key: 'scooter_type', label: 'Type', format: (val) => val || 'N/A' },
            { key: 'status', label: 'Status', format: (val) => {
                const badges = {
                    'active': 'badge-active',
                    'in_service': 'badge-warning',
                    'stolen': 'badge-danger',
                    'decommissioned': 'badge-inactive'
                };
                const badgeClass = badges[val] || 'badge-inactive';
                return `<span class="badge ${badgeClass}">${val || 'Unknown'}</span>`;
            }},
            { key: 'firmware_version', label: 'Firmware', format: (val) => val || 'N/A' },
            { key: 'country_of_registration', label: 'Country', format: (val) => val || 'N/A' },
            { key: 'registration_date', label: 'Registered', format: formatDate }
        ], {
            onRowClick: showScooterDetail,
            emptyMessage: 'No scooters found',
            pagination: {
                currentPage,
                totalPages,
                onPageChange: (page) => {
                    currentPage = page;
                    load(currentFilters);
                }
            }
        });
    }

    async function showScooterDetail(scooter) {
        try {
            // Fetch full scooter details with owner info
            const result = await API.call('scooters', 'get', { id: scooter.id });
            const fullScooter = result.scooter || scooter;

            let html = '<div class="detail-grid">';

            // Basic Information
            html += '<div class="detail-section">';
            html += '<h4>Scooter Information</h4>';
            html += `<p><strong>Serial Number:</strong> ${fullScooter.serial_number || 'N/A'}</p>`;
            html += `<p><strong>Type:</strong> ${fullScooter.scooter_type || 'N/A'}</p>`;
            html += `<p><strong>Status:</strong> ${getStatusBadge(fullScooter.status)}</p>`;
            html += `<p><strong>Firmware Version:</strong> ${fullScooter.firmware_version || 'N/A'}</p>`;
            html += `<p><strong>Hardware Version:</strong> ${fullScooter.hardware_version || 'N/A'}</p>`;
            html += '</div>';

            // Registration Information
            html += '<div class="detail-section">';
            html += '<h4>Registration</h4>';
            html += `<p><strong>Country:</strong> ${fullScooter.country_of_registration || 'N/A'}</p>`;
            html += `<p><strong>Registration Date:</strong> ${formatDate(fullScooter.registration_date)}</p>`;
            html += `<p><strong>Created:</strong> ${formatDate(fullScooter.created_at)}</p>`;
            html += '</div>';

            // Owner Information (if available)
            if (fullScooter.owner_id || result.owner) {
                html += '<div class="detail-section">';
                html += '<h4>Owner</h4>';
                if (result.owner) {
                    html += `<p><strong>Name:</strong> ${result.owner.first_name || ''} ${result.owner.last_name || ''}</p>`;
                    html += `<p><strong>Email:</strong> ${result.owner.email || 'N/A'}</p>`;
                } else {
                    html += `<p><strong>Owner ID:</strong> ${fullScooter.owner_id}</p>`;
                }
                html += '</div>';
            }

            // Service History (if available)
            if (result.service_jobs && result.service_jobs.length > 0) {
                html += '<div class="detail-section">';
                html += '<h4>Recent Service History</h4>';
                html += '<ul>';
                result.service_jobs.slice(0, 5).forEach(job => {
                    html += `<li>${formatDate(job.booked_date)} - ${job.status} ${job.issue_description ? `(${job.issue_description})` : ''}</li>`;
                });
                html += '</ul>';
                html += '</div>';
            }

            // Telemetry Summary (if available)
            if (result.latest_telemetry) {
                html += '<div class="detail-section">';
                html += '<h4>Latest Telemetry</h4>';
                html += `<p><strong>Last Seen:</strong> ${formatDate(result.latest_telemetry.timestamp)}</p>`;
                if (result.latest_telemetry.battery_voltage) {
                    html += `<p><strong>Battery:</strong> ${result.latest_telemetry.battery_voltage}V</p>`;
                }
                html += '</div>';
            }

            html += '</div>';

            // Add action buttons
            const actions = [
                {
                    label: 'Edit Scooter',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editScooter(fullScooter), 100);
                    }
                }
            ];

            if (fullScooter.status !== 'decommissioned') {
                actions.push({
                    label: 'Decommission',
                    class: 'btn-danger',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => changeScooterStatus(fullScooter, 'decommissioned'), 100);
                    }
                });
            }

            ModalComponent.show(`Scooter: ${fullScooter.serial_number}`, html, actions);
        } catch (err) {
            toast('Failed to load scooter details', 'error');
        }
    }

    function editScooter(scooter) {
        const statusOptions = [
            { value: 'active', label: 'Active' },
            { value: 'in_service', label: 'In Service' },
            { value: 'stolen', label: 'Stolen' },
            { value: 'decommissioned', label: 'Decommissioned' }
        ];

        const fields = [
            {
                name: 'status',
                label: 'Status',
                type: 'select',
                value: scooter.status,
                options: statusOptions
            },
            {
                name: 'model',
                label: 'Model',
                type: 'text',
                value: scooter.model || ''
            },
            {
                name: 'firmware_version',
                label: 'Firmware Version',
                type: 'text',
                value: scooter.firmware_version || ''
            },
            {
                name: 'country_of_registration',
                label: 'Country of Registration',
                type: 'text',
                value: scooter.country_of_registration || '',
                placeholder: 'US, GB, etc.'
            }
        ];

        FormComponent.show('Edit Scooter', fields, async (formData) => {
            try {
                await API.call('scooters', 'update', {
                    id: scooter.id,
                    ...formData
                });
                toast('Scooter updated successfully', 'success');
                ModalComponent.close();
                await load(currentFilters);
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    async function changeScooterStatus(scooter, newStatus) {
        if (!confirm(`Are you sure you want to change this scooter's status to "${newStatus}"?`)) {
            return;
        }

        try {
            await API.call('scooters', 'update', {
                id: scooter.id,
                status: newStatus
            });
            toast(`Scooter status changed to ${newStatus}`, 'success');
            await load(currentFilters);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function getStatusBadge(status) {
        const badges = {
            'active': 'badge-active',
            'in_service': 'badge-warning',
            'stolen': 'badge-danger',
            'decommissioned': 'badge-inactive'
        };
        const badgeClass = badges[status] || 'badge-inactive';
        return `<span class="badge ${badgeClass}">${status || 'Unknown'}</span>`;
    }

    function applyFilters() {
        const filters = {
            search: $('#scooters-search')?.value.trim() || undefined,
            status: $('#scooters-status-filter')?.value || undefined,  // Server-side filter
            country_of_registration: $('#scooters-country-filter')?.value || undefined  // Server-side filter
        };

        // Remove undefined values
        Object.keys(filters).forEach(key => {
            if (filters[key] === undefined) delete filters[key];
        });

        currentPage = 1; // Reset to first page
        load(filters);
    }

    function init() {
        // Search input with debounce
        let searchTimeout;
        $('#scooters-search')?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => applyFilters(), 500);
        });

        // Filter dropdowns
        $('#scooters-status-filter')?.addEventListener('change', applyFilters);
        $('#scooters-country-filter')?.addEventListener('change', applyFilters);

        // Export button
        $('#scooters-export-btn')?.addEventListener('click', () => {
            exportCSV(currentScooters, 'scooters.csv');
        });
    }

    function onNavigate() {
        currentPage = 1;
        currentFilters = {};
        load();
    }

    return { init, onNavigate };
})();
