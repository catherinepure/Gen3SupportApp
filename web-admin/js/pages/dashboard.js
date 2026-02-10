/**
 * Dashboard Page
 * Overview stats, status breakdowns, and recent activity
 */

const DashboardPage = (() => {
    const { $, toast, formatDate, timeAgo, statusBadge, badge } = Utils;

    async function load() {
        try {
            $('#dashboard-content').innerHTML = Utils.loading('Loading dashboard...');

            // Fetch stats, recent events, and recent service jobs in parallel
            const [statsResult, eventsResult, jobsResult] = await Promise.all([
                API.call('dashboard', 'stats', {}),
                API.call('events', 'list', { limit: 10 }),
                API.call('service-jobs', 'list', { limit: 5 })
            ]);

            const stats = statsResult.dashboard || statsResult;
            const events = eventsResult.events || eventsResult.data || [];
            const jobs = jobsResult.jobs || jobsResult['service-jobs'] || jobsResult.data || [];

            renderDashboard(stats, events, jobs);

        } catch (err) {
            toast(err.message, 'error');
            $('#dashboard-content').innerHTML = Utils.errorState('Failed to load dashboard');
        }
    }

    function renderDashboard(stats, events, jobs) {
        let html = '';

        // --- Top Stats Row ---
        html += '<div class="stats-grid">';
        html += renderStatCard('Users', stats.users || 0, 'primary', 'users');
        html += renderStatCard('Scooters', stats.scooters || 0, 'active', 'scooters');
        html += renderStatCard('Distributors', stats.distributors || 0, 'warning', 'distributors');
        html += renderStatCard('Workshops', stats.workshops || 0, 'danger', 'workshops');
        html += '</div>';

        // --- Two-column layout: Recent Activity + Service Jobs ---
        html += '<div class="dashboard-two-col">';

        // Recent Activity Panel
        html += '<div class="dashboard-section">';
        html += '<div class="flex-header mb-3">';
        html += '<h3 class="m-0">Recent Activity</h3>';
        html += '<button class="btn btn-sm btn-outline" id="dash-view-events">View All</button>';
        html += '</div>';

        if (events.length > 0) {
            html += '<div class="activity-list">';
            events.forEach(event => {
                const eventIcon = getEventIcon(event.event_type);
                html += `
                    <div class="activity-item">
                        <div class="activity-icon">${eventIcon}</div>
                        <div class="activity-content">
                            <div class="activity-title">${formatEventType(event.event_type)}</div>
                            <div class="activity-meta">
                                ${event.country ? event.country + ' &middot; ' : ''}${timeAgo(event.timestamp)}
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<p class="text-muted text-center" style="padding: 30px 0;">No recent activity</p>';
        }
        html += '</div>';

        // Recent Service Jobs Panel
        html += '<div class="dashboard-section">';
        html += '<div class="flex-header mb-3">';
        html += '<h3 class="m-0">Recent Service Jobs</h3>';
        html += '<button class="btn btn-sm btn-outline" id="dash-view-jobs">View All</button>';
        html += '</div>';

        if (jobs.length > 0) {
            html += '<div>';
            jobs.forEach(job => {
                const scooterLabel = job.scooters?.zyd_serial || 'Unknown';
                const workshopLabel = job.workshops?.name || 'Unknown';
                html += `
                    <div class="job-card" style="border-left: 3px solid ${getStatusColor(job.status)};">
                        <div class="flex-header">
                            <div>
                                <span class="font-medium">${scooterLabel}</span>
                                ${statusBadge(job.status)}
                            </div>
                            <span class="text-xs text-muted">${timeAgo(job.booked_date || job.created_at)}</span>
                        </div>
                        <div class="text-sm text-muted mt-1">
                            ${workshopLabel} &middot; ${job.issue_description ? (job.issue_description.length > 60 ? job.issue_description.substring(0, 60) + '...' : job.issue_description) : 'No description'}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<p class="text-muted text-center" style="padding: 30px 0;">No service jobs</p>';
        }
        html += '</div>';

        html += '</div>'; // End two-column layout

        // --- Scooter Status Breakdown (if we have breakdown data) ---
        if (stats.scooter_statuses || stats.scooters > 0) {
            html += '<div class="dashboard-section mt-5">';
            html += '<h3>Scooter Status Overview</h3>';
            html += renderStatusBreakdown(stats.scooter_statuses, stats.scooters);
            html += '</div>';
        }

        $('#dashboard-content').innerHTML = html;

        // Attach navigation handlers after render
        $('#dash-view-events')?.addEventListener('click', () => Router.navigate('events'));
        $('#dash-view-jobs')?.addEventListener('click', () => Router.navigate('service-jobs'));

        // Make stat cards clickable
        document.querySelectorAll('.stat-card[data-page]').forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                Router.navigate(card.dataset.page);
            });
        });
    }

    function renderStatCard(label, value, type, page) {
        return `
            <div class="stat-card stat-card-${type}" data-page="${page}">
                <div class="stat-label">${label}</div>
                <div class="stat-value">${value.toLocaleString()}</div>
            </div>
        `;
    }

    function renderStatusBreakdown(statuses, total) {
        // If we don't have a breakdown from the API, show a simple message
        if (!statuses || typeof statuses !== 'object') {
            return `<p class="text-muted">Total scooters: <strong>${total}</strong></p>`;
        }

        const colors = {
            active: '#22c55e',
            in_service: '#f59e0b',
            stolen: '#ef4444',
            decommissioned: '#94a3b8'
        };

        let html = '<div class="flex-wrap gap-5 mt-3">';

        for (const [status, count] of Object.entries(statuses)) {
            const color = colors[status] || '#94a3b8';
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            html += `
                <div class="status-card" style="border-top: 3px solid ${color};">
                    <div class="status-count" style="color: ${color};">${count}</div>
                    <div class="status-label">${status.replace(/_/g, ' ')}</div>
                    <div class="status-pct">${pct}%</div>
                </div>
            `;
        }

        html += '</div>';
        return html;
    }

    function getEventIcon(type) {
        const icons = {
            'user_login': '&#x1F511;',
            'user_logout': '&#x1F6AA;',
            'user_register': '&#x1F464;',
            'scooter_scan': '&#x1F4F1;',
            'firmware_update': '&#x2B06;',
            'service_job_created': '&#x1F527;',
            'service_job_completed': '&#x2705;',
            'telemetry_upload': '&#x1F4CA;',
        };
        return icons[type] || '&#x26A1;';
    }

    function formatEventType(type) {
        if (!type) return 'Unknown Event';
        return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    function getStatusColor(status) {
        const colors = {
            'booked': '#3b82f6',
            'in_progress': '#f59e0b',
            'awaiting_parts': '#ef4444',
            'ready_for_collection': '#22c55e',
            'completed': '#94a3b8',
            'cancelled': '#d1d5db'
        };
        return colors[status] || '#94a3b8';
    }

    function init() {
        // No persistent event listeners needed
    }

    function onNavigate() {
        RefreshController.attach('#dashboard-content', load);
        load();
    }

    function onLeave() {
        RefreshController.detach();
    }

    return {
        init,
        onNavigate,
        onLeave
    };
})();
