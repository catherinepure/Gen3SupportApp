/**
 * Dashboard Page
 * Overview stats and quick actions
 */

const DashboardPage = (() => {
    const { $, toast } = Utils;

    async function load() {
        try {
            $('#dashboard-content').innerHTML = Utils.loading('Loading dashboard...');

            const stats = await API.call('dashboard', 'stats', {});

            renderDashboard(stats);

        } catch (err) {
            toast(err.message, 'error');
            $('#dashboard-content').innerHTML = Utils.errorState('Failed to load dashboard');
        }
    }

    function renderDashboard(stats) {
        let html = '<div class="dashboard-grid">';

        // Stat cards
        html += renderStatCard('Users', stats.users || 0, 'primary');
        html += renderStatCard('Scooters', stats.scooters || 0, 'active');
        html += renderStatCard('Distributors', stats.distributors || 0, 'warning');
        html += renderStatCard('Workshops', stats.workshops || 0, 'danger');

        html += '</div>';

        html += '<div class="dashboard-section">';
        html += '<h3>Welcome to Gen3 Admin</h3>';
        html += '<p>Select a section from the sidebar to get started.</p>';
        html += '</div>';

        $('#dashboard-content').innerHTML = html;
    }

    function renderStatCard(label, value, type) {
        return `
            <div class="stat-card stat-card-${type}">
                <div class="stat-label">${label}</div>
                <div class="stat-value">${value.toLocaleString()}</div>
            </div>
        `;
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
