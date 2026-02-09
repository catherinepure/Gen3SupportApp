/**
 * Router Module
 * Handles SPA navigation between pages
 */

const Router = (() => {
    const { $, $$ } = Utils;
    let initialized = false;

    function navigate(page) {
        console.log(`Router.navigate('${page}')`);
        const previousPage = State.get('currentPage');

        // Clear breadcrumbs on page navigation
        if (typeof Breadcrumbs !== 'undefined') {
            Breadcrumbs.clear();
        }

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
        } else {
            console.warn(`Page element #${page}-page not found!`);
        }

        // Trigger page lifecycle
        if (window.Pages && window.Pages[page]) {
            // Call onLeave on previous page
            if (previousPage && window.Pages[previousPage]?.onLeave) {
                console.log(`Calling ${previousPage}.onLeave()`);
                window.Pages[previousPage].onLeave();
            }

            // Call onNavigate on current page
            if (window.Pages[page].onNavigate) {
                console.log(`Calling ${page}.onNavigate()`);
                window.Pages[page].onNavigate();
            } else {
                console.warn(`${page} has no onNavigate method!`);
            }
        } else {
            console.error(`Page '${page}' not found in Pages registry!`);
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;

        // Set up nav click handlers
        $$('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const page = item.dataset.page;
                if (page) {
                    navigate(page);
                }
            });
        });

        // Logout is handled by Auth.setupLogoutButton() — do not duplicate here
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
