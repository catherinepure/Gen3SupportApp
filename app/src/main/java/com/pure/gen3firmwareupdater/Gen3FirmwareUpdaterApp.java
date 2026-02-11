package com.pure.gen3firmwareupdater;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.util.Log;

import com.pure.gen3firmwareupdater.services.ServiceFactory;

import io.intercom.android.sdk.Intercom;

public class Gen3FirmwareUpdaterApp extends Application {

    private static final String TAG = "Gen3FirmwareUpdaterApp";
    public static final String NOTIFICATION_CHANNEL_ID = "pure_notifications";
    private static boolean intercomInitialized = false;

    @Override
    public void onCreate() {
        super.onCreate();

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
