package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.annotations.SerializedName;

import java.io.IOException;
import java.util.Locale;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Manages Terms & Conditions operations:
 * - Fetch latest T&C version
 * - Check if user needs to accept new version
 * - Record consent
 * - Language/region resolution
 */
public class TermsManager {

    private static final String TAG = "TermsManager";
    private static final String PREFS_NAME = "TermsPrefs";
    private static final String KEY_LAST_CHECK = "last_terms_check";
    private static final String KEY_CACHED_VERSION = "cached_version";
    private static final long CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    private final String supabaseUrl;
    private final String supabaseKey;
    private final OkHttpClient httpClient;
    private final Gson gson;
    private final SharedPreferences prefs;
    private final Context context;

    public TermsManager(Context context, String supabaseUrl, String supabaseKey) {
        this.context = context;
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        this.httpClient = new OkHttpClient();
        this.gson = new Gson();
        this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    // ================================================================================
    // Data Classes
    // ================================================================================

    public static class TermsInfo {
        public String id;
        public String version;
        @SerializedName("language_code") public String languageCode;
        @SerializedName("region_code") public String regionCode;
        @SerializedName("state_code") public String stateCode;
        @SerializedName("document_type") public String documentType;
        public String title;
        @SerializedName("public_url") public String publicUrl;
        @SerializedName("effective_date") public String effectiveDate;
        @SerializedName("file_size_bytes") public long fileSizeBytes;
    }

    public static class ConsentCheckResult {
        @SerializedName("needs_acceptance") public boolean needsAcceptance;
        @SerializedName("current_version") public String currentVersion;
        @SerializedName("latest_version") public String latestVersion;
        @SerializedName("last_accepted_at") public String lastAcceptedAt;
        public String region;
        public String language;
        @SerializedName("terms_url") public String termsUrl;
        @SerializedName("terms_id") public String termsId;
        @SerializedName("terms_title") public String termsTitle;
    }

    public interface TermsCallback<T> {
        void onSuccess(T result);
        void onError(String error);
    }

    // ================================================================================
    // Check if Update Needed
    // ================================================================================

    /**
     * Check if enough time has passed since last check
     */
    public boolean shouldCheckForUpdate() {
        long lastCheck = prefs.getLong(KEY_LAST_CHECK, 0);
        long now = System.currentTimeMillis();
        return (now - lastCheck) > CHECK_INTERVAL_MS;
    }

    /**
     * Update last check timestamp
     */
    private void updateLastCheckTime() {
        prefs.edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply();
    }

    // ================================================================================
    // Language & Region Resolution
    // ================================================================================

    /**
     * Get device language (ISO 639-1 code: en, es, fr, etc.)
     */
    public String getDeviceLanguage() {
        return Locale.getDefault().getLanguage();
    }

    /**
     * Resolve best language for user
     * Priority: Saved preference → Device language → English
     */
    public String resolveLanguage(String preferredLanguage) {
        if (preferredLanguage != null && !preferredLanguage.isEmpty()) {
            return preferredLanguage;
        }
        return getDeviceLanguage();
    }

    // ================================================================================
    // Fetch Latest T&C
    // ================================================================================

    /**
     * Fetch latest T&C version for region/language.
     * Delegates to the overload with null state.
     */
    public void getLatestTerms(String region, String language, String documentType, TermsCallback<TermsInfo> callback) {
        getLatestTerms(region, language, null, documentType, callback);
    }

    /**
     * Fetch latest T&C version for region/language with optional state subdivision.
     * State-level fallback: state-specific -> country-level -> English.
     */
    public void getLatestTerms(String region, String language, String state, String documentType, TermsCallback<TermsInfo> callback) {
        String url = supabaseUrl + "/functions/v1/terms/latest" +
                "?region=" + region +
                "&language=" + language +
                "&document_type=" + documentType;

        if (state != null && !state.isEmpty()) {
            url += "&state=" + state;
        }

        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .get()
                .build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body().string();

                if (!response.isSuccessful()) {
                    Log.e(TAG, "Failed to fetch latest terms: " + body);
                    callback.onError("Failed to fetch terms: " + response.code());
                    return;
                }

                try {
                    TermsInfo termsInfo = gson.fromJson(body, TermsInfo.class);
                    callback.onSuccess(termsInfo);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to parse terms response", e);
                    callback.onError("Failed to parse response");
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Network error fetching terms", e);
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    // ================================================================================
    // Check Acceptance Status
    // ================================================================================

    /**
     * Check if user needs to accept new T&C version
     */
    public void checkAcceptanceStatus(String userId, String sessionToken, TermsCallback<ConsentCheckResult> callback) {
        String url = supabaseUrl + "/functions/v1/terms/check-acceptance" +
                "?user_id=" + userId;

        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .addHeader("X-Session-Token", sessionToken)
                .get()
                .build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String body = response.body().string();

                if (!response.isSuccessful()) {
                    Log.e(TAG, "Failed to check acceptance: " + body);
                    callback.onError("Failed to check acceptance: " + response.code());
                    return;
                }

                try {
                    ConsentCheckResult result = gson.fromJson(body, ConsentCheckResult.class);
                    updateLastCheckTime();
                    callback.onSuccess(result);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to parse consent check response", e);
                    callback.onError("Failed to parse response");
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Network error checking acceptance", e);
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    // ================================================================================
    // Record Consent
    // ================================================================================

    /**
     * Record user consent with full audit trail
     */
    public void recordConsent(
            String sessionToken,
            String userId,
            String termsId,
            String version,
            String languageCode,
            String regionCode,
            String documentType,
            boolean accepted,
            boolean scrolledToBottom,
            int timeToReadSeconds,
            String ipAddress,
            String userAgent,
            String deviceInfo,
            TermsCallback<JsonObject> callback
    ) {
        String url = supabaseUrl + "/functions/v1/terms/record-consent";

        JsonObject payload = new JsonObject();
        payload.addProperty("session_token", sessionToken);
        payload.addProperty("user_id", userId);
        payload.addProperty("terms_id", termsId);
        payload.addProperty("version", version);
        payload.addProperty("language_code", languageCode);
        payload.addProperty("region_code", regionCode);
        payload.addProperty("document_type", documentType);
        payload.addProperty("accepted", accepted);
        payload.addProperty("scrolled_to_bottom", scrolledToBottom);
        payload.addProperty("time_to_read_seconds", timeToReadSeconds);
        payload.addProperty("ip_address", ipAddress);
        payload.addProperty("user_agent", userAgent);
        payload.addProperty("device_info", deviceInfo);

        RequestBody body = RequestBody.create(
                payload.toString(),
                MediaType.parse("application/json")
        );

        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .addHeader("Content-Type", "application/json")
                .post(body)
                .build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body().string();

                if (!response.isSuccessful()) {
                    Log.e(TAG, "Failed to record consent: " + responseBody);
                    callback.onError("Failed to record consent: " + response.code());
                    return;
                }

                try {
                    JsonObject result = gson.fromJson(responseBody, JsonObject.class);
                    callback.onSuccess(result);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to parse consent response", e);
                    callback.onError("Failed to parse response");
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Network error recording consent", e);
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    // ================================================================================
    // Helper Methods
    // ================================================================================

    /**
     * Get user's public IP address (for audit trail)
     * Uses a public IP service
     */
    public void getPublicIPAddress(TermsCallback<String> callback) {
        Request request = new Request.Builder()
                .url("https://api.ipify.org?format=text")
                .get()
                .build();

        httpClient.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    String ip = response.body().string().trim();
                    callback.onSuccess(ip);
                } else {
                    callback.onError("Failed to get IP");
                }
            }

            @Override
            public void onFailure(Call call, IOException e) {
                callback.onError(e.getMessage());
            }
        });
    }

    /**
     * Get user agent string
     */
    public String getUserAgent() {
        return System.getProperty("http.agent", "Unknown");
    }

    /**
     * Get device info string
     */
    public String getDeviceInfo() {
        return android.os.Build.MODEL + " (Android " + android.os.Build.VERSION.RELEASE + ")";
    }
}
