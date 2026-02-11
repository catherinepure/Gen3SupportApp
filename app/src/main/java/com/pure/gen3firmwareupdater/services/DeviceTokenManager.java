package com.pure.gen3firmwareupdater.services;

import android.os.Build;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.BuildConfig;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Manages FCM device token registration with Supabase.
 * Tokens are stored in the device_tokens table for custom push notifications.
 *
 * Pattern: fire-and-forget HTTP calls on a background thread (same as AuthClient).
 */
public class DeviceTokenManager {

    private static final String TAG = "DeviceTokenManager";
    private static final String REGISTER_URL =
            BuildConfig.SUPABASE_URL + "/functions/v1/register-device";
    private static final MediaType JSON_MEDIA =
            MediaType.parse("application/json; charset=utf-8");

    private final OkHttpClient httpClient = new OkHttpClient();
    private final Gson gson = new Gson();
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /**
     * Returns a stable device fingerprint for this device.
     * Used as the unique key (alongside user_id) in the device_tokens table.
     */
    public static String getDeviceFingerprint() {
        return Build.MODEL + "_" + Integer.toHexString(Build.FINGERPRINT.hashCode());
    }

    /**
     * Returns a human-readable device name (e.g., "Samsung SM-G991B").
     */
    public static String getDeviceName() {
        return Build.MANUFACTURER + " " + Build.MODEL;
    }

    /**
     * Register (or update) the FCM token in Supabase.
     * Called on login, dashboard entry, and FCM token refresh.
     * Fire-and-forget — failures are logged but don't affect the user.
     */
    public void registerToken(String fcmToken) {
        SessionManager session = ServiceFactory.getSessionManager();
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Log.d(TAG, "No session — skipping token registration");
            return;
        }

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "register");
                body.addProperty("session_token", sessionToken);
                body.addProperty("fcm_token", fcmToken);
                body.addProperty("device_fingerprint", getDeviceFingerprint());
                body.addProperty("device_name", getDeviceName());
                body.addProperty("app_version", BuildConfig.VERSION_NAME);

                RequestBody reqBody = RequestBody.create(gson.toJson(body), JSON_MEDIA);

                Request request = new Request.Builder()
                        .url(REGISTER_URL)
                        .post(reqBody)
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "FCM token registered with Supabase");
                    } else {
                        Log.w(TAG, "Token registration failed: " + response.code());
                    }
                }
            } catch (IOException e) {
                Log.w(TAG, "Token registration error", e);
            }
        });
    }

    /**
     * Remove the device token from Supabase on logout.
     * Fire-and-forget — failures are logged but don't block logout.
     */
    public void unregisterToken() {
        SessionManager session = ServiceFactory.getSessionManager();
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Log.d(TAG, "No session — skipping token unregister");
            return;
        }

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "unregister");
                body.addProperty("session_token", sessionToken);
                body.addProperty("device_fingerprint", getDeviceFingerprint());

                RequestBody reqBody = RequestBody.create(gson.toJson(body), JSON_MEDIA);

                Request request = new Request.Builder()
                        .url(REGISTER_URL)
                        .post(reqBody)
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .build();

                try (Response response = httpClient.newCall(request).execute()) {
                    if (response.isSuccessful()) {
                        Log.d(TAG, "FCM token unregistered from Supabase");
                    } else {
                        Log.w(TAG, "Token unregister failed: " + response.code());
                    }
                }
            } catch (IOException e) {
                Log.w(TAG, "Token unregister error", e);
            }
        });
    }
}
