/**
 * Main Application Entry Point - RENAMED TO BYPASS CACHE
 * Initializes all modules and starts the app
 */

// Global Pages Registry - attach to window so Router can access it
window.Pages = {
    dashboard: DashboardPage,
    users: UsersPage,
    scooters: ScootersPage,
    distributors: DistributorsPage,
    workshops: WorkshopsPage,
    'service-jobs': ServiceJobsPage,
    firmware: FirmwarePage,
    telemetry: TelemetryPage,
    logs: LogsPage,
    events: EventsPage,
    validation: ValidationPage,
    'terms-management': TermsManagementPage,
    'consent-history': ConsentHistoryPage,
    'live-runs': LiveRunsPage,
    notifications: NotificationsPage,
    settings: SettingsPage
};

// App Initialization
(async function initApp() {
    console.log('=== Pure eScooter Admin v2 - NEW FILE - Initializing ===');

    // Initialize modal component
    ModalComponent.init();

    // Initialize auth and try to restore session
    const user = await Auth.init();

    if (user) {
        // User is logged in, initialize app
        console.log('✓ User authenticated:', user.email);

        // Load reference data (models, variants, colours, blocks)
        await ReferenceData.loadAll();

        // Initialize router
        Router.init();

        // Initialize all page modules
        console.log('✓ Initializing page modules...');
        Object.values(window.Pages).forEach(page => {
            if (page.init) {
                page.init();
            }
        });

        // Navigate to initial page (from URL hash, or dashboard)
        const initialPage = Router.getInitialPage();
        console.log(`✓ Navigating to ${initialPage}...`);
        Router.navigate(initialPage);

    } else {
        // Show login screen
        console.log('No active session - showing login');
        Auth.setupLoginForm();
        Auth.setupPasswordResetForm(); // Check if on reset page
    }

    console.log('=== Pure eScooter Admin v2 - NEW FILE - Ready ===');
})();
