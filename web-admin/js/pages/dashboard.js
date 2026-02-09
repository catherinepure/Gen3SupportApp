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
            const [stats, eventsResult, jobsResult] = await Promise.all([
                API.call('dashboard', 'stats', {}),
                API.call('events', 'list', { limit: 10 }),
                API.call('service-jobs', 'list', { limit: 5 })
            ]);

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
        html += '<div class="dashboard-grid">';
        html += renderStatCard('Users', stats.users || 0, 'primary', 'users');
        html += renderStatCard('Scooters', stats.scooters || 0, 'active', 'scooters');
        html += renderStatCard('Distributors', stats.distributors || 0, 'warning', 'distributors');
        html += renderStatCard('Workshops', stats.workshops || 0, 'danger', 'workshops');
        html += '</div>';

        // --- Two-column layout: Recent Activity + Service Jobs ---
        html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px;">';

        // Recent Activity Panel
        html += '<div class="dashboard-section">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">';
        html += '<h3 style="margin: 0;">Recent Activity</h3>';
        html += '<button class="btn btn-sm btn-outline" id="dash-view-events">View All</button>';
        html += '</div>';

        if (events.length > 0) {
            html += '<div class="activity-list">';
            events.forEach(event => {
                const eventIcon = getEventIcon(event.event_type);
                html += `
                    <div style="display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                        <div style="flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: #f0f4ff; display: flex; align-items: center; justify-content: center; font-size: 14px;">${eventIcon}</div>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-size: 0.9em; font-weight: 500;">${formatEventType(event.event_type)}</div>
                            <div style="font-size: 0.8em; color: #666; margin-top: 2px;">
                                ${event.country ? event.country + ' &middot; ' : ''}${timeAgo(event.timestamp)}
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<p style="color: #999; text-align: center; padding: 30px 0;">No recent activity</p>';
        }
        html += '</div>';

        // Recent Service Jobs Panel
        html += '<div class="dashboard-section">';
        html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">';
        html += '<h3 style="margin: 0;">Recent Service Jobs</h3>';
        html += '<button class="btn btn-sm btn-outline" id="dash-view-jobs">View All</button>';
        html += '</div>';

        if (jobs.length > 0) {
            html += '<div>';
            jobs.forEach(job => {
                const scooterLabel = job.scooters?.zyd_serial || 'Unknown';
                const workshopLabel = job.workshops?.name || 'Unknown';
                html += `
                    <div style="padding: 10px; margin-bottom: 8px; background: #f9f9f9; border-radius: 6px; border-left: 3px solid ${getStatusColor(job.status)};">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <span style="font-weight: 500;">${scooterLabel}</span>
                                ${statusBadge(job.status)}
                            </div>
                            <span style="font-size: 0.8em; color: #666;">${timeAgo(job.booked_date || job.created_at)}</span>
                        </div>
                        <div style="font-size: 0.85em; color: #555; margin-top: 4px;">
                            ${workshopLabel} &middot; ${job.issue_description ? (job.issue_description.length > 60 ? job.issue_description.substring(0, 60) + '...' : job.issue_description) : 'No description'}
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        } else {
            html += '<p style="color: #999; text-align: center; padding: 30px 0;">No service jobs</p>';
        }
        html += '</div>';

        html += '</div>'; // End two-column layout

        // --- Scooter Status Breakdown (if we have breakdown data) ---
        if (stats.scooter_statuses || stats.scooters > 0) {
            html += '<div class="dashboard-section" style="margin-top: 20px;">';
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
            return `<p style="color: #666;">Total scooters: <strong>${total}</strong></p>`;
        }

        const colors = {
            active: '#22c55e',
            in_service: '#f59e0b',
            stolen: '#ef4444',
            decommissioned: '#94a3b8'
        };

        let html = '<div style="display: flex; gap: 20px; flex-wrap: wrap; margin-top: 10px;">';

        for (const [status, count] of Object.entries(statuses)) {
            const color = colors[status] || '#94a3b8';
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            html += `
                <div style="flex: 1; min-width: 120px; text-align: center; padding: 15px; background: #f9f9f9; border-radius: 8px; border-top: 3px solid ${color};">
                    <div style="font-size: 1.5em; font-weight: bold; color: ${color};">${count}</div>
                    <div style="font-size: 0.85em; color: #555; margin-top: 4px;">${status.replace(/_/g, ' ')}</div>
                    <div style="font-size: 0.75em; color: #999;">${pct}%</div>
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
        load();
    }

    return {
        init,
        onNavigate
    };
})();
