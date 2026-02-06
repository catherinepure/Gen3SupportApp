package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.FirmwareVersion;
import com.pure.gen3firmwareupdater.TelemetryRecord;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Repository for firmware-related Supabase operations.
 * Handles firmware version queries, binary downloads, and upload record management.
 */
public class SupabaseFirmwareRepository extends SupabaseBaseRepository {

    private static final String TAG = "FirmwareRepo";

    private final SupabaseScooterRepository scooterRepo;

    public SupabaseFirmwareRepository(String supabaseUrl, String supabaseKey,
                                       OkHttpClient httpClient, Gson gson,
                                       Handler mainHandler, ExecutorService executor,
                                       SupabaseScooterRepository scooterRepo) {
        super(supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
        this.scooterRepo = scooterRepo;
    }

    /**
     * Get the latest active firmware version for a given hardware version.
     */
    public void getLatestFirmware(String hwVersion, Callback<FirmwareVersion> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/firmware_versions"
                        + "?target_hw_version=eq." + hwVersion
                        + "&is_active=eq.true"
                        + "&order=created_at.desc"
                        + "&limit=1";

                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "getLatestFirmware response: " + body);

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    postError(callback, "No firmware available for hardware version " + hwVersion);
                    return;
                }

                FirmwareVersion fw = gson.fromJson(array.get(0), FirmwareVersion.class);
                postSuccess(callback, fw);

            } catch (Exception e) {
                Log.e(TAG, "getLatestFirmware error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get all active firmware versions for a given hardware version.
     * Uses the firmware_hw_targets junction table to support multiple HW versions per firmware.
     */
    public void getAllFirmwareForHardware(String hwVersion, Callback<List<FirmwareVersion>> callback) {
        executor.execute(() -> {
            try {
                // Query the junction table to find firmware_version_ids that match this hw_version
                String targetsUrl = supabaseUrl + "/rest/v1/firmware_hw_targets"
                        + "?hw_version=eq." + hwVersion
                        + "&select=firmware_version_id";

                Request targetsRequest = buildGetRequest(targetsUrl);
                Response targetsResponse = httpClient.newCall(targetsRequest).execute();
                String targetsBody = getResponseBody(targetsResponse);
                Log.d(TAG, "getAllFirmwareForHardware targets response: " + targetsBody);

                JsonArray targetsArray = JsonParser.parseString(targetsBody).getAsJsonArray();
                if (targetsArray.size() == 0) {
                    postError(callback, "No firmware available for hardware version " + hwVersion);
                    return;
                }

                // Extract firmware version IDs
                List<String> firmwareIds = new ArrayList<>();
                for (int i = 0; i < targetsArray.size(); i++) {
                    String fwId = targetsArray.get(i).getAsJsonObject().get("firmware_version_id").getAsString();
                    firmwareIds.add(fwId);
                }

                // Fetch all firmware versions that match these IDs and are active
                StringBuilder idFilter = new StringBuilder();
                for (int i = 0; i < firmwareIds.size(); i++) {
                    if (i > 0) idFilter.append(",");
                    idFilter.append(firmwareIds.get(i));
                }

                String firmwareUrl = supabaseUrl + "/rest/v1/firmware_versions"
                        + "?id=in.(" + idFilter + ")"
                        + "&is_active=eq.true"
                        + "&order=created_at.desc";

                Request firmwareRequest = buildGetRequest(firmwareUrl);
                Response firmwareResponse = httpClient.newCall(firmwareRequest).execute();
                String firmwareBody = getResponseBody(firmwareResponse);
                Log.d(TAG, "getAllFirmwareForHardware firmware response: " + firmwareBody);

                JsonArray firmwareArray = JsonParser.parseString(firmwareBody).getAsJsonArray();
                List<FirmwareVersion> versions = new ArrayList<>();
                for (int i = 0; i < firmwareArray.size(); i++) {
                    FirmwareVersion fw = gson.fromJson(firmwareArray.get(i), FirmwareVersion.class);
                    versions.add(fw);
                }

                if (versions.isEmpty()) {
                    postError(callback, "No active firmware available for hardware version " + hwVersion);
                    return;
                }

                postSuccess(callback, versions);

            } catch (Exception e) {
                Log.e(TAG, "getAllFirmwareForHardware error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Download firmware binary from Supabase Storage.
     */
    public void downloadFirmwareBinary(String filePath, Callback<byte[]> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/storage/v1/object/public/firmware-binaries/" + filePath;
                Log.d(TAG, "Downloading firmware from: " + url);

                Request request = new Request.Builder()
                        .url(url)
                        .build();

                Response response = httpClient.newCall(request).execute();
                if (!response.isSuccessful()) {
                    postError(callback, "Download failed: HTTP " + response.code());
                    return;
                }

                if (response.body() == null) {
                    postError(callback, "Empty response from server");
                    return;
                }
                byte[] data = response.body().bytes();
                Log.d(TAG, "Downloaded firmware: " + data.length + " bytes");
                postSuccess(callback, data);

            } catch (Exception e) {
                Log.e(TAG, "downloadFirmwareBinary error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Create a firmware upload record (status=started).
     */
    public void createUploadRecord(String scooterId, String firmwareVersionId,
                                    String distributorId, String oldHwVersion,
                                    String oldSwVersion, String newVersion,
                                    Callback<String> callback) {
        executor.execute(() -> {
            try {
                JsonObject json = new JsonObject();
                json.addProperty("scooter_id", scooterId);
                json.addProperty("firmware_version_id", firmwareVersionId);
                json.addProperty("distributor_id", distributorId);
                json.addProperty("old_hw_version", oldHwVersion);
                json.addProperty("old_sw_version", oldSwVersion);
                json.addProperty("new_version", newVersion);
                json.addProperty("status", "started");

                String url = supabaseUrl + "/rest/v1/firmware_uploads";

                Request request = new Request.Builder()
                        .url(url)
                        .addHeader("apikey", supabaseKey)
                        .addHeader("Authorization", "Bearer " + supabaseKey)
                        .addHeader("Content-Type", "application/json")
                        .addHeader("Prefer", "return=representation")
                        .post(RequestBody.create(json.toString(), JSON_MEDIA_TYPE))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "createUploadRecord response: " + body);

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() > 0) {
                    String recordId = array.get(0).getAsJsonObject().get("id").getAsString();
                    postSuccess(callback, recordId);
                } else {
                    postError(callback, "Failed to create upload record");
                }

            } catch (Exception e) {
                Log.e(TAG, "createUploadRecord error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Update a firmware upload record (status=completed or failed).
     */
    public void updateUploadRecord(String recordId, String status, String errorMessage,
                                    Callback<Void> callback) {
        executor.execute(() -> {
            try {
                JsonObject json = new JsonObject();
                json.addProperty("status", status);
                if (errorMessage != null) {
                    json.addProperty("error_message", errorMessage);
                }
                if ("completed".equals(status) || "failed".equals(status)) {
                    json.addProperty("completed_at",
                            new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
                                    .format(new java.util.Date()));
                }

                String url = supabaseUrl + "/rest/v1/firmware_uploads?id=eq." + recordId;

                Request request = new Request.Builder()
                        .url(url)
                        .addHeader("apikey", supabaseKey)
                        .addHeader("Authorization", "Bearer " + supabaseKey)
                        .addHeader("Content-Type", "application/json")
                        .patch(RequestBody.create(json.toString(), JSON_MEDIA_TYPE))
                        .build();

                Response response = httpClient.newCall(request).execute();
                Log.d(TAG, "updateUploadRecord response: " + response.code());

                postSuccess(callback, null);

            } catch (Exception e) {
                Log.e(TAG, "updateUploadRecord error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get update history for a specific scooter (paginated).
     * Uses the scooterRepo to look up the scooter ID by serial.
     */
    public void getScooterUpdateHistory(String scooterSerial, String distributorId, int limit, int offset,
                                        Callback<List<TelemetryRecord>> callback) {
        executor.execute(() -> {
            try {
                String scooterId = scooterRepo.lookupScooterId(scooterSerial);
                if (scooterId == null) {
                    postError(callback, "Scooter not found");
                    return;
                }

                String url = supabaseUrl + "/rest/v1/firmware_uploads"
                        + "?scooter_id=eq." + scooterId
                        + "&select=*"
                        + "&order=started_at.desc"
                        + "&limit=" + limit
                        + "&offset=" + offset;

                Log.d(TAG, "getScooterUpdateHistory URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "getScooterUpdateHistory HTTP " + response.code() + ": " + body);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                List<TelemetryRecord> records = new ArrayList<>();

                for (JsonElement element : array) {
                    JsonObject obj = element.getAsJsonObject();
                    TelemetryRecord record = new TelemetryRecord();
                    record.id = obj.has("id") ? obj.get("id").getAsString() : "";
                    record.uploadedAt = obj.has("started_at") ? obj.get("started_at").getAsString() : "";
                    record.startedAt = obj.has("started_at") ? obj.get("started_at").getAsString() : "";
                    record.completedAt = obj.has("completed_at") && !obj.get("completed_at").isJsonNull()
                            ? obj.get("completed_at").getAsString() : null;
                    record.hwVersion = obj.has("old_hw_version") && !obj.get("old_hw_version").isJsonNull()
                            ? obj.get("old_hw_version").getAsString() : "Unknown";
                    record.swVersion = obj.has("old_sw_version") && !obj.get("old_sw_version").isJsonNull()
                            ? obj.get("old_sw_version").getAsString() : "Unknown";
                    record.newVersion = obj.has("new_version") && !obj.get("new_version").isJsonNull()
                            ? obj.get("new_version").getAsString() : null;
                    record.fromVersion = record.swVersion;
                    record.toVersion = record.newVersion != null ? record.newVersion : "Unknown";
                    record.status = obj.has("status") ? obj.get("status").getAsString() : "unknown";
                    record.errorMessage = obj.has("error_message") && !obj.get("error_message").isJsonNull()
                            ? obj.get("error_message").getAsString() : null;
                    record.scanType = "firmware_update";
                    parseTelemetryFields(obj, record);

                    records.add(record);
                }

                postSuccess(callback, records);

            } catch (Exception e) {
                Log.e(TAG, "getScooterUpdateHistory error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Parse shared telemetry fields from a JSON object into a TelemetryRecord.
     */
    protected void parseTelemetryFields(JsonObject obj, TelemetryRecord record) {
        record.voltage = obj.has("voltage") && !obj.get("voltage").isJsonNull()
                ? obj.get("voltage").getAsDouble() : null;
        record.current = obj.has("current") && !obj.get("current").isJsonNull()
                ? obj.get("current").getAsDouble() : null;
        record.speedKmh = obj.has("speed_kmh") && !obj.get("speed_kmh").isJsonNull()
                ? obj.get("speed_kmh").getAsDouble() : null;
        record.odometerKm = obj.has("odometer_km") && !obj.get("odometer_km").isJsonNull()
                ? obj.get("odometer_km").getAsInt() : null;
        record.motorTemp = obj.has("motor_temp") && !obj.get("motor_temp").isJsonNull()
                ? obj.get("motor_temp").getAsInt() : null;
        record.batteryTemp = obj.has("battery_temp") && !obj.get("battery_temp").isJsonNull()
                ? obj.get("battery_temp").getAsInt() : null;
        record.batterySOC = obj.has("battery_soc") && !obj.get("battery_soc").isJsonNull()
                ? obj.get("battery_soc").getAsInt() : null;
        record.batteryHealth = obj.has("battery_health") && !obj.get("battery_health").isJsonNull()
                ? obj.get("battery_health").getAsInt() : null;
        record.batteryChargeCycles = obj.has("battery_charge_cycles") && !obj.get("battery_charge_cycles").isJsonNull()
                ? obj.get("battery_charge_cycles").getAsInt() : null;
        record.batteryDischargeCycles = obj.has("battery_discharge_cycles") && !obj.get("battery_discharge_cycles").isJsonNull()
                ? obj.get("battery_discharge_cycles").getAsInt() : null;
        record.remainingCapacityMah = obj.has("remaining_capacity_mah") && !obj.get("remaining_capacity_mah").isJsonNull()
                ? obj.get("remaining_capacity_mah").getAsInt() : null;
        record.fullCapacityMah = obj.has("full_capacity_mah") && !obj.get("full_capacity_mah").isJsonNull()
                ? obj.get("full_capacity_mah").getAsInt() : null;
        record.embeddedSerial = obj.has("embedded_serial") && !obj.get("embedded_serial").isJsonNull()
                ? obj.get("embedded_serial").getAsString() : null;
    }
}
