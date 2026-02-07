/**
 * Main Application Entry Point
 * Initializes all modules and starts the app
 */

// Global Pages Registry
const Pages = {
    dashboard: DashboardPage,
    users: UsersPage,
    scooters: ScootersPage,
    distributors: DistributorsPage,
    workshops: WorkshopsPage,
    'service-jobs': ServicejobsPage,
    firmware: FirmwarePage,
    telemetry: TelemetryPage,
    logs: LogsPage,
    events: EventsPage,
    validation: ValidationPage
};

// App Initialization
(async function initApp() {
    console.log('Gen3 Admin - Initializing...');

    // Initialize modal component
    ModalComponent.init();

    // Initialize auth and try to restore session
    const user = await Auth.init();

    if (user) {
        // User is logged in, initialize app
        console.log('User authenticated:', user.email);

        // Initialize router
        Router.init();

        // Initialize all page modules
        Object.values(Pages).forEach(page => {
            if (page.init) {
                page.init();
            }
        });

        // Navigate to dashboard
        Router.navigate('dashboard');

    } else {
        // Show login screen
        console.log('No active session - showing login');
        Auth.setupLoginForm();
    }

    console.log('Gen3 Admin - Ready');
})();
