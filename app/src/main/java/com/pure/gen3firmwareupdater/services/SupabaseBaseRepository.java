package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Base class for all Supabase repository classes.
 * Provides shared HTTP infrastructure, callback handling, and utility methods.
 */
public abstract class SupabaseBaseRepository {

    private static final String TAG = "SupabaseBase";
    protected static final MediaType JSON_MEDIA_TYPE = MediaType.get("application/json; charset=utf-8");

    protected final String supabaseUrl;
    protected final String supabaseKey;
    protected final OkHttpClient httpClient;
    protected final Gson gson;
    protected final Handler mainHandler;
    protected final ExecutorService executor;

    /**
     * Generic callback interface for async operations.
     * Results are posted to the main thread.
     */
    public interface Callback<T> {
        void onSuccess(T result);
        void onError(String error);
    }

    public SupabaseBaseRepository(String supabaseUrl, String supabaseKey,
                                   OkHttpClient httpClient, Gson gson,
                                   Handler mainHandler, ExecutorService executor) {
        this.supabaseUrl = supabaseUrl;
        this.supabaseKey = supabaseKey;
        this.httpClient = httpClient;
        this.gson = gson;
        this.mainHandler = mainHandler;
        this.executor = executor;
    }

    /**
     * Build an authenticated GET request.
     */
    protected Request buildGetRequest(String url) {
        return new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .build();
    }

    /**
     * POST a JSON body to a URL and extract the ID from the response.
     * Returns the ID string, or empty string if no ID in response.
     */
    protected String postAndExtractId(String url, JsonObject json, String logTag) throws IOException {
        RequestBody requestBody = RequestBody.create(json.toString(), JSON_MEDIA_TYPE);
        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=representation")
                .post(requestBody)
                .build();

        Log.d(TAG, logTag + " POST: " + json);
        Response response = httpClient.newCall(request).execute();
        String responseBody = getResponseBody(response);
        Log.d(TAG, logTag + " HTTP " + response.code() + ": " + responseBody);

        if (!response.isSuccessful()) {
            throw new IOException("Failed to create record: HTTP " + response.code() + " - " + responseBody);
        }

        JsonArray resultArray = JsonParser.parseString(responseBody).getAsJsonArray();
        if (resultArray.size() > 0) {
            return resultArray.get(0).getAsJsonObject().get("id").getAsString();
        }
        return "";
    }

    /**
     * Safely extract response body as a string. Throws IOException if body is null.
     */
    protected String getResponseBody(Response response) throws IOException {
        if (response.body() == null) {
            throw new IOException("Empty response body (HTTP " + response.code() + ")");
        }
        return response.body().string();
    }

    /**
     * Safely get a string field from a JsonObject, returning null if missing or null.
     */
    protected String getStringField(JsonObject obj, String field) {
        if (obj.has(field) && !obj.get(field).isJsonNull()) {
            return obj.get(field).getAsString();
        }
        return null;
    }

    /**
     * Post a success result to the main thread.
     */
    protected <T> void postSuccess(Callback<T> callback, T result) {
        mainHandler.post(() -> callback.onSuccess(result));
    }

    /**
     * Post an error to the main thread.
     */
    protected <T> void postError(Callback<T> callback, String error) {
        mainHandler.post(() -> callback.onError(error));
    }

    /**
     * Format an exception into a user-friendly error message.
     */
    protected String formatError(Exception e) {
        if (e instanceof IOException) {
            return "Network error: " + e.getMessage();
        }
        return "Error: " + e.getMessage();
    }

    /**
     * Shut down the executor service. Call from activity onDestroy().
     */
    public void shutdown() {
        executor.shutdown();
    }
}
