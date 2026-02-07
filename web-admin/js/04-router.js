/**
 * Router Module
 * Handles SPA navigation between pages
 */

const Router = (() => {
    const { $, $$ } = Utils;

    function navigate(page) {
        const previousPage = State.get('currentPage');

        // Update state
        State.set('currentPage', page);

        // Update active nav item
        $$('.nav-item').forEach(item => item.classList.remove('active'));
        const navItem = $(`.nav-item[data-page="${page}"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // Hide all pages
        $$('.page-content').forEach(p => p.classList.add('hidden'));

        // Show current page
        const pageEl = $(`#${page}-page`);
        if (pageEl) {
            pageEl.classList.remove('hidden');
        }

        // Trigger page lifecycle
        if (window.Pages && window.Pages[page]) {
            // Call onLeave on previous page
            if (previousPage && window.Pages[previousPage]?.onLeave) {
                window.Pages[previousPage].onLeave();
            }

            // Call onNavigate on current page
            if (window.Pages[page].onNavigate) {
                window.Pages[page].onNavigate();
            }
        }
    }

    function init() {
        // Set up nav click handlers
        $$('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) {
                    navigate(page);
                }
            });
        });

        // Set up logout button
        const logoutBtn = $('#logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to logout?')) {
                    Auth.handleLogout();
                }
            });
        }
    }

    function getCurrentPage() {
        return State.get('currentPage');
    }

    return {
        navigate,
        init,
        getCurrentPage
    };
})();
