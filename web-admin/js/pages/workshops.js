/** Workshops Page */
const WorkshopsPage = (() => {
    const { $, toast, exportCSV, formatDate } = Utils;
    let currentData = [];
    let distributorsList = [];

    const COUNTRIES = ['US', 'GB', 'IE', 'DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'SE', 'NO', 'DK', 'FI', 'AT', 'CH', 'PL'];

    async function load() {
        try {
            // Clear breadcrumbs when returning to main list
            Breadcrumbs.clear();

            $('#workshops-content').innerHTML = Utils.loading();

            // Load workshops and distributors in parallel
            const [workshopsResult, distributorsResult] = await Promise.all([
                API.call('workshops', 'list', { limit: 100 }),
                API.call('distributors', 'list', { limit: 100 })
            ]);

            currentData = workshopsResult.workshops || workshopsResult.data || [];
            distributorsList = distributorsResult.distributors || distributorsResult.data || [];

            TableComponent.render('#workshops-content', currentData, [
                { key: 'name', label: 'Name' },
                { key: 'activation_code_hash', label: 'Code Status', format: (val, row) => {
                    if (val) return '<span class="badge badge-success">Encrypted</span>';
                    if (row.activation_code) return '<span class="badge badge-warning">Legacy</span>';
                    return '<span class="badge badge-inactive">None</span>';
                }},
                { key: 'service_area_countries', label: 'Service Areas', format: (val) => Array.isArray(val) ? val.join(', ') : val || 'N/A' },
                { key: 'parent_distributor_id', label: 'Parent Distributor', format: (val) => val ? 'Linked' : 'Independent' },
                { key: 'is_active', label: 'Status', format: (val) => val ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>' },
                { key: 'created_at', label: 'Created', format: formatDate }
            ], {
                onRowClick: showWorkshopDetail
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

            let html = '<div class="detail-grid">';

            html += '<div class="detail-section">';
            html += '<h4>Workshop Information</h4>';
            html += `<p><strong>Name:</strong> ${w.name}</p>`;
            html += `<p><strong>Email:</strong> ${w.email || 'N/A'}</p>`;
            html += `<p><strong>Phone:</strong> ${w.phone || 'N/A'}</p>`;
            html += `<p><strong>Status:</strong> ${w.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge badge-inactive">Inactive</span>'}</p>`;
            html += `<p><strong>Type:</strong> ${w.parent_distributor_id ? 'Linked to Distributor' : 'Independent'}</p>`;
            html += '</div>';

            // Activation Code
            html += '<div class="detail-section">';
            html += '<h4>Activation Code</h4>';
            if (w.activation_code_plaintext) {
                // Show plaintext code (only visible to manufacturer_admin)
                html += '<p><strong>Code:</strong></p>';
                html += `<p><code style="font-size: 1.4em; background: #e8f5e9; padding: 12px 16px; border-radius: 6px; display: inline-block; font-weight: bold; letter-spacing: 1px;">${w.activation_code_plaintext}</code></p>`;
                html += '<p class="text-muted" style="font-size: 0.9em; margin-top: 10px;">Share this code with the workshop for registration.</p>';
                if (w.activation_code_created_at) {
                    html += `<p class="text-muted"><strong>Created:</strong> ${formatDate(w.activation_code_created_at)}</p>`;
                }
                if (w.activation_code_expires_at) {
                    const expires = new Date(w.activation_code_expires_at);
                    const isExpired = expires < new Date();
                    html += `<p class="text-muted"><strong>Expires:</strong> ${formatDate(w.activation_code_expires_at)} `;
                    if (isExpired) {
                        html += '<span class="badge badge-danger">Expired - Regenerate Required</span>';
                    } else {
                        html += '<span class="badge badge-success">Valid</span>';
                    }
                    html += '</p>';
                }
            } else if (w.activation_code_hash) {
                // Has hash but no plaintext (shouldn't happen with new system)
                html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-success">Secured</span></p>';
                html += '<p class="text-muted" style="font-size: 0.9em;">Code was created before plaintext storage. Use "Regenerate Code" button below to create a new one.</p>';
            } else if (w.activation_code) {
                // Legacy plaintext code (old format)
                html += `<p><strong>Code:</strong> <code style="font-size: 1.2em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">${w.activation_code}</code></p>`;
                html += '<p class="text-warning" style="font-size: 0.9em; margin-top: 10px;">⚠️ Legacy format - click "Regenerate Code" below to upgrade</p>';
            } else {
                html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-inactive">No Code</span></p>';
                html += '<p class="text-muted" style="font-size: 0.9em;">Click "Regenerate Code" below to create an activation code.</p>';
            }
            html += '</div>';

            if (w.parent_distributor_id) {
                const parentDist = distributorsList.find(d => d.id === w.parent_distributor_id);
                html += '<div class="detail-section">';
                html += '<h4>Parent Distributor</h4>';
                html += `<p><strong>Name:</strong> ${w.distributors?.name || parentDist?.name || 'Unknown'}</p>`;
                html += '</div>';
            }

            html += '<div class="detail-section">';
            html += '<h4>Service Coverage</h4>';
            if (w.service_area_countries && w.service_area_countries.length > 0) {
                html += '<p><strong>Countries:</strong></p><ul>';
                w.service_area_countries.forEach(country => {
                    html += `<li>${country}</li>`;
                });
                html += '</ul>';
            } else {
                html += '<p class="text-muted">No service areas defined</p>';
            }
            html += '</div>';

            html += '<div class="detail-section">';
            html += '<h4>Statistics</h4>';
            html += `<p><strong>Staff Members:</strong> ${staff.length}</p>`;
            html += `<p><strong>Active Service Jobs:</strong> ${activeJobCount}</p>`;
            html += '</div>';

            if (staff.length > 0) {
                html += '<div class="detail-section">';
                html += '<h4>Staff</h4>';
                staff.forEach(s => {
                    html += `<p>${s.first_name || ''} ${s.last_name || ''} (${s.email}) ${s.is_active ? '✓' : '✗'}</p>`;
                });
                html += '</div>';
            }

            if (addresses.length > 0) {
                html += '<div class="detail-section">';
                html += '<h4>Addresses</h4>';
                addresses.forEach(addr => {
                    html += `<p><strong>${addr.address_type}:</strong></p>`;
                    html += `<p>${addr.street_address}</p>`;
                    html += `<p>${addr.city}, ${addr.postcode}</p>`;
                    html += `<p>${addr.country}</p>`;
                });
                html += '</div>';
            }

            html += '<div class="detail-section">';
            html += '<h4>Timestamps</h4>';
            html += `<p><strong>Created:</strong> ${formatDate(w.created_at)}</p>`;
            html += `<p><strong>Updated:</strong> ${formatDate(w.updated_at)}</p>`;
            html += '</div>';

            html += '</div>';

            // Add action buttons
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
                    label: 'Regenerate Code',
                    class: 'btn-warning',
                    onClick: () => {
                        ModalComponent.close();
                        setTimeout(() => regenerateActivationCode(w), 100);
                    }
                }
            ];

            // Add View Jobs button
            actions.push({
                label: 'View Service Jobs',
                class: 'btn-info',
                onClick: () => {
                    ModalComponent.close();
                    setTimeout(() => showWorkshopJobs(w), 100);
                }
            });

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

            // Show breadcrumbs
            Breadcrumbs.show([
                {label: 'Workshops', onClick: () => { ModalComponent.close(); }},
                {label: w.name}
            ]);

            ModalComponent.show('Workshop Detail', html, actions);
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
                <div style="margin-bottom: 20px;">
                    <h3>${workshop.name} - Service Jobs</h3>
                    <div style="display: flex; gap: 10px; margin-top: 15px; flex-wrap: wrap;">
                        <select id="job-status-filter" class="filter-select" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
                            <option value="">All Statuses</option>
                            <option value="booked">Booked</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="cancelled">Cancelled</option>
                        </select>

                        <select id="job-date-filter" class="filter-select" style="padding: 8px; border-radius: 4px; border: 1px solid #ddd;">
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

                <div id="jobs-summary" style="margin-top: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px;">
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
                container.innerHTML = '<p class="text-muted" style="padding: 20px; text-align: center;">No jobs found matching the filters.</p>';
            } else {
                let html = '<div style="display: flex; flex-direction: column; gap: 10px;">';

                filteredJobs.forEach(job => {
                    const statusClass = {
                        'booked': 'badge-info',
                        'in_progress': 'badge-warning',
                        'completed': 'badge-success',
                        'cancelled': 'badge-inactive'
                    }[job.status] || 'badge-inactive';

                    html += `
                        <div class="job-card" data-job-id="${job.id}" style="border: 1px solid #e0e0e0; border-radius: 6px; padding: 12px; background: white; cursor: pointer; transition: box-shadow 0.2s;">
                            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                                <div>
                                    <strong>Job #${job.id.substring(0, 8)}</strong>
                                    <span class="badge ${statusClass}" style="margin-left: 8px;">${job.status}</span>
                                </div>
                                <span style="font-size: 0.85em; color: #666;">${formatDate(job.booked_date || job.created_at)}</span>
                            </div>
                            <p style="margin: 4px 0; font-size: 0.9em;"><strong>Scooter:</strong> ${job.scooters?.zyd_serial || 'N/A'}</p>
                            <p style="margin: 4px 0; font-size: 0.9em;"><strong>Customer:</strong> ${job.users?.email || 'N/A'}</p>
                            <p style="margin: 4px 0; font-size: 0.9em; color: #555;">${job.issue_description || 'No description'}</p>
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

                    // Add hover effect
                    card.addEventListener('mouseenter', () => {
                        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        card.style.borderColor = '#0066cc';
                    });
                    card.addEventListener('mouseleave', () => {
                        card.style.boxShadow = '';
                        card.style.borderColor = '#e0e0e0';
                    });
                });

                html += '</div>';
                container.innerHTML = html;
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
                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
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
                options: COUNTRIES.map(c => ({ value: c, label: c }))
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

                // Show activation code
                const activationCode = result.activation_code || result.workshop?.activation_code;
                if (activationCode) {
                    setTimeout(() => {
                        ModalComponent.show('Activation Code Generated',
                            `<div style="text-align: center;">
                                <p>Workshop created successfully!</p>
                                <p style="margin: 20px 0;"><strong>Activation Code:</strong></p>
                                <p><code style="font-size: 1.5em; background: #f0f0f0; padding: 15px 20px; border-radius: 4px; display: inline-block;">${activationCode}</code></p>
                                <p class="text-muted" style="margin-top: 20px;">Save this code - it's needed for workshop registration.</p>
                            </div>`);
                    }, 300);
                }

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
                options: COUNTRIES.map(c => ({ value: c, label: c }))
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

    async function regenerateActivationCode(workshop) {
        if (!confirm(`Generate a new activation code for "${workshop.name}"? The old code will be invalidated immediately.`)) {
            return;
        }

        try {
            const result = await API.call('workshops', 'regenerate-code', { id: workshop.id });

            // Show new code in modal (ONE TIME)
            ModalComponent.show('New Activation Code Generated',
                `<div style="text-align: center;">
                    <p>The new activation code for <strong>${workshop.name}</strong> is:</p>
                    <p style="margin: 20px 0;"><code style="font-size: 1.8em; background: #fff3cd; padding: 20px 30px; border-radius: 8px; display: inline-block; border: 2px solid #ffc107;">${result.activation_code}</code></p>
                    <p class="text-danger" style="margin-top: 20px; font-weight: bold;">⚠️ Save this code immediately!</p>
                    <p class="text-muted">This code cannot be retrieved later and will expire in 90 days.</p>
                </div>`);

            toast('Activation code regenerated', 'success');
            await load();
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    function init() {
        $('#workshops-export-btn')?.addEventListener('click', () => exportCSV(currentData, 'workshops.csv'));
        $('#workshops-create-btn')?.addEventListener('click', createWorkshop);
    }

    return { init, onNavigate: load };
})();
