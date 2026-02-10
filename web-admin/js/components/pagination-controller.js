/**
 * Pagination Controller Component
 *
 * Reusable pagination logic to eliminate duplication across page modules.
 * Handles offset/limit calculations and provides consistent API.
 *
 * Usage:
 *   const pagination = PaginationController.create('users', 50);
 *
 *   async function loadData(filters = {}) {
 *     const result = await pagination.fetchPage(
 *       (params) => API.call('users', 'list', params),
 *       filters
 *     );
 *     renderTable(result.users, result.total);
 *     renderPaginationControls();
 *   }
 *
 *   function onPageChange(page) {
 *     pagination.setPage(page);
 *     loadData(currentFilters);
 *   }
 */

const PaginationController = (() => {
    /**
     * Pagination Manager class
     * Manages pagination state and provides helper methods
     */
    class PaginationManager {
        /**
         * Create a new PaginationManager
         * @param {string} resource - Resource name for logging/debugging
         * @param {number} pageSize - Records per page (default 50)
         */
        constructor(resource, pageSize = 50) {
            this.resource = resource;
            this.pageSize = pageSize;
            this.currentPage = 1;
            this.totalRecords = 0;
            this.totalPages = 0;
        }

        /**
         * Get pagination parameters for API call
         * @returns {Object} Object with limit and offset
         */
        getParams() {
            return {
                limit: this.pageSize,
                offset: (this.currentPage - 1) * this.pageSize
            };
        }

        /**
         * Set current page
         * @param {number} page - Page number (1-indexed)
         */
        setPage(page) {
            if (page < 1) page = 1;
            if (this.totalPages > 0 && page > this.totalPages) page = this.totalPages;
            this.currentPage = page;
        }

        /**
         * Go to next page
         */
        nextPage() {
            if (this.currentPage < this.totalPages) {
                this.currentPage++;
            }
        }

        /**
         * Go to previous page
         */
        prevPage() {
            if (this.currentPage > 1) {
                this.currentPage--;
            }
        }

        /**
         * Reset to first page
         */
        reset() {
            this.currentPage = 1;
            this.totalRecords = 0;
            this.totalPages = 0;
        }

        /**
         * Update total records (recalculates total pages)
         * @param {number} total - Total record count
         */
        setTotal(total) {
            this.totalRecords = total;
            this.totalPages = Math.ceil(total / this.pageSize);
        }

        /**
         * Get current pagination state
         * @returns {Object} State object with current page, total pages, etc.
         */
        getState() {
            return {
                currentPage: this.currentPage,
                pageSize: this.pageSize,
                totalRecords: this.totalRecords,
                totalPages: this.totalPages,
                startRecord: (this.currentPage - 1) * this.pageSize + 1,
                endRecord: Math.min(this.currentPage * this.pageSize, this.totalRecords),
                hasPrev: this.currentPage > 1,
                hasNext: this.currentPage < this.totalPages
            };
        }

        /**
         * Fetch a page of data using provided API call function
         * @param {Function} apiCall - Async function that takes params and returns data
         * @param {Object} filters - Additional filter parameters
         * @returns {Promise} API response
         */
        async fetchPage(apiCall, filters = {}) {
            const params = { ...filters, ...this.getParams() };
            const result = await apiCall(params);

            // Auto-detect total from common response formats
            if (result.total !== undefined) {
                this.setTotal(result.total);
            } else if (result.count !== undefined) {
                this.setTotal(result.count);
            }

            return result;
        }

        /**
         * Render pagination controls HTML
         * @param {string} containerId - ID of container element
         * @param {Function} onPageChange - Callback function when page changes
         */
        renderControls(containerId, onPageChange) {
            const container = document.getElementById(containerId);
            if (!container) return;

            const state = this.getState();

            if (state.totalPages <= 1) {
                container.innerHTML = '';
                return;
            }

            let html = '<div class="pagination-controls">';
            html += '<div class="pagination-info">';
            html += `Showing ${state.startRecord}-${state.endRecord} of ${state.totalRecords}`;
            html += '</div>';
            html += '<div class="pagination-buttons">';

            // Previous button
            if (state.hasPrev) {
                html += `<button class="btn btn-sm" data-page="${state.currentPage - 1}">Previous</button>`;
            } else {
                html += '<button class="btn btn-sm" disabled>Previous</button>';
            }

            // Page numbers (show current ± 2 pages)
            const startPage = Math.max(1, state.currentPage - 2);
            const endPage = Math.min(state.totalPages, state.currentPage + 2);

            if (startPage > 1) {
                html += `<button class="btn btn-sm" data-page="1">1</button>`;
                if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
            }

            for (let i = startPage; i <= endPage; i++) {
                const activeClass = i === state.currentPage ? 'btn-primary' : '';
                html += `<button class="btn btn-sm ${activeClass}" data-page="${i}">${i}</button>`;
            }

            if (endPage < state.totalPages) {
                if (endPage < state.totalPages - 1) html += '<span class="pagination-ellipsis">...</span>';
                html += `<button class="btn btn-sm" data-page="${state.totalPages}">${state.totalPages}</button>`;
            }

            // Next button
            if (state.hasNext) {
                html += `<button class="btn btn-sm" data-page="${state.currentPage + 1}">Next</button>`;
            } else {
                html += '<button class="btn btn-sm" disabled>Next</button>';
            }

            html += '</div></div>';
            container.innerHTML = html;

            // Attach click handlers
            container.querySelectorAll('[data-page]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const page = parseInt(btn.dataset.page);
                    this.setPage(page);
                    if (onPageChange) onPageChange(page);
                });
            });
        }
    }

    /**
     * Factory function to create a new PaginationManager
     * @param {string} resource - Resource name
     * @param {number} pageSize - Records per page
     * @returns {PaginationManager} New manager instance
     */
    function create(resource, pageSize = 50) {
        return new PaginationManager(resource, pageSize);
    }

    // Public API
    return { create };
})();
