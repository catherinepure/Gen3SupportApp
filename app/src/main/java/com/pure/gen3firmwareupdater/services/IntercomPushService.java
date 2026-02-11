package com.pure.gen3firmwareupdater.services;

import android.app.PendingIntent;
import android.content.Intent;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.pure.gen3firmwareupdater.Gen3FirmwareUpdaterApp;
import com.pure.gen3firmwareupdater.R;
import com.pure.gen3firmwareupdater.SettingsActivity;
import com.pure.gen3firmwareupdater.UserDashboardActivity;

import java.util.Map;

import io.intercom.android.sdk.push.IntercomPushClient;

/**
 * Firebase Cloud Messaging service.
 * Routes incoming push messages to either:
 * - Intercom SDK (support chat notifications)
 * - Custom notification display (admin-sent notifications from web-admin)
 *
 * Also registers FCM tokens with both Intercom and Supabase on refresh.
 */
public class IntercomPushService extends FirebaseMessagingService {

    private static final String TAG = "IntercomPushService";
    private final IntercomPushClient intercomPushClient = new IntercomPushClient();

    @Override
    public void onNewToken(String token) {
        Log.d(TAG, "FCM token refreshed");

        // Forward to Intercom SDK (for support chat push)
        intercomPushClient.sendTokenToIntercom(getApplication(), token);

        // Also save to Supabase (for custom push notifications)
        try {
            new DeviceTokenManager().registerToken(token);
        } catch (Exception e) {
            Log.w(TAG, "Failed to register token with Supabase", e);
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();

        if (intercomPushClient.isIntercomPush(data)) {
            Log.d(TAG, "Intercom push received");
            intercomPushClient.handlePush(getApplication(), data);
        } else if ("pure_custom".equals(data.get("source"))) {
            Log.d(TAG, "Custom push notification received");
            showCustomNotification(data);
        } else {
            super.onMessageReceived(remoteMessage);
        }
    }

    /**
     * Display a custom push notification from the admin panel.
     * Uses data-only message so this is called in both foreground and background.
     */
    private void showCustomNotification(Map<String, String> data) {
        String title = data.getOrDefault("title", "Pure Electric");
        String body = data.getOrDefault("body", "");
        String notificationId = data.get("notification_id");
        String action = data.getOrDefault("action", "none");

        // Choose target activity based on action
        Intent intent;
        if ("open_settings".equals(action)) {
            intent = new Intent(this, SettingsActivity.class);
        } else {
            intent = new Intent(this, UserDashboardActivity.class);
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, intent,
                PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(
                this, Gen3FirmwareUpdaterApp.NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_brand_p)
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setPriority(NotificationCompat.PRIORITY_HIGH);

        // Use longer style for multi-line body
        if (body.length() > 40) {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        int notifId = notificationId != null ? notificationId.hashCode() : (int) System.currentTimeMillis();

        try {
            nm.notify(notifId, builder.build());
        } catch (SecurityException e) {
            // POST_NOTIFICATIONS permission not granted (Android 13+)
            Log.w(TAG, "Cannot show notification — permission not granted", e);
        }
    }
}
