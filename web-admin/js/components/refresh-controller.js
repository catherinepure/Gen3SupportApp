/**
 * Refresh Controller
 * Provides manual refresh button, auto-refresh toggle, and "last updated" timestamp
 * for any page that loads data.
 *
 * Usage in page modules:
 *   onNavigate() { RefreshController.attach('#page-content', load); load(); }
 *   onLeave()    { RefreshController.detach(); }
 */

const RefreshController = (() => {
    let timerId = null;
    let currentInterval = 0; // 0 = auto-refresh off
    let lastRefreshTime = null;
    let refreshFn = null;
    let containerEl = null;
    let timestampTimerId = null;

    /**
     * Attach refresh controls to the current page header.
     * @param {string} contentSelector - Selector inside the page (e.g. '#dashboard-content')
     * @param {Function} loadFunction - The function to call to refresh data
     */
    function attach(contentSelector, loadFunction) {
        detach(); // Clean up any previous attachment
        refreshFn = loadFunction;
        lastRefreshTime = new Date();

        // Find the page header to inject controls into
        const contentEl = document.querySelector(contentSelector);
        const pageEl = contentEl?.closest('.page-content');
        const header = pageEl?.querySelector('.page-header');
        if (!header) return;

        // Create refresh controls
        const controls = document.createElement('div');
        controls.className = 'refresh-controls';
        controls.innerHTML = `
            <span class="refresh-timestamp text-sm text-muted">Updated just now</span>
            <button class="btn btn-sm btn-outline refresh-btn" title="Refresh data">&#x21BB;</button>
            <select class="filter-select refresh-interval" title="Auto-refresh interval">
                <option value="0">Auto: Off</option>
                <option value="30">Every 30s</option>
                <option value="60">Every 60s</option>
                <option value="120">Every 2min</option>
            </select>
        `;
        header.appendChild(controls);
        containerEl = controls;

        // Bind refresh button
        controls.querySelector('.refresh-btn').addEventListener('click', doRefresh);

        // Bind interval dropdown
        const intervalSelect = controls.querySelector('.refresh-interval');
        intervalSelect.value = String(currentInterval);
        intervalSelect.addEventListener('change', (e) => {
            setAutoInterval(parseInt(e.target.value));
        });

        // Start timestamp updater
        timestampTimerId = window.setInterval(updateTimestamp, 10000);
    }

    /**
     * Remove refresh controls and stop any active timer.
     */
    function detach() {
        stopTimer();
        refreshFn = null;
        if (containerEl) {
            containerEl.remove();
            containerEl = null;
        }
        if (timestampTimerId) {
            window.clearInterval(timestampTimerId);
            timestampTimerId = null;
        }
    }

    /**
     * Perform a refresh — calls the load function.
     * Skips refresh if a modal is currently open.
     */
    function doRefresh() {
        if (!refreshFn) return;

        // Don't refresh if a modal is open (user might be editing)
        const modal = document.querySelector('#detail-modal, .modal');
        if (modal && !modal.classList.contains('hidden') && modal.style.display !== 'none') {
            console.log('RefreshController: skipping refresh, modal is open');
            return;
        }

        lastRefreshTime = new Date();
        updateTimestamp();

        // Visual feedback on the button
        if (containerEl) {
            const btn = containerEl.querySelector('.refresh-btn');
            if (btn) {
                btn.classList.add('spinning');
                setTimeout(() => btn.classList.remove('spinning'), 600);
            }
        }

        refreshFn();
    }

    /**
     * Set auto-refresh interval in seconds. 0 = off.
     */
    function setAutoInterval(seconds) {
        currentInterval = seconds;
        stopTimer();
        if (seconds > 0) {
            timerId = window.setInterval(doRefresh, seconds * 1000);
        }
    }

    function stopTimer() {
        if (timerId) {
            window.clearInterval(timerId);
            timerId = null;
        }
    }

    function updateTimestamp() {
        if (!containerEl || !lastRefreshTime) return;
        const el = containerEl.querySelector('.refresh-timestamp');
        if (el) {
            el.textContent = 'Updated ' + Utils.timeAgo(lastRefreshTime);
        }
    }

    return { attach, detach, doRefresh };
})();
