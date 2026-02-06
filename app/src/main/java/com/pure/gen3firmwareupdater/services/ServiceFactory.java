package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import com.pure.gen3firmwareupdater.BLEManager;
import com.pure.gen3firmwareupdater.BuildConfig;
import com.pure.gen3firmwareupdater.SupabaseClient;

/**
 * Singleton factory for shared service instances.
 * Eliminates duplicated `new SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_SERVICE_KEY)`
 * calls across 6+ Activities.
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
                    BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_SERVICE_KEY);
        }
    }

    /**
     * Get the shared SupabaseClient instance.
     * Lazy-initializes if not already created.
     */
    public static synchronized SupabaseClient getSupabaseClient() {
        if (supabaseClient == null) {
            supabaseClient = new SupabaseClient(
                    BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_SERVICE_KEY);
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

    // --- Factory methods for BLE services ---

    /**
     * Create a new ScooterConnectionService.
     * Each Activity gets its own BLEManager and connection service.
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
        if (supabaseClient != null) {
            supabaseClient.shutdown();
            supabaseClient = null;
        }
        sessionManager = null;
    }
}
