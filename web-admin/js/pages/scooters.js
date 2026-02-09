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

            // Build sections using DetailModal component
            const sections = [
                // Basic Information
                {
                    title: 'Scooter Information',
                    fields: [
                        { label: 'Serial Number', value: fullScooter.zyd_serial || fullScooter.serial_number || 'N/A', type: 'code' },
                        { label: 'Model', value: fullScooter.model || fullScooter.scooter_type || 'N/A' },
                        { label: 'Status', value: getStatusBadge(fullScooter.status), type: 'html' },
                        { label: 'Firmware Version', value: fullScooter.firmware_version || 'N/A' },
                        { label: 'Hardware Version', value: fullScooter.hw_version || fullScooter.hardware_version || 'N/A' }
                    ]
                },
                // Registration Information
                {
                    title: 'Registration',
                    fields: [
                        { label: 'Country', value: fullScooter.country_of_registration || 'N/A' },
                        { label: 'Registration Date', value: fullScooter.registration_date, type: 'date' },
                        { label: 'Created', value: fullScooter.created_at, type: 'date' }
                    ]
                }
            ];

            // Owner Information (if available)
            if (result.owners && result.owners.length > 0) {
                const ownerFields = [];
                result.owners.forEach((ownerLink, idx) => {
                    const owner = ownerLink.users || ownerLink;
                    const isPrimary = ownerLink.is_primary ? ' (Primary)' : '';
                    ownerFields.push({
                        label: `Owner ${idx + 1}${isPrimary}`,
                        value: `${owner.first_name || ''} ${owner.last_name || ''} - ${owner.email}`.trim()
                    });
                });
                sections.push({
                    title: 'Owners',
                    fields: ownerFields
                });
            } else if (fullScooter.owner_id || result.owner) {
                const owner = result.owner;
                sections.push({
                    title: 'Owner',
                    fields: [
                        { label: 'Name', value: owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : 'N/A' },
                        { label: 'Email', value: owner?.email || 'N/A' }
                    ]
                });
            }

            // Service History (if available)
            if (result.service_jobs && result.service_jobs.length > 0) {
                let jobsHtml = '<ul style="list-style-type: none; padding-left: 0;">';
                result.service_jobs.slice(0, 5).forEach(job => {
                    const statusBadge = getStatusBadge(job.status);
                    jobsHtml += `
                        <li style="margin-bottom: 8px; padding: 8px; background: #f9f9f9; border-radius: 4px;">
                            <strong>${formatDate(job.booked_date)}</strong> ${statusBadge}<br>
                            <span class="text-muted">${job.issue_description || 'No description'}</span>
                        </li>
                    `;
                });
                jobsHtml += '</ul>';
                sections.push({
                    title: `Recent Service History (${result.service_jobs.length})`,
                    html: jobsHtml
                });
            }

            // Telemetry Summary (if available)
            if (result.latest_telemetry) {
                const tel = result.latest_telemetry;
                sections.push({
                    title: 'Latest Telemetry',
                    fields: [
                        { label: 'Last Seen', value: tel.scanned_at || tel.timestamp, type: 'date' },
                        { label: 'Battery Voltage', value: tel.battery_voltage ? `${tel.battery_voltage}V` : 'N/A' },
                        { label: 'Battery SOC', value: tel.battery_soc !== null && tel.battery_soc !== undefined ? `${tel.battery_soc}%` : 'N/A' },
                        { label: 'Battery Health', value: tel.battery_health !== null && tel.battery_health !== undefined ? `${tel.battery_health}%` : 'N/A' }
                    ]
                });
            }

            // Metadata
            sections.push(DetailModal.metadataSection(fullScooter));

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

            // Show with DetailModal
            DetailModal.show(`Scooter: ${fullScooter.zyd_serial || fullScooter.serial_number}`, {
                sections,
                actions
            });
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
