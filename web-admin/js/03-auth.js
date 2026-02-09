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
        // Always set up the logout button (needed for both fresh login and restored session)
        setupLogoutButton();

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

        // Setup "Forgot Password?" link
        const forgotLink = $('#forgot-password-link');
        if (forgotLink) {
            forgotLink.addEventListener('click', (e) => {
                e.preventDefault();
                showPasswordResetModal();
            });
        }
    }

    function showPasswordResetModal() {
        const modal = $('#reset-request-modal');
        if (!modal) return;

        // Show modal
        modal.classList.remove('hidden');

        // Setup form
        const form = $('#reset-request-form');
        const cancelBtn = $('#cancel-reset-btn');
        const emailInput = $('#reset-email');
        const errorEl = $('#reset-request-error');
        const successEl = $('#reset-request-success');

        // Pre-fill email if available from login form
        const loginEmail = $('#login-email')?.value;
        if (loginEmail && emailInput) {
            emailInput.value = loginEmail;
        }

        // Cancel button
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                if (form) form.reset();
                if (errorEl) errorEl.classList.add('hidden');
                if (successEl) successEl.classList.add('hidden');
            };
        }

        // Form submission
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();

                const email = emailInput?.value;
                const btn = $('#send-reset-btn');

                if (!email) {
                    if (errorEl) {
                        errorEl.textContent = 'Email is required';
                        errorEl.classList.remove('hidden');
                    }
                    return;
                }

                // Disable button
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Sending...';
                }

                // Hide messages
                if (errorEl) errorEl.classList.add('hidden');
                if (successEl) successEl.classList.add('hidden');

                try {
                    await requestPasswordReset(email);

                    // Show success message
                    if (successEl) {
                        successEl.textContent = 'Password reset link sent! Check your email.';
                        successEl.classList.remove('hidden');
                    }

                    // Close modal after 3 seconds
                    setTimeout(() => {
                        modal.classList.add('hidden');
                        if (form) form.reset();
                        if (successEl) successEl.classList.add('hidden');
                    }, 3000);

                } catch (err) {
                    if (errorEl) {
                        errorEl.textContent = err.message;
                        errorEl.classList.remove('hidden');
                    }
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Send Reset Link';
                    }
                }
            };
        }
    }

    async function requestPasswordReset(email) {
        const response = await fetch(`${API.baseUrl}/password-reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.anonKey}`,
                'apikey': API.anonKey
            },
            body: JSON.stringify({
                action: 'request',
                email
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to send reset email');
        }

        return await response.json();
    }

    async function resetPassword(token, newPassword) {
        const response = await fetch(`${API.baseUrl}/password-reset`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API.anonKey}`,
                'apikey': API.anonKey
            },
            body: JSON.stringify({
                action: 'reset',
                token,
                new_password: newPassword
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to reset password');
        }

        return await response.json();
    }

    function setupPasswordResetForm() {
        // Check if we're on password reset page (URL has ?token=...)
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');

        if (!token) return; // Not on reset page

        // Hide login screen, show reset screen
        $('#login-screen')?.classList.add('hidden');
        $('#reset-password-screen')?.classList.remove('hidden');

        const form = $('#reset-password-form');
        const backLink = $('#back-to-login-link');

        // Back to login link
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault();
                // Remove token from URL and reload
                window.location.href = window.location.pathname;
            });
        }

        // Form submission
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const newPassword = $('#new-password')?.value;
                const confirmPassword = $('#confirm-password')?.value;
                const btn = $('#reset-submit-btn');
                const errorEl = $('#reset-error');

                // Validate
                if (!newPassword || !confirmPassword) {
                    if (errorEl) {
                        errorEl.textContent = 'Both fields are required';
                        errorEl.classList.remove('hidden');
                    }
                    return;
                }

                if (newPassword.length < 8) {
                    if (errorEl) {
                        errorEl.textContent = 'Password must be at least 8 characters';
                        errorEl.classList.remove('hidden');
                    }
                    return;
                }

                if (newPassword !== confirmPassword) {
                    if (errorEl) {
                        errorEl.textContent = 'Passwords do not match';
                        errorEl.classList.remove('hidden');
                    }
                    return;
                }

                // Disable button
                if (btn) {
                    btn.disabled = true;
                    btn.textContent = 'Resetting...';
                }

                // Hide error
                if (errorEl) {
                    errorEl.classList.add('hidden');
                }

                try {
                    await resetPassword(token, newPassword);

                    toast('Password reset successful! You can now login.', 'success');

                    // Redirect to login after 2 seconds
                    setTimeout(() => {
                        window.location.href = window.location.pathname;
                    }, 2000);

                } catch (err) {
                    if (errorEl) {
                        errorEl.textContent = err.message;
                        errorEl.classList.remove('hidden');
                    }
                    toast(err.message, 'error');
                } finally {
                    if (btn) {
                        btn.disabled = false;
                        btn.textContent = 'Reset Password';
                    }
                }
            });
        }
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
        setupPasswordResetForm,
        showLoginScreen,
        showApp,
        getUser,
        isLoggedIn
    };
})();
