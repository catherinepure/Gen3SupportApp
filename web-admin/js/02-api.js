/**
 * Pure eScooter Admin — API Client
 * Communicates with the Supabase Edge Function: /functions/v1/admin
 * All requests go through a single endpoint with { resource, action, session_token }
 */

const API = (() => {
    // Configuration — update these for your Supabase project
    const CONFIG = {
        supabaseUrl: 'https://hhpxmlrpdharhhzwjxuc.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwNTQsImV4cCI6MjA4NTc4NDA1NH0.w_9rkrz6Mw12asETIAk7jenY-yjVVxrLeWz642k3PVM',
    };

    let sessionToken = null;
    let currentUser = null;

    function getAdminUrl() {
        return `${CONFIG.supabaseUrl}/functions/v1/admin`;
    }

    function getLoginUrl() {
        return `${CONFIG.supabaseUrl}/functions/v1/login`;
    }

    /**
     * Make an admin API call.
     * @param {string} resource - The resource (users, scooters, etc.)
     * @param {string} action - The action (list, get, create, etc.)
     * @param {object} params - Additional parameters
     * @returns {Promise<object>} API response
     */
    async function call(resource, action, params = {}) {
        if (!sessionToken) {
            throw new Error('Not authenticated');
        }

        const body = {
            resource,
            action,
            ...params,
        };

        const response = await fetch(getAdminUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.anonKey}`,
                'apikey': CONFIG.anonKey,
                'X-Session-Token': sessionToken,
            },
            body: JSON.stringify(body),
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Server error (HTTP ${response.status})`);
        }

        if (!response.ok) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }

        return data;
    }

    /**
     * Login with email and password.
     * @returns {Promise<object>} User info
     */
    async function login(email, password) {
        const response = await fetch(getLoginUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.anonKey}`,
                'apikey': CONFIG.anonKey,
            },
            body: JSON.stringify({
                email,
                password,
                device_info: 'Web Admin Dashboard',
            }),
        });

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error(`Server error (HTTP ${response.status})`);
        }

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        // Check admin/manager access
        const userLevel = data.user.role || data.user.user_level;
        if (userLevel !== 'admin' && userLevel !== 'manager') {
            throw new Error('Admin or manager access required. Your level: ' + userLevel);
        }

        sessionToken = data.session_token;
        currentUser = data.user;

        // Store in sessionStorage (cleared on browser close)
        sessionStorage.setItem('gen3_session', sessionToken);
        sessionStorage.setItem('gen3_user', JSON.stringify(currentUser));

        return currentUser;
    }

    /**
     * Restore session from sessionStorage.
     * @returns {object|null} User info or null
     */
    function restoreSession() {
        const token = sessionStorage.getItem('gen3_session');
        const user = sessionStorage.getItem('gen3_user');
        if (token && user) {
            sessionToken = token;
            currentUser = JSON.parse(user);
            return currentUser;
        }
        return null;
    }

    /**
     * Logout and clear session.
     */
    function logout() {
        // Try to invalidate on server (fire and forget)
        if (sessionToken) {
            fetch(`${CONFIG.supabaseUrl}/functions/v1/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.anonKey}`,
                    'apikey': CONFIG.anonKey,
                    'X-Session-Token': sessionToken,
                },
                body: JSON.stringify({}),
            }).catch(() => {});
        }

        sessionToken = null;
        currentUser = null;
        sessionStorage.removeItem('gen3_session');
        sessionStorage.removeItem('gen3_user');
    }

    function getUser() { return currentUser; }
    function isLoggedIn() { return !!sessionToken; }

    return {
        call,
        login,
        logout,
        restoreSession,
        getUser,
        isLoggedIn,
        baseUrl: `${CONFIG.supabaseUrl}/functions/v1`,
        anonKey: CONFIG.anonKey
    };
})();
