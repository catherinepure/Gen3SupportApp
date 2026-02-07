/**
 * Authentication Module
 * Handles login, logout, session management
 */

const Auth = (() => {
    const { $, toast } = Utils;

    function showLoginScreen() {
        $('#app')?.classList.add('hidden');
        $('#login-screen')?.classList.remove('hidden');
    }

    function showApp() {
        $('#login-screen')?.classList.add('hidden');
        $('#app')?.classList.remove('hidden');
    }

    async function handleLogin(email, password) {
        try {
            const user = await API.login(email, password);

            // Update global state
            State.set('user', user);
            State.set('sessionToken', sessionStorage.getItem('gen3_session'));

            // Show app
            showApp();

            // Update UI
            const adminEmail = $('#admin-email');
            if (adminEmail) {
                adminEmail.textContent = user.email;
            }

            // Initialize router and page modules (not done on the login path)
            Router.init();
            Object.values(window.Pages).forEach(page => {
                if (page.init) page.init();
            });

            // Navigate to dashboard
            Router.navigate('dashboard');

            toast(`Welcome back, ${user.first_name || user.email}!`, 'success');

            return user;
        } catch (err) {
            throw err;
        }
    }

    function handleLogout() {
        // Clear session
        API.logout();

        // Clear state
        State.reset();

        // Show login screen
        showLoginScreen();

        toast('Logged out successfully', 'info');
    }

    async function init() {
        // Try to restore session
        const user = API.restoreSession();

        if (user) {
            // Update state
            State.set('user', user);
            State.set('sessionToken', sessionStorage.getItem('gen3_session'));

            // Show app
            showApp();

            // Update UI
            const adminEmail = $('#admin-email');
            if (adminEmail) {
                adminEmail.textContent = user.email;
            }

            return user;
        } else {
            // Show login screen
            showLoginScreen();
            return null;
        }
    }

    function setupLoginForm() {
        const form = $('#login-form');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = $('#login-email')?.value;
            const password = $('#login-password')?.value;
            const btn = $('#login-btn');
            const errorEl = $('#login-error');

            if (!email || !password) {
                if (errorEl) {
                    errorEl.textContent = 'Email and password required';
                    errorEl.classList.remove('hidden');
                }
                return;
            }

            // Disable button
            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Signing in...';
            }

            // Hide error
            if (errorEl) {
                errorEl.classList.add('hidden');
            }

            try {
                await handleLogin(email, password);
            } catch (err) {
                if (errorEl) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
                toast(err.message, 'error');
            } finally {
                // Re-enable button
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Sign In';
                }
            }
        });
    }

    function setupLogoutButton() {
        const logoutBtn = $('#logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to logout?')) {
                    handleLogout();
                }
            });
        }
    }

    function getUser() {
        return State.get('user');
    }

    function isLoggedIn() {
        return !!State.get('sessionToken');
    }

    return {
        init,
        handleLogin,
        handleLogout,
        setupLoginForm,
        setupLogoutButton,
        showLoginScreen,
        showApp,
        getUser,
        isLoggedIn
    };
})();
