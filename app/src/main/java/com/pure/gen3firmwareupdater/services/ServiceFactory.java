package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.pure.gen3firmwareupdater.BLEManager;
import com.pure.gen3firmwareupdater.BuildConfig;
import com.pure.gen3firmwareupdater.SupabaseClient;

/**
 * Singleton factory for shared service instances.
 * Uses the anon key for all direct database operations (subject to RLS).
 * Admin/auth operations go through Edge Functions which use the service_role
 * key server-side.
 *
 * For React Native/Flutter ports, this class is replaced by the platform's DI mechanism.
 *
 * Usage:
 *   ServiceFactory.init(applicationContext);  // In Application.onCreate() or first Activity
 *   SupabaseClient supabase = ServiceFactory.getSupabaseClient();
 *   SessionManager session = ServiceFactory.getSessionManager();
 */
public class ServiceFactory {

    private static SupabaseClient supabaseClient;
    private static SessionManager sessionManager;
    private static TermsManager termsManager;

    // Shared BLE connection service (persists across activity transitions)
    private static ScooterConnectionService sharedConnectionService;
    private static BLEManager sharedBleManager;

    /**
     * Initialize the factory with application context.
     * Safe to call multiple times (only initializes once).
     *
     * @param context Application context (or any context - getApplicationContext() is called internally)
     */
    public static synchronized void init(Context context) {
        Context appContext = context.getApplicationContext();
        if (sessionManager == null) {
            sessionManager = new SessionManager(appContext);
        }
        if (supabaseClient == null) {
            supabaseClient = new SupabaseClient(
                    BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY);
        }
        if (termsManager == null) {
            termsManager = new TermsManager(appContext,
                    BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY);
        }
    }

    /**
     * Get the shared SupabaseClient instance.
     * Lazy-initializes if not already created.
     */
    public static synchronized SupabaseClient getSupabaseClient() {
        if (supabaseClient == null) {
            supabaseClient = new SupabaseClient(
                    BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY);
        }
        return supabaseClient;
    }

    /**
     * Get the shared SessionManager instance.
     *
     * @throws IllegalStateException if init() hasn't been called yet
     */
    public static SessionManager getSessionManager() {
        if (sessionManager == null) {
            throw new IllegalStateException(
                    "ServiceFactory.init(context) must be called before getSessionManager()");
        }
        return sessionManager;
    }

    // --- Convenience accessors for repositories ---

    public static SupabaseDistributorRepository distributorRepo() {
        return getSupabaseClient().distributors;
    }

    public static SupabaseScooterRepository scooterRepo() {
        return getSupabaseClient().scooters;
    }

    public static SupabaseFirmwareRepository firmwareRepo() {
        return getSupabaseClient().firmware;
    }

    public static SupabaseTelemetryRepository telemetryRepo() {
        return getSupabaseClient().telemetry;
    }

    public static SupabaseUserRepository userRepo() {
        return getSupabaseClient().users;
    }

    /**
     * Get the shared TermsManager instance.
     *
     * @throws IllegalStateException if init() hasn't been called yet
     */
    public static TermsManager getTermsManager() {
        if (termsManager == null) {
            throw new IllegalStateException(
                    "ServiceFactory.init(context) must be called before getTermsManager()");
        }
        return termsManager;
    }

    // --- Shared BLE connection service (persists across activity transitions) ---

    /**
     * Get or create the shared ScooterConnectionService singleton.
     * The connection persists across activity transitions (e.g. ScanScooterActivity → ScooterDetailsActivity).
     * Use setListener() on the returned service to receive callbacks in the current activity.
     *
     * @param context Android context for BLEManager (getApplicationContext() is used internally)
     * @param handler Main thread handler for version request timing
     * @return shared ScooterConnectionService instance
     */
    public static synchronized ScooterConnectionService getConnectionService(Context context, Handler handler) {
        if (sharedConnectionService == null) {
            sharedBleManager = new BLEManager(context, null);
            sharedConnectionService = new ScooterConnectionService(sharedBleManager, handler);
            sharedBleManager.setListener(sharedConnectionService);
        }
        return sharedConnectionService;
    }

    /**
     * Release the shared connection service.
     * Disconnects BLE and destroys the singleton.
     * Call when the user is done with the scooter (e.g. closing details screen).
     */
    public static synchronized void releaseConnectionService() {
        if (sharedConnectionService != null) {
            sharedConnectionService.setListener(null);
            sharedConnectionService.cleanup();
            sharedConnectionService = null;
        }
        sharedBleManager = null;
    }

    /**
     * Check if the shared connection service exists and has an active BLE connection.
     */
    public static boolean isConnectionServiceActive() {
        return sharedConnectionService != null && sharedConnectionService.isConnected();
    }

    // --- Factory methods for independent BLE services (firmware upload) ---

    /**
     * Create a new independent ScooterConnectionService.
     * Used by FirmwareUpdaterActivity which needs its own BLE connection.
     * NOT shared — each call creates a fresh instance.
     *
     * @param context Android context for BLEManager
     * @param handler Main thread handler for version request timing
     * @return new ScooterConnectionService instance
     */
    public static ScooterConnectionService createConnectionService(Context context, Handler handler) {
        BLEManager bleManager = new BLEManager(context, null);
        ScooterConnectionService service = new ScooterConnectionService(bleManager, handler);
        bleManager.setListener(service);
        return service;
    }

    /**
     * Shut down all shared services.
     * Call from Application.onTerminate() or last Activity.onDestroy().
     */
    public static synchronized void shutdown() {
        releaseConnectionService();
        if (supabaseClient != null) {
            supabaseClient.shutdown();
            supabaseClient = null;
        }
        sessionManager = null;
    }
}
