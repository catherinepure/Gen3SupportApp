/**
 * Table Component
 * Reusable data table with sorting, pagination, and actions
 */

const TableComponent = (() => {
    const { $, formatDate, statusBadge, roleBadge, truncate, emptyState } = Utils;

    function render(containerId, data, columns, options = {}) {
        const container = $(containerId);
        if (!container) {
            console.error(`Container ${containerId} not found`);
            return;
        }

        if (!data || data.length === 0) {
            container.innerHTML = emptyState(options.emptyMessage || 'No data available');
            return;
        }

        let html = '<table class="data-table"><thead><tr>';

        // Render headers
        columns.forEach(col => {
            const sortable = col.sortable !== false ? 'class="sortable"' : '';
            html += `<th ${sortable} data-key="${col.key}">${col.label}</th>`;
        });

        if (options.actions) {
            html += '<th class="actions-header">Actions</th>';
        }

        html += '</tr></thead><tbody>';

        // Render rows
        data.forEach((row, idx) => {
            const clickable = options.onRowClick ? 'class="clickable"' : '';
            html += `<tr ${clickable} data-index="${idx}">`;

            columns.forEach(col => {
                let value = getNestedValue(row, col.key);

                // Apply formatting
                if (col.format) {
                    if (col.format === 'date') {
                        value = formatDate(value);
                    } else if (col.format === 'status') {
                        value = statusBadge(value);
                    } else if (col.format === 'role') {
                        value = roleBadge(value);
                    } else if (col.format === 'roles') {
                        value = Array.isArray(value)
                            ? value.map(r => roleBadge(r)).join(' ')
                            : '-';
                    } else if (col.format === 'truncate') {
                        value = truncate(value, col.length || 50);
                    } else if (col.format === 'boolean') {
                        value = value ? '✓' : '✗';
                    } else if (col.format === 'array') {
                        value = Array.isArray(value) ? value.join(', ') : '-';
                    } else if (typeof col.format === 'function') {
                        value = col.format(value, row);
                    }
                }

                const cellClass = col.className || '';
                html += `<td class="${cellClass}">${value ?? '-'}</td>`;
            });

            // Render action buttons
            if (options.actions) {
                html += '<td class="actions-cell">';
                options.actions.forEach(action => {
                    // Skip action if shouldShow returns false
                    if (action.shouldShow && !action.shouldShow(row)) {
                        return;
                    }

                    const btnClass = action.className || 'btn-sm btn-secondary';
                    const icon = action.icon || '';
                    html += `<button class="btn ${btnClass}"
                             data-action="${action.name}"
                             data-index="${idx}"
                             title="${action.title || action.label}">
                             ${icon ? `<span class="icon">${icon}</span>` : ''}
                             ${action.label}
                            </button>`;
                });
                html += '</td>';
            }

            html += '</tr>';
        });

        html += '</tbody></table>';

        // Render pagination if needed
        if (options.pagination) {
            html += renderPagination(options.pagination);
        }

        container.innerHTML = html;

        // Attach event listeners
        attachEventListeners(container, data, options);
    }

    function getNestedValue(obj, key) {
        // Support nested keys like "user.email"
        return key.split('.').reduce((o, k) => o?.[k], obj);
    }

    function attachEventListeners(container, data, options) {
        // Row click handler
        if (options.onRowClick) {
            container.querySelectorAll('tr.clickable').forEach(tr => {
                tr.addEventListener('click', (e) => {
                    // Don't trigger if clicking a button
                    if (e.target.closest('button')) return;

                    const idx = parseInt(tr.dataset.index);
                    options.onRowClick(data[idx], idx);
                });
            });
        }

        // Action button handlers
        if (options.actions) {
            container.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const actionName = btn.dataset.action;
                    const idx = parseInt(btn.dataset.index);
                    const action = options.actions.find(a => a.name === actionName);

                    if (action?.handler) {
                        action.handler(data[idx], idx);
                    }
                });
            });
        }

        // Sort handlers
        container.querySelectorAll('th.sortable').forEach(th => {
            th.addEventListener('click', () => {
                const key = th.dataset.key;
                if (options.onSort) {
                    options.onSort(key);
                }
            });
        });

        // Pagination handlers
        if (options.pagination && options.onPageChange) {
            container.querySelectorAll('[data-page]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const page = parseInt(btn.dataset.page);
                    options.onPageChange(page);
                });
            });
        }
    }

    function renderPagination(paginationData) {
        const { current, total, pageSize, totalRecords } = paginationData;

        if (total <= 1) return ''; // No pagination needed

        let html = '<div class="pagination">';
        html += `<div class="pagination-info">Page ${current} of ${total} (${totalRecords} total)</div>`;
        html += '<div class="pagination-buttons">';

        // Previous button
        if (current > 1) {
            html += `<button class="btn btn-sm" data-page="${current - 1}">← Previous</button>`;
        }

        // Page numbers (show max 5)
        const startPage = Math.max(1, current - 2);
        const endPage = Math.min(total, current + 2);

        if (startPage > 1) {
            html += `<button class="btn btn-sm" data-page="1">1</button>`;
            if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === current ? 'btn-primary' : '';
            html += `<button class="btn btn-sm ${activeClass}" data-page="${i}">${i}</button>`;
        }

        if (endPage < total) {
            if (endPage < total - 1) html += '<span class="pagination-ellipsis">...</span>';
            html += `<button class="btn btn-sm" data-page="${total}">${total}</button>`;
        }

        // Next button
        if (current < total) {
            html += `<button class="btn btn-sm" data-page="${current + 1}">Next →</button>`;
        }

        html += '</div></div>';

        return html;
    }

    return {
        render
    };
})();
