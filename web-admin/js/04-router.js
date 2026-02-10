/**
 * Router Module
 * Handles SPA navigation between pages with hash-based URLs
 */

const Router = (() => {
    const { $, $$ } = Utils;
    let initialized = false;
    let navigating = false; // Prevents hashchange from re-triggering navigate

    function navigate(page) {
        if (navigating) return;
        console.log(`Router.navigate('${page}')`);
        const previousPage = State.get('currentPage');

        // Don't re-navigate to the same page
        if (previousPage === page) return;

        // Clear breadcrumbs on page navigation
        if (typeof Breadcrumbs !== 'undefined') {
            Breadcrumbs.clear();
        }

        // Update state
        State.set('currentPage', page);

        // Update URL hash without triggering hashchange handler
        navigating = true;
        if (window.location.hash !== '#' + page) {
            window.location.hash = page;
        }
        navigating = false;

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

        // Handle browser back/forward via hashchange
        window.addEventListener('hashchange', () => {
            if (navigating) return;
            const hash = window.location.hash.replace('#', '');
            if (hash && window.Pages && window.Pages[hash]) {
                navigate(hash);
            }
        });

        // Logout is handled by Auth.setupLogoutButton() — do not duplicate here
    }

    /**
     * Get the initial page from the URL hash, or default to 'dashboard'
     */
    function getInitialPage() {
        const hash = window.location.hash.replace('#', '');
        if (hash && window.Pages && window.Pages[hash]) {
            return hash;
        }
        return 'dashboard';
    }

    function getCurrentPage() {
        return State.get('currentPage');
    }

    return {
        navigate,
        init,
        getCurrentPage,
        getInitialPage
    };
})();
