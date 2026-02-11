package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Manages user-specific settings stored locally in SharedPreferences.
 * Settings include PIN save preference, auto-connect, and last connected scooter.
 */
public class UserSettingsManager {

    private static final String PREFS_NAME = "UserSettingsPrefs";

    private static final String KEY_PIN_SAVE_ENABLED = "pin_save_enabled";
    private static final String KEY_AUTO_CONNECT_ENABLED = "auto_connect_enabled";
    private static final String KEY_LAST_CONNECTED_MAC = "last_connected_mac";
    private static final String KEY_LAST_CONNECTED_NAME = "last_connected_name";

    private final SharedPreferences prefs;

    public UserSettingsManager(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // --- PIN Save ---

    public boolean isPinSaveEnabled() {
        return prefs.getBoolean(KEY_PIN_SAVE_ENABLED, true); // default ON
    }

    public void setPinSaveEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_PIN_SAVE_ENABLED, enabled).apply();
    }

    // --- Auto-Connect ---

    public boolean isAutoConnectEnabled() {
        return prefs.getBoolean(KEY_AUTO_CONNECT_ENABLED, false); // default OFF
    }

    public void setAutoConnectEnabled(boolean enabled) {
        prefs.edit().putBoolean(KEY_AUTO_CONNECT_ENABLED, enabled).apply();
    }

    // --- Last Connected Scooter ---

    public String getLastConnectedMac() {
        return prefs.getString(KEY_LAST_CONNECTED_MAC, null);
    }

    public void setLastConnectedMac(String mac) {
        prefs.edit().putString(KEY_LAST_CONNECTED_MAC, mac).apply();
    }

    public String getLastConnectedName() {
        return prefs.getString(KEY_LAST_CONNECTED_NAME, null);
    }

    public void setLastConnectedName(String name) {
        prefs.edit().putString(KEY_LAST_CONNECTED_NAME, name).apply();
    }

    /**
     * Clear all user settings (e.g., on logout).
     */
    public void clearAll() {
        prefs.edit().clear().apply();
    }
}
