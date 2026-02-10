/** Workshops Page */
const WorkshopsPage = (() => {
    const { $, toast, exportCSV, formatDate, COUNTRY_CODES } = Utils;
    let currentData = [];
    let distributorsList = [];
    let currentPage = 1;
    let totalRecords = 0;
    const PAGE_SIZE = 50;

    async function load() {
        try {
            // Clear breadcrumbs when returning to main list
            Breadcrumbs.clear();

            $('#workshops-content').innerHTML = Utils.loading();

            const offset = (currentPage - 1) * PAGE_SIZE;

            // Load workshops (paginated) and distributors (all, for reference) in parallel
            const [workshopsResult, distributorsResult] = await Promise.all([
                API.call('workshops', 'list', { limit: PAGE_SIZE, offset }),
                distributorsList.length > 0
                    ? Promise.resolve({ distributors: distributorsList })
                    : API.call('distributors', 'list', { limit: 200 })
            ]);

            currentData = workshopsResult.workshops || workshopsResult.data || [];
            totalRecords = workshopsResult.total || currentData.length;
            distributorsList = distributorsResult.distributors || distributorsResult.data || distributorsList;

            const totalPages = Math.ceil(totalRecords / PAGE_SIZE);

            TableComponent.render('#workshops-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'service_area_countries', label: 'Service Areas', format: (val) => Array.isArray(val) ? val.join(', ') : val || 'N/A' },
                { key: 'parent_distributor_id', label: 'Parent Distributor', format: (val) => val ? 'Linked' : 'Independent' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showWorkshopDetail,
                pagination: totalPages > 1 ? {
                    current: currentPage,
                    total: totalPages,
                    pageSize: PAGE_SIZE,
                    totalRecords
                } : null,
                onPageChange: (page) => {
                    currentPage = page;
                    load();
                }
            });
        } catch (err) {
            toast(err.message, 'error');
            $('#workshops-content').innerHTML = Utils.errorState('Failed to load workshops');
        }
    }

    async function showWorkshopDetail(workshop) {
        try {
            const result = await API.call('workshops', 'get', { id: workshop.id });
            const w = result.workshop;
            const addresses = result.addresses || [];
            const staff = result.staff || [];
            const activeJobCount = result.active_job_count || 0;

            // Build sections using DetailModal component
            const sections = [
                // Basic Info
                {
                    title: 'Workshop Information',
                    fields: [
                        { label: 'Name', value: w.name },
                        { label: 'Email', value: w.email || 'N/A' },
                        { label: 'Phone', value: w.phone || 'N/A' },
                        { label: 'Status', value: w.is_active, type: 'badge-boolean' },
                        { label: 'Type', value: w.parent_distributor_id ? 'Linked to Distributor' : 'Independent' }
                    ]
                },
                // Service Coverage
                {
                    title: 'Service Coverage',
                    fields: [
                        { label: 'Countries', value: w.service_area_countries, type: 'list' }
                    ]
                },
                // Statistics
                {
                    title: 'Statistics',
                    fields: [
                        { label: 'Staff Members', value: staff.length },
                        { label: 'Active Service Jobs', value: activeJobCount }
                    ]
                }
            ];

            // Parent distributor section (if applicable)
            if (w.parent_distributor_id) {
                const parentDist = distributorsList.find(d => d.id === w.parent_distributor_id);
                sections.splice(2, 0, {
                    title: 'Parent Distributor',
                    fields: [
                        { label: 'Name', value: w.distributors?.name || parentDist?.name || 'Unknown' }
                    ]
                });
            }

            // Staff section (if any)
            if (staff.length > 0) {
                let staffHtml = '';
                staff.forEach(s => {
                    staffHtml += `<p>${s.first_name || ''} ${s.last_name || ''} (${s.email}) ${s.is_active ? '✓' : '✗'}</p>`;
                });
                sections.push({
                    title: 'Staff',
                    html: staffHtml
                });
            }

            // Addresses section (using helper)
            if (addresses.length > 0) {
                sections.push(DetailModal.addressSection(addresses));
            }

            // Metadata (using helper)
            sections.push(DetailModal.metadataSection(w));

            // Action buttons
            const actions = [
                {
                    label: 'Edit Workshop',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editWorkshop(w), 100);
                    }
                },
                {
                    label: 'View Service Jobs',
                    class: 'btn-info',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => showWorkshopJobs(w), 100);
                    }
                }
            ];

            if (w.is_active) {
                actions.push({
                    label: 'Deactivate',
                    class: 'btn-danger',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => deactivateWorkshop(w), 100);
                    }
                });
            } else {
                actions.push({
                    label: 'Reactivate',
                    class: 'btn-success',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => reactivateWorkshop(w), 100);
                    }
                });
            }

            // Show modal using DetailModal component
            DetailModal.show('Workshop Detail', {
                sections,
                actions,
                breadcrumbs: [
                    { label: 'Workshops', onClick: () => { ModalComponent.close(); } },
                    { label: w.name }
                ]
            });
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function showWorkshopJobs(workshop) {
        try {
            // Fetch all jobs for this workshop
            const result = await API.call('service-jobs', 'list', {
                workshop_id: workshop.id,
                limit: 500
            });
            const allJobs = result.jobs || result.data || [];

            // Create filterable view
            let html = `
                <div class="mb-4">
                    <h3>${workshop.name} - Service Jobs</h3>
                    <div class="flex-wrap gap-3 mt-3">
                        <select id="job-status-filter" class="filter-select">
                            <option value="">All Statuses</option>
                            <option value="booked">Booked</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>

                        <select id="job-date-filter" class="filter-select">
                            <option value="">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="90days">Last 90 Days</option>
                        </select>

                        <button id="reset-filters-btn" class="btn btn-secondary btn-sm">Reset Filters</button>
                    </div>
                </div>

                <div id="jobs-container" style="max-height: 400px; overflow-y: auto;">
                    <!-- Jobs will be rendered here -->
                </div>

                <div id="jobs-summary" class="item-card mt-3">
                    <!-- Summary will be shown here -->
                </div>
            `;

            // Show breadcrumbs
            Breadcrumbs.show([
                {label: 'Workshops', onClick: () => { ModalComponent.close(); }},
                {label: workshop.name, onClick: () => { ModalComponent.close(); setTimeout(() => showWorkshopDetail(workshop), 100); }},
                {label: 'Service Jobs'}
            ]);

            ModalComponent.show('Workshop Service Jobs', html, [
                {
                    label: 'Close',
                    class: 'btn-secondary',
                    onClick: () => ModalComponent.close()
                }
            ]);

            // Set up filtering after modal is shown
            setTimeout(() => {
                setupJobFilters(allJobs);
            }, 100);

        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function setupJobFilters(allJobs) {
        const statusFilter = document.getElementById('job-status-filter');
        const dateFilter = document.getElementById('job-date-filter');
        const resetBtn = document.getElementById('reset-filters-btn');

        function renderJobs() {
            const selectedStatus = statusFilter?.value || '';
            const selectedDate = dateFilter?.value || '';

            // Filter jobs
            let filteredJobs = allJobs.filter(job => {
                // Status filter
                if (selectedStatus && job.status !== selectedStatus) return false;

                // Date filter
                if (selectedDate) {
                    const jobDate = new Date(job.booked_date || job.created_at);
                    const now = new Date();

                    if (selectedDate === 'today') {
                        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        if (jobDate < today) return false;
                    } else if (selectedDate === 'week') {
                        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        if (jobDate < weekAgo) return false;
                    } else if (selectedDate === 'month') {
                        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                        if (jobDate < monthAgo) return false;
                    } else if (selectedDate === '90days') {
                        const daysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                        if (jobDate < daysAgo) return false;
                    }
                }

                return true;
            });

            // Render jobs
            const container = document.getElementById('jobs-container');
            if (!container) return;

            if (filteredJobs.length === 0) {
                container.innerHTML = '<p class="text-muted text-center" style="padding: 20px;">No jobs found matching the filters.</p>';
            } else {
                let html = '<div class="flex-col gap-3">';

                filteredJobs.forEach(job => {
                    const statusClass = {
                        'booked': 'badge-info',
                        'in_progress': 'badge-warning',
                        'completed': 'badge-success',
                        'cancelled': 'badge-inactive'
                    }[job.status] || 'badge-inactive';

                    html += `
                        <div class="item-card-bordered job-card" data-job-id="${job.id}">
                            <div class="flex-header mb-2">
                                <div>
                                    <strong>Job #${job.id.substring(0, 8)}</strong>
                                    <span class="badge ${statusClass}" style="margin-left: 8px;">${job.status}</span>
                                </div>
                                <span class="text-sm text-muted">${formatDate(job.booked_date || job.created_at)}</span>
                            </div>
                            <p class="text-sm mb-2"><strong>Scooter:</strong> ${job.scooters?.zyd_serial || 'N/A'}</p>
                            <p class="text-sm mb-2"><strong>Customer:</strong> ${job.users?.email || 'N/A'}</p>
                            <p class="text-sm text-muted">${job.issue_description || 'No description'}</p>
                        </div>
                    `;
                });

                html += '</div>';
                container.innerHTML = html;

                // Add click handlers to job cards
                document.querySelectorAll('.job-card').forEach(card => {
                    card.addEventListener('click', () => {
                        const jobId = card.getAttribute('data-job-id');
                        const job = allJobs.find(j => j.id === jobId);
                        if (job) {
                            ModalComponent.close();
                            setTimeout(() => showJobDetail(job, workshop), 100);
                        }
                    });
                });
            }

            // Update summary
            const summary = document.getElementById('jobs-summary');
            if (summary) {
                const statusCounts = {
                    booked: filteredJobs.filter(j => j.status === 'booked').length,
                    in_progress: filteredJobs.filter(j => j.status === 'in_progress').length,
                    completed: filteredJobs.filter(j => j.status === 'completed').length,
                    cancelled: filteredJobs.filter(j => j.status === 'cancelled').length
                };

                summary.innerHTML = `
                    <div class="flex-wrap gap-5">
                        <span><strong>Total:</strong> ${filteredJobs.length} of ${allJobs.length} jobs</span>
                        <span><strong>Booked:</strong> ${statusCounts.booked}</span>
                        <span><strong>In Progress:</strong> ${statusCounts.in_progress}</span>
                        <span><strong>Completed:</strong> ${statusCounts.completed}</span>
                        <span><strong>Cancelled:</strong> ${statusCounts.cancelled}</span>
                    </div>
                `;
            }
        }

        // Attach event listeners
        if (statusFilter) statusFilter.addEventListener('change', renderJobs);
        if (dateFilter) dateFilter.addEventListener('change', renderJobs);
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (statusFilter) statusFilter.value = '';
                if (dateFilter) dateFilter.value = '';
                renderJobs();
            });
        }

        // Initial render
        renderJobs();
    }

    async function showJobDetail(job, workshop) {
        try {
            // Fetch fresh job details
            const result = await API.call('service-jobs', 'get', { id: job.id });
            const j = result.job || result.data || job;

            let html = '<div class="detail-grid">';

            // Job Info
            html += '<div class="detail-section">';
            html += '<h4>Job Information</h4>';
            html += `<p><strong>Job ID:</strong> ${j.id}</p>`;

            const statusClass = {
                'booked': 'badge-warning',
                'in_progress': 'badge-primary',
                'completed': 'badge-success',
                'cancelled': 'badge-inactive'
            }[j.status] || 'badge-inactive';
            html += `<p><strong>Status:</strong> <span class="badge ${statusClass}">${j.status}</span></p>`;
            html += `<p><strong>Booked Date:</strong> ${formatDate(j.booked_date || j.created_at)}</p>`;
            if (j.completed_date) {
                html += `<p><strong>Completed:</strong> ${formatDate(j.completed_date)}</p>`;
            }
            html += '</div>';

            // Scooter Info
            html += '<div class="detail-section">';
            html += '<h4>Scooter</h4>';
            if (j.scooters) {
                html += `<p><strong>Serial:</strong> ${j.scooters.zyd_serial || 'N/A'}</p>`;
                html += `<p><strong>Model:</strong> ${j.scooters.model || 'N/A'}</p>`;
                if (j.scooters.current_firmware) {
                    html += `<p><strong>Firmware:</strong> ${j.scooters.current_firmware}</p>`;
                }
            } else {
                html += '<p class="text-muted">Scooter information unavailable</p>';
            }
            html += '</div>';

            // Customer Info
            html += '<div class="detail-section">';
            html += '<h4>Customer</h4>';
            if (j.users) {
                html += `<p><strong>Email:</strong> ${j.users.email || 'N/A'}</p>`;
                html += `<p><strong>Name:</strong> ${j.users.full_name || 'N/A'}</p>`;
                if (j.users.phone) {
                    html += `<p><strong>Phone:</strong> ${j.users.phone}</p>`;
                }
            } else {
                html += '<p class="text-muted">Customer information unavailable</p>';
            }
            html += '</div>';

            // Issue & Resolution
            html += '<div class="detail-section full-width">';
            html += '<h4>Issue Description</h4>';
            html += `<p>${j.issue_description || 'No description provided'}</p>`;
            html += '</div>';

            if (j.resolution_notes) {
                html += '<div class="detail-section full-width">';
                html += '<h4>Resolution Notes</h4>';
                html += `<p>${j.resolution_notes}</p>`;
                html += '</div>';
            }

            // Timestamps
            html += '<div class="detail-section">';
            html += '<h4>Timestamps</h4>';
            html += `<p><strong>Created:</strong> ${formatDate(j.created_at)}</p>`;
            html += `<p><strong>Updated:</strong> ${formatDate(j.updated_at)}</p>`;
            html += '</div>';

            html += '</div>';

            // Action buttons
            const actions = [
                {
                    label: 'Edit Job',
                    class: 'btn-primary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => editJob(j, workshop), 100);
                    }
                },
                {
                    label: 'Back to Jobs',
                    class: 'btn-secondary',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => showWorkshopJobs(workshop), 100);
                    }
                }
            ];

            // Show breadcrumbs
            Breadcrumbs.show([
                {label: 'Workshops', onClick: () => { ModalComponent.close(); }},
                {label: workshop.name, onClick: () => { ModalComponent.close(); setTimeout(() => showWorkshopDetail(workshop), 100); }},
                {label: 'Service Jobs', onClick: () => { ModalComponent.close(); setTimeout(() => showWorkshopJobs(workshop), 100); }},
                {label: `Job #${j.id.substring(0, 8)}...`}
            ]);

            ModalComponent.show('Service Job Detail', html, actions);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function editJob(job, workshop) {
        const fields = [
            {
                name: 'status',
                label: 'Status *',
                type: 'select',
                required: true,
                value: job.status,
                options: [
                    { value: 'booked', label: 'Booked' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'cancelled', label: 'Cancelled' }
                ]
            },
            {
                name: 'booked_date',
                label: 'Booked Date',
                type: 'date',
                value: job.booked_date ? job.booked_date.split('T')[0] : ''
            },
            {
                name: 'completed_date',
                label: 'Completed Date',
                type: 'date',
                value: job.completed_date ? job.completed_date.split('T')[0] : '',
                help: 'Leave blank if not completed'
            },
            {
                name: 'issue_description',
                label: 'Issue Description',
                type: 'textarea',
                value: job.issue_description || '',
                placeholder: 'Describe the issue...'
            },
            {
                name: 'resolution_notes',
                label: 'Resolution Notes',
                type: 'textarea',
                value: job.resolution_notes || '',
                placeholder: 'Notes on how the issue was resolved...'
            }
        ];

        FormComponent.show('Edit Service Job', fields, async (formData) => {
            try {
                await API.call('service-jobs', 'update', {
                    id: job.id,
                    status: formData.status,
                    booked_date: formData.booked_date || null,
                    completed_date: formData.completed_date || null,
                    issue_description: formData.issue_description || null,
                    resolution_notes: formData.resolution_notes || null
                });

                toast('Service job updated successfully', 'success');
                ModalComponent.close();

                // Go back to job detail view
                setTimeout(async () => {
                    const result = await API.call('service-jobs', 'get', { id: job.id });
                    showJobDetail(result.job || result.data, workshop);
                }, 100);
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function createWorkshop() {
        const fields = [
            { name: 'name', label: 'Workshop Name *', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email' },
            { name: 'phone', label: 'Phone', type: 'text' },
            {
                name: 'parent_distributor_id',
                label: 'Parent Distributor (optional)',
                type: 'select',
                options: [
                    { value: '', label: '-- Independent Workshop --' },
                    ...distributorsList.map(d => ({ value: d.id, label: d.name }))
                ]
            },
            {
                name: 'service_area_countries',
                label: 'Service Area Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                options: COUNTRY_CODES.map(c => ({ value: c, label: c }))
            }
        ];

        FormComponent.show('Create Workshop', fields, async (formData) => {
            try {
                // Convert empty string to null for parent_distributor_id
                if (!formData.parent_distributor_id) {
                    formData.parent_distributor_id = null;
                }

                // Convert service_area_countries from select values to array
                const countries = formData.service_area_countries ?
                    (Array.isArray(formData.service_area_countries) ? formData.service_area_countries : [formData.service_area_countries]) : [];

                const result = await API.call('workshops', 'create', {
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    parent_distributor_id: formData.parent_distributor_id,
                    service_area_countries: countries
                });

                toast('Workshop created successfully', 'success');
                ModalComponent.close();
                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    function editWorkshop(workshop) {
        const fields = [
            { name: 'name', label: 'Workshop Name *', type: 'text', required: true, value: workshop.name },
            { name: 'email', label: 'Email', type: 'email', value: workshop.email || '' },
            { name: 'phone', label: 'Phone', type: 'text', value: workshop.phone || '' },
            {
                name: 'parent_distributor_id',
                label: 'Parent Distributor (optional)',
                type: 'select',
                value: workshop.parent_distributor_id || '',
                options: [
                    { value: '', label: '-- Independent Workshop --' },
                    ...distributorsList.map(d => ({ value: d.id, label: d.name }))
                ]
            },
            {
                name: 'service_area_countries',
                label: 'Service Area Countries (hold Ctrl/Cmd to select multiple)',
                type: 'select',
                multiple: true,
                value: workshop.service_area_countries || [],
                options: COUNTRY_CODES.map(c => ({ value: c, label: c }))
            }
        ];

        FormComponent.show('Edit Workshop', fields, async (formData) => {
            try {
                // Convert empty string to null for parent_distributor_id
                if (!formData.parent_distributor_id) {
                    formData.parent_distributor_id = null;
                }

                // Convert service_area_countries from select values to array
                const countries = formData.service_area_countries ?
                    (Array.isArray(formData.service_area_countries) ? formData.service_area_countries : [formData.service_area_countries]) : [];

                await API.call('workshops', 'update', {
                    id: workshop.id,
                    name: formData.name,
                    email: formData.email || null,
                    phone: formData.phone || null,
                    parent_distributor_id: formData.parent_distributor_id,
                    service_area_countries: countries,
                    is_active: workshop.is_active
                });
                toast('Workshop updated successfully', 'success');
                ModalComponent.close();
                await load();
            } catch (err) {
                toast(err.message, 'error');
            }
        });
    }

    async function deactivateWorkshop(workshop) {
        if (!confirm(`Are you sure you want to deactivate "${workshop.name}"?`)) {
            return;
        }

        try {
            await API.call('workshops', 'update', {
                id: workshop.id,
                is_active: false
            });
            toast('Workshop deactivated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    async function reactivateWorkshop(workshop) {
        try {
            await API.call('workshops', 'update', {
                id: workshop.id,
                is_active: true
            });
            toast('Workshop reactivated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function init() {
        $('#workshops-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'workshops.csv'));
        $('#workshops-create-btn')?.addEventListener('click', createWorkshop);
    }

    function onNavigate() {
        RefreshController.attach('#workshops-content', load);
        currentPage = 1;
        distributorsList = []; // Re-fetch reference data
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return { init, onNavigate, onLeave };
})();
