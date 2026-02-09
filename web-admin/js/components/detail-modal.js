/**
 * Detail Modal Component
 *
 * Reusable component for displaying entity detail views with consistent formatting.
 * Reduces code duplication across users, scooters, distributors, workshops pages.
 *
 * Usage:
 *   DetailModal.show('Workshop Detail', {
 *     sections: [
 *       {
 *         title: 'Workshop Information',
 *         fields: [
 *           {label: 'Name', value: workshop.name},
 *           {label: 'Email', value: workshop.email || 'N/A'},
 *           {label: 'Status', value: workshop.is_active, type: 'badge-boolean'}
 *         ]
 *       }
 *     ],
 *     actions: [...]
 *   });
 */

const DetailModal = (() => {
    /**
     * Show a detail modal with structured sections
     * @param {string} title - Modal title
     * @param {Object} config - Configuration object
     * @param {Array} config.sections - Array of section objects
     * @param {Array} config.actions - Array of action button objects
     * @param {Array} config.breadcrumbs - Optional breadcrumb trail
     */
    function show(title, config) {
        const { sections, actions, breadcrumbs } = config;

        // Show breadcrumbs if provided
        if (breadcrumbs && breadcrumbs.length > 0) {
            Breadcrumbs.show(breadcrumbs);
        }

        // Build HTML
        let html = '<div class="detail-grid">';

        sections.forEach(section => {
            html += renderSection(section);
        });

        html += '</div>';

        // Show modal
        ModalComponent.show(title, html, actions);
    }

    /**
     * Render a single section
     * @param {Object} section - Section configuration
     * @returns {string} HTML string
     */
    function renderSection(section) {
        let html = '<div class="detail-section">';

        if (section.title) {
            html += `<h4>${section.title}</h4>`;
        }

        if (section.html) {
            // Custom HTML content
            html += section.html;
        } else if (section.fields) {
            // Structured fields
            section.fields.forEach(field => {
                html += renderField(field);
            });
        }

        html += '</div>';
        return html;
    }

    /**
     * Render a single field
     * @param {Object} field - Field configuration
     * @returns {string} HTML string
     */
    function renderField(field) {
        const { label, value, type, format, style } = field;

        // Skip if value is undefined/null and not explicitly allowed
        if (value === undefined || value === null) {
            if (field.showIfEmpty) {
                return `<p><strong>${label}:</strong> N/A</p>`;
            }
            return '';
        }

        let formattedValue = value;

        // Apply type-specific formatting
        switch (type) {
            case 'badge-boolean':
                formattedValue = value
                    ? '<span class="badge badge-active">Active</span>'
                    : '<span class="badge badge-inactive">Inactive</span>';
                break;

            case 'badge-status':
                // Expects {status: string, class: string} or just string
                if (typeof value === 'object') {
                    formattedValue = `<span class="badge ${value.class}">${value.status}</span>`;
                } else {
                    const statusClass = {
                        'booked': 'badge-warning',
                        'in_progress': 'badge-primary',
                        'completed': 'badge-success',
                        'cancelled': 'badge-inactive',
                        'active': 'badge-active',
                        'inactive': 'badge-inactive'
                    }[value.toLowerCase()] || 'badge-inactive';
                    formattedValue = `<span class="badge ${statusClass}">${value}</span>`;
                }
                break;

            case 'code':
                formattedValue = `<code style="font-size: 1.2em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">${value}</code>`;
                break;

            case 'code-highlight':
                formattedValue = `<code style="font-size: 1.4em; background: #e8f5e9; padding: 12px 16px; border-radius: 6px; display: inline-block; font-weight: bold; letter-spacing: 1px;">${value}</code>`;
                break;

            case 'date':
                formattedValue = formatDate(value);
                break;

            case 'list':
                // Expects array
                if (Array.isArray(value) && value.length > 0) {
                    formattedValue = '<ul>' + value.map(item => `<li>${item}</li>`).join('') + '</ul>';
                } else {
                    formattedValue = '<p class="text-muted">None</p>';
                }
                break;

            case 'html':
                // Raw HTML (use with caution)
                formattedValue = value;
                break;

            default:
                // Custom format function
                if (format && typeof format === 'function') {
                    formattedValue = format(value);
                }
        }

        const styleAttr = style ? ` style="${style}"` : '';

        if (type === 'list' && Array.isArray(value)) {
            return `<p${styleAttr}><strong>${label}:</strong></p>${formattedValue}`;
        }

        return `<p${styleAttr}><strong>${label}:</strong> ${formattedValue}</p>`;
    }

    /**
     * Helper: Render activation code section (common pattern)
     * @param {Object} entity - Entity with activation code fields
     * @param {string} entityType - 'distributor' or 'workshop' for messaging
     * @returns {Object} Section configuration
     */
    function activationCodeSection(entity, entityType = 'entity') {
        let html = '<div class="detail-section"><h4>Activation Code</h4>';

        if (entity.activation_code_plaintext) {
            // Show plaintext code (only visible to manufacturer_admin)
            html += '<p><strong>Code:</strong></p>';
            html += `<p><code style="font-size: 1.4em; background: #e8f5e9; padding: 12px 16px; border-radius: 6px; display: inline-block; font-weight: bold; letter-spacing: 1px;">${entity.activation_code_plaintext}</code></p>`;
            html += `<p class="text-muted" style="font-size: 0.9em; margin-top: 10px;">Share this code with the ${entityType} for registration.</p>`;

            if (entity.activation_code_created_at) {
                html += `<p class="text-muted"><strong>Created:</strong> ${formatDate(entity.activation_code_created_at)}</p>`;
            }

            if (entity.activation_code_expires_at) {
                const expires = new Date(entity.activation_code_expires_at);
                const isExpired = expires < new Date();
                html += `<p class="text-muted"><strong>Expires:</strong> ${formatDate(entity.activation_code_expires_at)} `;
                if (isExpired) {
                    html += '<span class="badge badge-danger">Expired - Regenerate Required</span>';
                } else {
                    html += '<span class="badge badge-success">Valid</span>';
                }
                html += '</p>';
            }
        } else if (entity.activation_code_hash) {
            // Has hash but no plaintext (shouldn't happen with new system)
            html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-success">Secured</span></p>';
            html += '<p class="text-muted" style="font-size: 0.9em;">Code was created before plaintext storage. Use "Regenerate Code" button below to create a new one.</p>';
        } else if (entity.activation_code) {
            // Legacy plaintext code (old format)
            html += `<p><strong>Code:</strong> <code style="font-size: 1.2em; background: #f0f0f0; padding: 8px 12px; border-radius: 4px;">${entity.activation_code}</code></p>`;
            html += '<p class="text-warning" style="font-size: 0.9em; margin-top: 10px;">⚠️ Legacy format - click "Regenerate Code" below to upgrade</p>';
        } else {
            html += '<p class="text-muted"><strong>Status:</strong> <span class="badge badge-inactive">No Code</span></p>';
            html += `<p class="text-muted" style="font-size: 0.9em;">Click "Regenerate Code" below to create an activation code.</p>`;
        }

        html += '</div>';

        return { html };
    }

    /**
     * Helper: Render address list (common pattern)
     * @param {Array} addresses - Array of address objects
     * @returns {Object} Section configuration
     */
    function addressSection(addresses) {
        let html = '<div class="detail-section"><h4>Addresses</h4>';

        if (addresses && addresses.length > 0) {
            addresses.forEach((addr, idx) => {
                const isPrimary = addr.is_primary ? ' <span class="badge badge-primary">Primary</span>' : '';
                html += `<div style="margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px;">`;
                html += `<p><strong>Address ${idx + 1}${isPrimary}</strong></p>`;
                html += `<p>${addr.line_1}</p>`;
                if (addr.line_2) html += `<p>${addr.line_2}</p>`;
                html += `<p>${addr.city}${addr.region ? ', ' + addr.region : ''} ${addr.postcode}</p>`;
                html += `<p>${addr.country}</p>`;
                html += '</div>';
            });
        } else {
            html += '<p class="text-muted">No addresses</p>';
        }

        html += '</div>';

        return { html };
    }

    /**
     * Helper: Render metadata section (created/updated dates)
     * @param {Object} entity - Entity with timestamp fields
     * @returns {Object} Section configuration
     */
    function metadataSection(entity) {
        return {
            title: 'Metadata',
            fields: [
                { label: 'Created', value: entity.created_at, type: 'date' },
                { label: 'Updated', value: entity.updated_at, type: 'date' }
            ]
        };
    }

    return {
        show,
        renderSection,
        renderField,
        // Helpers for common patterns
        activationCodeSection,
        addressSection,
        metadataSection
    };
})();

// Utility function (if not already defined globally)
if (typeof formatDate === 'undefined') {
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
}
