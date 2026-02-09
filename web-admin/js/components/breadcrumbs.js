/**
 * Breadcrumbs Component
 *
 * Provides visual navigation trail for drill-down interfaces.
 * Automatically integrates with navigation stack for "back" functionality.
 *
 * Usage:
 *   Breadcrumbs.show([
 *     {label: 'Workshops', onClick: () => Router.navigate('workshops')},
 *     {label: 'London Service Centre', onClick: () => showWorkshopDetail(workshop)},
 *     {label: 'Service Jobs'}  // Current page, no onClick
 *   ]);
 */

const Breadcrumbs = (() => {
    let currentCrumbs = [];

    /**
     * Display breadcrumb trail
     * @param {Array} crumbs - Array of {label: string, onClick?: function, icon?: string}
     */
    function show(crumbs) {
        currentCrumbs = crumbs;
        render();
    }

    /**
     * Add a crumb to the existing trail
     * @param {Object} crumb - {label: string, onClick?: function}
     */
    function push(crumb) {
        currentCrumbs.push(crumb);
        render();
    }

    /**
     * Remove the last crumb (useful for going back)
     */
    function pop() {
        if (currentCrumbs.length > 1) {
            currentCrumbs.pop();
            render();
        }
    }

    /**
     * Clear all breadcrumbs
     */
    function clear() {
        currentCrumbs = [];
        const container = document.getElementById('breadcrumb-container');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
    }

    /**
     * Render breadcrumbs to DOM
     */
    function render() {
        const container = document.getElementById('breadcrumb-container');
        if (!container) {
            console.warn('Breadcrumb container not found');
            return;
        }

        if (currentCrumbs.length === 0) {
            container.innerHTML = '';
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        const html = currentCrumbs.map((crumb, index) => {
            const isLast = index === currentCrumbs.length - 1;
            const icon = crumb.icon ? `<span class="crumb-icon">${crumb.icon}</span>` : '';

            if (isLast || !crumb.onClick) {
                // Current page or non-clickable crumb
                return `<span class="crumb crumb-current">${icon}${crumb.label}</span>`;
            } else {
                // Clickable crumb
                return `<span class="crumb crumb-link" data-index="${index}">${icon}${crumb.label}</span>`;
            }
        }).join('<span class="crumb-separator">›</span>');

        container.innerHTML = html;

        // Attach click handlers
        container.querySelectorAll('.crumb-link').forEach(crumbEl => {
            crumbEl.addEventListener('click', () => {
                const index = parseInt(crumbEl.getAttribute('data-index'));
                const crumb = currentCrumbs[index];
                if (crumb && crumb.onClick) {
                    crumb.onClick();
                }
            });
        });
    }

    /**
     * Get current breadcrumb trail
     * @returns {Array} Current crumbs
     */
    function getCrumbs() {
        return [...currentCrumbs];
    }

    return {
        show,
        push,
        pop,
        clear,
        getCrumbs
    };
})();
