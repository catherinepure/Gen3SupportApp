/**
 * Global State Management
 * Simple reactive state store with subscriptions
 */

const State = (() => {
    let state = {
        user: null,
        sessionToken: null,
        currentPage: 'dashboard',
        filters: {},
        cache: {},
        pagination: {}
    };

    const listeners = {};

    function get(key) {
        return state[key];
    }

    function set(key, value) {
        const oldValue = state[key];
        state[key] = value;

        // Notify listeners if value changed
        if (listeners[key] && oldValue !== value) {
            listeners[key].forEach(fn => fn(value, oldValue));
        }
    }

    function update(key, updater) {
        const oldValue = state[key];
        const newValue = updater(oldValue);
        set(key, newValue);
    }

    function subscribe(key, callback) {
        if (!listeners[key]) {
            listeners[key] = [];
        }
        listeners[key].push(callback);

        // Return unsubscribe function
        return () => {
            const index = listeners[key].indexOf(callback);
            if (index > -1) {
                listeners[key].splice(index, 1);
            }
        };
    }

    function getAll() {
        return { ...state };
    }

    function reset() {
        state = {
            user: null,
            sessionToken: null,
            currentPage: 'dashboard',
            filters: {},
            cache: {},
            pagination: {}
        };
        // Notify all listeners
        Object.keys(listeners).forEach(key => {
            listeners[key].forEach(fn => fn(state[key], undefined));
        });
    }

    // Cache helpers
    function setCache(key, value, ttl = 300000) { // 5 min default
        state.cache[key] = {
            value,
            expires: Date.now() + ttl
        };
    }

    function getCache(key) {
        const cached = state.cache[key];
        if (!cached) return null;
        if (Date.now() > cached.expires) {
            delete state.cache[key];
            return null;
        }
        return cached.value;
    }

    function clearCache(key) {
        if (key) {
            delete state.cache[key];
        } else {
            state.cache = {};
        }
    }

    // Filter helpers
    function setFilter(page, filterKey, value) {
        if (!state.filters[page]) {
            state.filters[page] = {};
        }
        state.filters[page][filterKey] = value;
        set('filters', { ...state.filters });
    }

    function getFilter(page, filterKey) {
        return state.filters[page]?.[filterKey];
    }

    function clearFilters(page) {
        if (page) {
            delete state.filters[page];
        } else {
            state.filters = {};
        }
        set('filters', { ...state.filters });
    }

    // Pagination helpers
    function setPagination(page, pageNum, pageSize) {
        state.pagination[page] = { pageNum, pageSize };
        set('pagination', { ...state.pagination });
    }

    function getPagination(page) {
        return state.pagination[page] || { pageNum: 1, pageSize: 50 };
    }

    return {
        get,
        set,
        update,
        subscribe,
        getAll,
        reset,
        setCache,
        getCache,
        clearCache,
        setFilter,
        getFilter,
        clearFilters,
        setPagination,
        getPagination
    };
})();
