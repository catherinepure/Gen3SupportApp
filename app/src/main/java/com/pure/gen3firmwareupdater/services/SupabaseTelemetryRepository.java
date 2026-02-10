package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.BMSDataInfo;
import com.pure.gen3firmwareupdater.RunningDataInfo;
import com.pure.gen3firmwareupdater.TelemetryRecord;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Repository for telemetry and scan record Supabase operations.
 * Handles telemetry creation, scan records, and telemetry history retrieval.
 */
public class SupabaseTelemetryRepository extends SupabaseBaseRepository {

    private static final String TAG = "TelemetryRepo";

    private final SupabaseScooterRepository scooterRepo;

    public SupabaseTelemetryRepository(String supabaseUrl, String supabaseKey,
                                        OkHttpClient httpClient, Gson gson,
                                        Handler mainHandler, ExecutorService executor,
                                        SupabaseScooterRepository scooterRepo) {
        super(supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
        this.scooterRepo = scooterRepo;
    }

    /**
     * Create a scan record when a scooter is scanned/connected (simple version).
     */
    public void createScanRecord(String scooterSerial, String distributorId,
                                  String hwVersion, String swVersion,
                                  Callback<String> callback) {
        createScanRecord(scooterSerial, distributorId, hwVersion, swVersion, null, null, null, callback);
    }

    /**
     * Create a scan record when a scooter is scanned/connected with telemetry data.
     * Posts to firmware_uploads table with status "scanned".
     */
    public void createScanRecord(String scooterSerial, String distributorId,
                                  String hwVersion, String swVersion,
                                  RunningDataInfo runningData, BMSDataInfo bmsData,
                                  String embeddedSerial, Callback<String> callback) {
        executor.execute(() -> {
            try {
                String scooterId = scooterRepo.getOrCreateScooterId(scooterSerial, distributorId, hwVersion, swVersion);

                // Get the latest firmware version ID (needed for the foreign key constraint)
                String firmwareUrl = supabaseUrl + "/rest/v1/firmware_versions?limit=1&select=id&order=created_at.desc";
                Request firmwareRequest = buildGetRequest(firmwareUrl);
                Response firmwareResponse = httpClient.newCall(firmwareRequest).execute();
                String firmwareBody = getResponseBody(firmwareResponse);

                if (!firmwareResponse.isSuccessful()) {
                    postError(callback, "Failed to get firmware version: HTTP " + firmwareResponse.code());
                    return;
                }

                JsonArray firmwareArray = JsonParser.parseString(firmwareBody).getAsJsonArray();
                if (firmwareArray.size() == 0) {
                    postError(callback, "No firmware versions found in database");
                    return;
                }

                String firmwareVersionId = firmwareArray.get(0).getAsJsonObject().get("id").getAsString();

                // Build scan record JSON
                JsonObject body = new JsonObject();
                body.addProperty("scooter_id", scooterId);
                body.addProperty("distributor_id", distributorId);
                body.addProperty("firmware_version_id", firmwareVersionId);
                body.addProperty("old_hw_version", hwVersion);
                body.addProperty("old_sw_version", swVersion);
                body.addProperty("status", "scanned");
                addTelemetryFields(body, runningData, bmsData, embeddedSerial);

                String recordId = postAndExtractId(supabaseUrl + "/rest/v1/firmware_uploads", body, "createScanRecord");
                postSuccess(callback, recordId);

            } catch (Exception e) {
                Log.e(TAG, "createScanRecord error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Create a telemetry record in scooter_telemetry table.
     * This is the primary approach for tracking scooter scans, separate from firmware updates.
     */
    public void createTelemetryRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion,
                                       RunningDataInfo runningData, BMSDataInfo bmsData,
                                       String embeddedSerial, String scanType,
                                       Callback<String> callback) {
        executor.execute(() -> {
            try {
                String scooterId = scooterRepo.getOrCreateScooterId(scooterSerial, distributorId, hwVersion, swVersion);

                // Get user_id if scooter is registered
                String userId = null;
                try {
                    String userUrl = supabaseUrl + "/rest/v1/user_scooters"
                            + "?scooter_id=eq." + scooterId
                            + "&select=user_id"
                            + "&order=registered_at.desc"
                            + "&limit=1";
                    Request userRequest = buildGetRequest(userUrl);
                    Response userResponse = httpClient.newCall(userRequest).execute();
                    String userBody = getResponseBody(userResponse);
                    JsonArray userArray = JsonParser.parseString(userBody).getAsJsonArray();
                    if (userArray.size() > 0) {
                        userId = userArray.get(0).getAsJsonObject().get("user_id").getAsString();
                    }
                } catch (Exception e) {
                    Log.d(TAG, "No user registration found for scooter (normal for unregistered scooters)");
                }

                // Build telemetry record JSON
                JsonObject body = new JsonObject();
                body.addProperty("scooter_id", scooterId);
                body.addProperty("distributor_id", distributorId);
                if (userId != null) {
                    body.addProperty("user_id", userId);
                }
                body.addProperty("hw_version", hwVersion);
                body.addProperty("sw_version", swVersion);
                body.addProperty("scan_type", scanType);
                addTelemetryFields(body, runningData, bmsData, embeddedSerial);

                String recordId = postAndExtractId(supabaseUrl + "/rest/v1/scooter_telemetry", body, "createTelemetryRecord");
                postSuccess(callback, recordId);

            } catch (Exception e) {
                Log.e(TAG, "createTelemetryRecord error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get telemetry history for a specific scooter (paginated).
     */
    public void getScooterTelemetry(String scooterSerial, int limit, int offset,
                                     Callback<List<TelemetryRecord>> callback) {
        executor.execute(() -> {
            try {
                String scooterId = scooterRepo.lookupScooterId(scooterSerial);
                if (scooterId == null) {
                    postError(callback, "Scooter not found");
                    return;
                }

                String url = supabaseUrl + "/rest/v1/scooter_telemetry"
                        + "?scooter_id=eq." + scooterId
                        + "&select=*"
                        + "&order=scanned_at.desc"
                        + "&limit=" + limit
                        + "&offset=" + offset;

                Log.d(TAG, "getScooterTelemetry URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "getScooterTelemetry HTTP " + response.code() + ": " + body);

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
                    record.scooterId = obj.has("scooter_id") ? obj.get("scooter_id").getAsString() : "";
                    record.distributorId = obj.has("distributor_id") && !obj.get("distributor_id").isJsonNull()
                            ? obj.get("distributor_id").getAsString() : null;
                    record.userId = obj.has("user_id") && !obj.get("user_id").isJsonNull()
                            ? obj.get("user_id").getAsString() : null;

                    record.hwVersion = obj.has("hw_version") && !obj.get("hw_version").isJsonNull()
                            ? obj.get("hw_version").getAsString() : null;
                    record.swVersion = obj.has("sw_version") && !obj.get("sw_version").isJsonNull()
                            ? obj.get("sw_version").getAsString() : null;

                    record.scanType = obj.has("scan_type") ? obj.get("scan_type").getAsString() : "unknown";
                    record.notes = obj.has("notes") && !obj.get("notes").isJsonNull()
                            ? obj.get("notes").getAsString() : null;
                    record.scannedAt = obj.has("scanned_at") ? obj.get("scanned_at").getAsString() : "";

                    parseTelemetryFields(obj, record);
                    records.add(record);
                }

                postSuccess(callback, records);

            } catch (Exception e) {
                Log.e(TAG, "getScooterTelemetry error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Populate telemetry fields on a JsonObject from RunningDataInfo and BMSDataInfo.
     *
     * NOTE: In the correct protocol, voltage/current/battery% come from 0xA1 (BMS),
     * not from 0xA0 (RunningData). RunningData has speed, distances, temps, fault codes.
     * The cross-population (BMS→RunningData) happens in ScooterConnectionService,
     * so runningData.voltage/current/batteryPercent should be populated if BMS was received.
     */
    protected void addTelemetryFields(JsonObject json, RunningDataInfo runningData,
                                       BMSDataInfo bmsData, String embeddedSerial) {
        // Voltage and current come primarily from BMS (0xA1) - the correct source
        if (bmsData != null) {
            json.addProperty("voltage", bmsData.batteryVoltage);
            json.addProperty("current", bmsData.batteryCurrent);
            json.addProperty("battery_soc", bmsData.batterySOC);
            json.addProperty("battery_health", bmsData.batteryHealth);
            json.addProperty("battery_charge_cycles", bmsData.chargeCycles);
            json.addProperty("battery_discharge_cycles", bmsData.dischargeCycles);
            json.addProperty("remaining_capacity_mah", bmsData.remainingCapacity);
            json.addProperty("full_capacity_mah", bmsData.fullCapacity);
            json.addProperty("battery_temp", bmsData.batteryTemperature);
        } else if (runningData != null) {
            // Fallback: use cross-populated values from RunningData if BMS not available
            if (runningData.voltage > 0) json.addProperty("voltage", runningData.voltage);
            if (runningData.current != 0) json.addProperty("current", runningData.current);
            if (runningData.batteryPercent > 0) json.addProperty("battery_soc", runningData.batteryPercent);
            if (runningData.batteryTemp != 0) json.addProperty("battery_temp", runningData.batteryTemp);
        }

        if (runningData != null) {
            json.addProperty("speed_kmh", runningData.currentSpeed);
            json.addProperty("odometer_km", runningData.totalDistance);
            json.addProperty("motor_temp", runningData.motorTemp);
            // New fields from correct 0xA0 protocol
            json.addProperty("controller_temp", runningData.controllerTemp);
            json.addProperty("fault_code", runningData.faultCode);
            json.addProperty("gear_level", runningData.gearLevel);
            json.addProperty("trip_distance_km", runningData.tripDistance);
            json.addProperty("remaining_range_km", runningData.remainingRange);
            json.addProperty("motor_rpm", runningData.motorRPM);
            json.addProperty("current_limit", runningData.currentLimit);
        }

        if (embeddedSerial != null && !embeddedSerial.isEmpty()) {
            json.addProperty("embedded_serial", embeddedSerial);
        }
    }

    /**
     * Parse shared telemetry fields from a JSON object into a TelemetryRecord.
     */
    protected void parseTelemetryFields(JsonObject obj, TelemetryRecord record) {
        // BMS data (0xA1) - voltage, current, battery metrics
        record.voltage = obj.has("voltage") && !obj.get("voltage").isJsonNull()
                ? obj.get("voltage").getAsDouble() : null;
        record.current = obj.has("current") && !obj.get("current").isJsonNull()
                ? obj.get("current").getAsDouble() : null;
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
        record.batteryTemp = obj.has("battery_temp") && !obj.get("battery_temp").isJsonNull()
                ? obj.get("battery_temp").getAsInt() : null;

        // Running data (0xA0) - speed, distances, temps, faults
        record.speedKmh = obj.has("speed_kmh") && !obj.get("speed_kmh").isJsonNull()
                ? obj.get("speed_kmh").getAsDouble() : null;
        record.odometerKm = obj.has("odometer_km") && !obj.get("odometer_km").isJsonNull()
                ? obj.get("odometer_km").getAsInt() : null;
        record.motorTemp = obj.has("motor_temp") && !obj.get("motor_temp").isJsonNull()
                ? obj.get("motor_temp").getAsInt() : null;
        record.controllerTemp = obj.has("controller_temp") && !obj.get("controller_temp").isJsonNull()
                ? obj.get("controller_temp").getAsInt() : null;
        record.faultCode = obj.has("fault_code") && !obj.get("fault_code").isJsonNull()
                ? obj.get("fault_code").getAsInt() : null;
        record.gearLevel = obj.has("gear_level") && !obj.get("gear_level").isJsonNull()
                ? obj.get("gear_level").getAsInt() : null;
        record.tripDistanceKm = obj.has("trip_distance_km") && !obj.get("trip_distance_km").isJsonNull()
                ? obj.get("trip_distance_km").getAsInt() : null;
        record.remainingRangeKm = obj.has("remaining_range_km") && !obj.get("remaining_range_km").isJsonNull()
                ? obj.get("remaining_range_km").getAsInt() : null;
        record.motorRpm = obj.has("motor_rpm") && !obj.get("motor_rpm").isJsonNull()
                ? obj.get("motor_rpm").getAsInt() : null;
        record.currentLimit = obj.has("current_limit") && !obj.get("current_limit").isJsonNull()
                ? obj.get("current_limit").getAsDouble() : null;

        record.embeddedSerial = obj.has("embedded_serial") && !obj.get("embedded_serial").isJsonNull()
                ? obj.get("embedded_serial").getAsString() : null;
    }
}
