package com.pure.gen3firmwareupdater;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import com.pure.gen3firmwareupdater.services.ServiceFactory;

import io.intercom.android.sdk.Intercom;
import io.intercom.android.sdk.identity.Registration;

public class Gen3FirmwareUpdaterApp extends Application {

    private static final String TAG = "Gen3FirmwareUpdaterApp";
    public static final String NOTIFICATION_CHANNEL_ID = "pure_notifications";
    private static final String INTERCOM_PREFS = "intercom_state";
    private static final String KEY_REGISTERED_USER_ID = "registered_user_id";
    private static boolean intercomInitialized = false;
    private static Gen3FirmwareUpdaterApp instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;

        // Initialize ServiceFactory (shared singletons)
        ServiceFactory.init(this);

        // Create notification channels (Android 8.0+)
        createNotificationChannels();

        // Initialize Intercom SDK (skip if placeholder credentials)
        String apiKey = BuildConfig.INTERCOM_API_KEY;
        String appId = BuildConfig.INTERCOM_APP_ID;

        if (apiKey != null && apiKey.startsWith("android_sdk-") && appId != null && !appId.startsWith("PLACEHOLDER")) {
            Intercom.initialize(this, apiKey, appId);
            intercomInitialized = true;
            Log.d(TAG, "Intercom SDK initialized");

            // Establish an Intercom session immediately so the SDK can communicate
            // with the server. If user is already logged in, register as identified;
            // otherwise register as unidentified (will be upgraded on login).
            bootstrapIntercomSession();
        } else {
            Log.w(TAG, "Intercom SDK not initialized — placeholder or missing credentials");
        }
    }

    /**
     * Returns true if Intercom was initialized with valid credentials.
     * All Intercom.client() calls should be guarded with this check.
     */
    public static boolean isIntercomInitialized() {
        return intercomInitialized;
    }

    /**
     * Check if the given userId is already registered with Intercom.
     * The SDK persists login state across launches, so calling loginIdentifiedUser()
     * again causes a "user already exists" error.
     */
    public static boolean isIntercomUserRegistered(String userId) {
        if (instance == null || userId == null) return false;
        return userId.equals(instance.getSharedPreferences(INTERCOM_PREFS, MODE_PRIVATE)
                .getString(KEY_REGISTERED_USER_ID, ""));
    }

    /**
     * Mark a userId as registered with Intercom.
     */
    public static void setIntercomUserRegistered(String userId) {
        if (instance == null) return;
        instance.getSharedPreferences(INTERCOM_PREFS, MODE_PRIVATE)
                .edit().putString(KEY_REGISTERED_USER_ID, userId).apply();
    }

    /**
     * Clear Intercom registration state (call on logout).
     */
    public static void clearIntercomUserRegistered() {
        if (instance == null) return;
        instance.getSharedPreferences(INTERCOM_PREFS, MODE_PRIVATE)
                .edit().remove(KEY_REGISTERED_USER_ID).apply();
    }

    /**
     * Bootstrap an Intercom session immediately after initialization.
     * If the user is already logged in (session exists), register as identified user.
     * Otherwise, register as unidentified so the SDK has an active server connection.
     * Without this, the messenger UI renders locally but messages never reach Intercom.
     */
    private void bootstrapIntercomSession() {
        try {
            com.pure.gen3firmwareupdater.services.SessionManager session =
                    ServiceFactory.getSessionManager();
            String userId = session.getUserId();

            if (userId != null && !userId.isEmpty()) {
                // User already logged in — check if SDK already has this session
                if (isIntercomUserRegistered(userId)) {
                    Log.d(TAG, "Intercom: user already registered from previous session: " + userId);
                } else {
                    // Register identified user
                    Registration registration = Registration.create().withUserId(userId);
                    Intercom.client().loginIdentifiedUser(registration, new io.intercom.android.sdk.IntercomStatusCallback() {
                        @Override
                        public void onSuccess() {
                            Log.d(TAG, "Intercom: bootstrap identified user: " + userId);
                            setIntercomUserRegistered(userId);

                            // Set user attributes
                            String email = session.getUserEmail();
                            String role = session.getUserRole();
                            io.intercom.android.sdk.UserAttributes attrs =
                                    new io.intercom.android.sdk.UserAttributes.Builder()
                                            .withEmail(email != null ? email : "")
                                            .withCustomAttribute("role", role != null ? role : "normal")
                                            .withCustomAttribute("app_version", BuildConfig.VERSION_NAME)
                                            .build();
                            Intercom.client().updateUser(attrs);
                        }

                        @Override
                        public void onFailure(io.intercom.android.sdk.IntercomError error) {
                            Log.w(TAG, "Intercom: bootstrap login failed: " + error.getErrorMessage());
                            // "User already exists" — mark as registered
                            setIntercomUserRegistered(userId);
                        }
                    });
                }
            } else {
                // No logged-in user — register unidentified so SDK has a session
                Intercom.client().loginUnidentifiedUser(new io.intercom.android.sdk.IntercomStatusCallback() {
                    @Override
                    public void onSuccess() {
                        Log.d(TAG, "Intercom: bootstrap unidentified user success");
                    }

                    @Override
                    public void onFailure(io.intercom.android.sdk.IntercomError error) {
                        Log.w(TAG, "Intercom: bootstrap unidentified user failed: " + error.getErrorMessage());
                    }
                });
            }
        } catch (Exception e) {
            Log.w(TAG, "Intercom: bootstrap error", e);
        }
    }

    /**
     * Create notification channels for Android 8.0+ (API 26+).
     * Must be called before any notification is posted.
     */
    private void createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;

            NotificationChannel channel = new NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Pure Electric Notifications",
                    NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Updates and announcements from Pure Electric");
            channel.enableVibration(true);
            nm.createNotificationChannel(channel);

            Log.d(TAG, "Notification channel created: " + NOTIFICATION_CHANNEL_ID);
        }
    }
}
