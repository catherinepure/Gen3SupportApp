package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.reflect.TypeToken;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;

/**
 * Manages an offline queue for telemetry records that couldn't be uploaded
 * at disconnect time (e.g., no internet connection).
 *
 * Records are stored as JSON strings in SharedPreferences and uploaded
 * on the next successful BLE connection.
 *
 * Follows the same SharedPreferences pattern as UserSettingsManager and PinCacheManager.
 */
public class TelemetryQueueManager {

    private static final String TAG = "TelemetryQueue";
    private static final String PREFS_NAME = "TelemetryQueuePrefs";
    private static final String KEY_QUEUE = "queued_records";
    private static final int MAX_QUEUE_SIZE = 50;

    private final SharedPreferences prefs;
    private final Gson gson;

    public TelemetryQueueManager(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        this.gson = new Gson();
    }

    /**
     * Add a telemetry record to the offline queue.
     * If the queue exceeds MAX_QUEUE_SIZE, the oldest record is dropped.
     *
     * @param record JSON object containing all telemetry fields
     */
    public synchronized void enqueue(JsonObject record) {
        List<String> queue = getQueueInternal();

        // Cap at MAX_QUEUE_SIZE — drop oldest if full
        if (queue.size() >= MAX_QUEUE_SIZE) {
            int excess = queue.size() - MAX_QUEUE_SIZE + 1;
            for (int i = 0; i < excess; i++) {
                queue.remove(0);
            }
            Log.w(TAG, "Queue full, dropped " + excess + " oldest record(s)");
        }

        queue.add(record.toString());
        saveQueue(queue);
        Log.d(TAG, "Enqueued telemetry record. Queue size: " + queue.size());
    }

    /**
     * Drain all pending records from the queue atomically.
     * Returns the records and clears the queue.
     *
     * @return list of JsonObject records, or empty list if none queued
     */
    public synchronized List<JsonObject> drainQueue() {
        List<String> queue = getQueueInternal();
        if (queue.isEmpty()) {
            return new ArrayList<>();
        }

        // Parse all records
        List<JsonObject> records = new ArrayList<>();
        for (String json : queue) {
            try {
                records.add(JsonParser.parseString(json).getAsJsonObject());
            } catch (Exception e) {
                Log.w(TAG, "Skipping malformed queued record: " + e.getMessage());
            }
        }

        // Clear queue atomically
        prefs.edit().remove(KEY_QUEUE).apply();
        Log.d(TAG, "Drained " + records.size() + " records from queue");

        return records;
    }

    /**
     * Check if there are pending records in the queue.
     */
    public boolean hasPending() {
        return getQueueSize() > 0;
    }

    /**
     * Get the number of records currently queued.
     */
    public int getQueueSize() {
        return getQueueInternal().size();
    }

    /**
     * Clear all queued records without returning them.
     */
    public synchronized void clear() {
        prefs.edit().remove(KEY_QUEUE).apply();
        Log.d(TAG, "Queue cleared");
    }

    // --- Internal ---

    private List<String> getQueueInternal() {
        String json = prefs.getString(KEY_QUEUE, null);
        if (json == null || json.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            Type listType = new TypeToken<List<String>>() {}.getType();
            List<String> result = gson.fromJson(json, listType);
            return result != null ? result : new ArrayList<>();
        } catch (Exception e) {
            Log.w(TAG, "Failed to parse queue, clearing: " + e.getMessage());
            prefs.edit().remove(KEY_QUEUE).apply();
            return new ArrayList<>();
        }
    }

    private void saveQueue(List<String> queue) {
        String json = gson.toJson(queue);
        prefs.edit().putString(KEY_QUEUE, json).apply();
    }
}
