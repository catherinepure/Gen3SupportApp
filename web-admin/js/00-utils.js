/**
 * Core Utilities
 * Shared helper functions used across the application
 */

const Utils = (() => {
    // DOM helpers
    function $(sel) { return document.querySelector(sel); }
    function $$(sel) { return document.querySelectorAll(sel); }

    // Toast notifications
    function toast(msg, type = 'info') {
        const container = $('#toast-container');
        if (!container) {
            console.warn('Toast container not found');
            return;
        }

        const el = document.createElement('div');
        el.className = `toast toast-${type}`;
        el.textContent = msg;
        container.appendChild(el);

        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }, 4000);
    }

    // Date formatting
    function formatDate(d) {
        if (!d) return '-';
        return new Date(d).toLocaleString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function formatDateShort(d) {
        if (!d) return '-';
        return new Date(d).toLocaleDateString('en-GB', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    function timeAgo(d) {
        if (!d) return '-';
        const seconds = Math.floor((new Date() - new Date(d)) / 1000);

        const intervals = {
            year: 31536000,
            month: 2592000,
            week: 604800,
            day: 86400,
            hour: 3600,
            minute: 60
        };

        for (const [unit, secondsInUnit] of Object.entries(intervals)) {
            const interval = Math.floor(seconds / secondsInUnit);
            if (interval >= 1) {
                return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
            }
        }

        return 'just now';
    }

    // Badge helpers
    function badge(text, type) {
        return `<span class="badge badge-${type}">${text}</span>`;
    }

    function statusBadge(status) {
        const map = {
            active: 'active',
            true: 'active',
            completed: 'active',
            ready_for_collection: 'active',
            false: 'inactive',
            inactive: 'inactive',
            decommissioned: 'inactive',
            cancelled: 'inactive',
            in_service: 'warning',
            awaiting_parts: 'warning',
            stolen: 'danger',
            failed: 'danger',
            booked: 'primary',
            in_progress: 'primary',
            started: 'primary',
            scanned: 'primary',
        };
        return badge(status, map[String(status)] || 'primary');
    }

    function roleBadge(role) {
        const colors = {
            manufacturer_admin: 'danger',
            distributor_staff: 'primary',
            workshop_staff: 'warning',
            customer: 'active'
        };
        return badge(role, colors[role] || 'primary');
    }

    // Foreign key resolution
    function resolveFk(row, key) {
        const val = row[key];
        if (val && typeof val === 'object') {
            return val.name || val.email || val.id || '-';
        }
        return val || '-';
    }

    // Loading indicator
    function loading(message = 'Loading...') {
        return `<div class="loading"><div class="spinner"></div><p>${message}</p></div>`;
    }

    // Empty state
    function emptyState(message = 'No data available') {
        return `<div class="empty-state"><p>${message}</p></div>`;
    }

    // Error state
    function errorState(message = 'Failed to load data') {
        return `<div class="error-state"><p>${message}</p></div>`;
    }

    // Detail row helpers
    function detailRow(label, value) {
        return `<div class="detail-label">${label}</div><div class="detail-value">${value ?? '-'}</div>`;
    }

    function detailSection(title) {
        return `<div class="detail-section">${title}</div>`;
    }

    // CSV export
    function exportCSV(data, filename) {
        if (!data || data.length === 0) {
            toast('No data to export', 'error');
            return;
        }

        const headers = Object.keys(data[0]);
        const rows = data.map(r => headers.map(h => {
            let v = r[h];
            if (v && typeof v === 'object') v = JSON.stringify(v);
            if (typeof v === 'string' && (v.includes(',') || v.includes('"'))) {
                v = '"' + v.replace(/"/g, '""') + '"';
            }
            return v ?? '';
        }).join(','));

        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        toast(`Exported ${data.length} rows to ${filename}`, 'success');
    }

    // Debounce helper
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Truncate text
    function truncate(text, length = 50) {
        if (!text) return '-';
        if (text.length <= length) return text;
        return text.substring(0, length) + '...';
    }

    // Format file size
    function formatBytes(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Parse JSON safely
    function parseJSON(str, fallback = null) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return fallback;
        }
    }

    // Public API
    return {
        $,
        $$,
        toast,
        formatDate,
        formatDateShort,
        timeAgo,
        badge,
        statusBadge,
        roleBadge,
        resolveFk,
        loading,
        emptyState,
        errorState,
        detailRow,
        detailSection,
        exportCSV,
        debounce,
        truncate,
        formatBytes,
        escapeHtml,
        parseJSON
    };
})();
