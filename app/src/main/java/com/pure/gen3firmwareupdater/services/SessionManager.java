package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

/**
 * Centralized session/preferences management.
 * Replaces raw SharedPreferences access scattered across 8+ Activities.
 *
 * Wraps Android SharedPreferences. For React Native/Flutter ports, replace
 * with AsyncStorage / shared_preferences equivalent.
 *
 * Keys stored:
 * - user_id: Supabase user UUID
 * - session_token: Auth session token
 * - user_email: Logged-in user's email
 * - user_role: "admin", "manager", or "normal" (as assigned by database administrator)
 * - distributor_id: Supabase ID of the distributor
 * - last_activation_code: Most recently entered activation code (deprecated)
 */
public class SessionManager {

    private static final String PREFS_NAME = "FirmwareUpdaterPrefs";

    // Preference keys
    private static final String KEY_USER_ID = "user_id";
    private static final String KEY_SESSION_TOKEN = "session_token";
    private static final String KEY_USER_EMAIL = "user_email";
    private static final String KEY_USER_ROLE = "user_role";
    private static final String KEY_DISTRIBUTOR_ID = "distributor_id";
    private static final String KEY_ACTIVATION_CODE = "last_activation_code";

    private final SharedPreferences prefs;
    private final Context context;

    public SessionManager(Context context) {
        this.context = context.getApplicationContext();
        this.prefs = this.context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // ==================================================================================
    // LOGIN / SESSION
    // ==================================================================================

    /**
     * Save login session data after successful authentication.
     */
    public void saveLogin(String userId, String sessionToken, String email, String role, String distributorId) {
        prefs.edit()
                .putString(KEY_USER_ID, userId)
                .putString(KEY_SESSION_TOKEN, sessionToken)
                .putString(KEY_USER_EMAIL, email)
                .putString(KEY_USER_ROLE, role)
                .putString(KEY_DISTRIBUTOR_ID, distributorId)
                .apply();
    }

    /**
     * Clear all session data (logout).
     * Also clears all cached PINs for security.
     */
    public void clearSession() {
        prefs.edit().clear().apply();

        // Clear all cached PINs on logout for security
        try {
            // Use ServiceFactory singleton so we clear the ACTUAL cached instance,
            // not a throwaway new instance that shares nothing with the real one
            PinCacheManager pinCache = ServiceFactory.getPinCacheManager();
            if (pinCache != null) {
                pinCache.clearAllCachedPins();
            }
        } catch (Exception e) {
            Log.w("SessionManager", "Failed to clear PIN cache on logout", e);
        }
    }

    /**
     * Check if the user is currently logged in.
     */
    public boolean isLoggedIn() {
        String token = getSessionToken();
        return token != null && !token.isEmpty();
    }

    /**
     * Check if the logged-in user has distributor/admin access.
     * Database roles: 'admin' (global), 'manager' (territory-scoped), 'normal' (end users)
     */
    public boolean isDistributor() {
        String role = getUserRole();

        // admin or manager have distributor access
        if ("admin".equalsIgnoreCase(role) || "manager".equalsIgnoreCase(role)) {
            return true;
        }

        // Fallback: check if distributor_id is present
        String distId = getDistributorId();
        return distId != null && !distId.isEmpty();
    }

    // ==================================================================================
    // GETTERS
    // ==================================================================================

    public String getUserId() {
        return prefs.getString(KEY_USER_ID, null);
    }

    public String getSessionToken() {
        return prefs.getString(KEY_SESSION_TOKEN, null);
    }

    public String getUserEmail() {
        return prefs.getString(KEY_USER_EMAIL, null);
    }

    public String getUserRole() {
        return prefs.getString(KEY_USER_ROLE, "");
    }

    public String getDistributorId() {
        return prefs.getString(KEY_DISTRIBUTOR_ID, null);
    }

    public String getLastActivationCode() {
        return prefs.getString(KEY_ACTIVATION_CODE, "");
    }

    // ==================================================================================
    // SETTERS
    // ==================================================================================

    public void setUserId(String userId) {
        prefs.edit().putString(KEY_USER_ID, userId).apply();
    }

    public void setSessionToken(String token) {
        prefs.edit().putString(KEY_SESSION_TOKEN, token).apply();
    }

    public void setUserEmail(String email) {
        prefs.edit().putString(KEY_USER_EMAIL, email).apply();
    }

    public void setUserRole(String role) {
        prefs.edit().putString(KEY_USER_ROLE, role).apply();
    }

    public void setDistributorId(String id) {
        prefs.edit().putString(KEY_DISTRIBUTOR_ID, id).apply();
    }

    public void setLastActivationCode(String code) {
        prefs.edit().putString(KEY_ACTIVATION_CODE, code).apply();
    }
}
