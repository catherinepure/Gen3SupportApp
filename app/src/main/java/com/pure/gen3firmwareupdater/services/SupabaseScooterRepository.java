package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.ScooterRegistrationInfo;

import com.pure.gen3firmwareupdater.VersionInfo;

import java.io.IOException;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Repository for scooter-related Supabase operations.
 * Handles scooter lookup, creation, and registration status.
 */
public class SupabaseScooterRepository extends SupabaseBaseRepository {

    private static final String TAG = "ScooterRepo";

    public SupabaseScooterRepository(String supabaseUrl, String supabaseKey,
                                      OkHttpClient httpClient, Gson gson,
                                      Handler mainHandler, ExecutorService executor) {
        super(supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
    }

    /**
     * Get the scooter record by serial number (to get scooter UUID for upload logging).
     */
    public void getScooterBySerial(String zydSerial, Callback<JsonObject> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/scooters"
                        + "?zyd_serial=eq." + zydSerial
                        + "&select=*";

                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    postError(callback, "Scooter not found");
                    return;
                }

                postSuccess(callback, array.get(0).getAsJsonObject());

            } catch (Exception e) {
                Log.e(TAG, "getScooterBySerial error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Look up a scooter UUID by serial number. Returns null if not found.
     * This is a synchronous call - must be called from a background thread.
     */
    public String lookupScooterId(String scooterSerial) throws IOException {
        String scooterUrl = supabaseUrl + "/rest/v1/scooters"
                + "?zyd_serial=eq." + scooterSerial
                + "&select=id";

        Request request = buildGetRequest(scooterUrl);
        Response response = httpClient.newCall(request).execute();
        String body = getResponseBody(response);

        if (!response.isSuccessful()) {
            throw new IOException("Failed to find scooter: HTTP " + response.code());
        }

        JsonArray array = JsonParser.parseString(body).getAsJsonArray();
        if (array.size() == 0) {
            return null;
        }
        return array.get(0).getAsJsonObject().get("id").getAsString();
    }

    /**
     * Look up a scooter by serial, creating it if it doesn't exist.
     * Returns the scooter UUID.
     * This is a synchronous call - must be called from a background thread.
     */
    public String getOrCreateScooterId(String scooterSerial, String distributorId,
                                        String hwVersion, String swVersion) throws IOException {
        String scooterId = lookupScooterId(scooterSerial);
        if (scooterId != null) {
            return scooterId;
        }
        Log.d(TAG, "Scooter not found in database, creating new record for: " + scooterSerial);
        return createScooterRecord(scooterSerial, distributorId, hwVersion, swVersion);
    }

    /**
     * Create a scooter record via Edge Function (service_role writes).
     * Returns the new scooter's UUID.
     * This is a synchronous call - must be called from a background thread.
     */
    public String createScooterRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("action", "get-or-create");
        body.addProperty("zyd_serial", scooterSerial);
        if (distributorId != null) body.addProperty("distributor_id", distributorId);

        Log.d(TAG, "Creating scooter record via Edge Function: " + scooterSerial);
        JsonObject result = callEdgeFunction("update-scooter", body);

        if (result.has("id")) {
            String id = result.get("id").getAsString();
            Log.d(TAG, "createScooterRecord success: " + id);
            return id;
        } else {
            throw new IOException("No ID returned when creating scooter");
        }
    }

    /**
     * Update a scooter record with version info via Edge Function (service_role writes).
     * Updates firmware versions, model, embedded serial, and last_connected_at.
     * This is a synchronous call - must be called from a background thread.
     */
    public void updateScooterRecord(String scooterId, VersionInfo version,
                                     String embeddedSerial, String model) throws IOException {
        JsonObject body = new JsonObject();
        body.addProperty("action", "update-version");
        body.addProperty("scooter_id", scooterId);

        if (version != null) {
            if (version.controllerHwVersion != null) body.addProperty("controller_hw_version", version.controllerHwVersion);
            if (version.controllerSwVersion != null) body.addProperty("controller_sw_version", version.controllerSwVersion);
            if (version.meterHwVersion != null) body.addProperty("meter_hw_version", version.meterHwVersion);
            if (version.meterSwVersion != null) body.addProperty("meter_sw_version", version.meterSwVersion);
            if (version.bmsHwVersion != null) body.addProperty("bms_hw_version", version.bmsHwVersion);
            if (version.bmsSwVersion != null) body.addProperty("bms_sw_version", version.bmsSwVersion);
        }

        if (embeddedSerial != null && !embeddedSerial.isEmpty()) {
            body.addProperty("embedded_serial", embeddedSerial);
        }

        if (model != null && !model.isEmpty()) {
            body.addProperty("model", model);
        }

        Log.d(TAG, "updateScooterRecord via Edge Function: " + scooterId);
        try {
            callEdgeFunction("update-scooter", body);
            Log.d(TAG, "updateScooterRecord success for " + scooterId);
        } catch (IOException e) {
            Log.w(TAG, "updateScooterRecord failed: " + e.getMessage());
        }
    }

    /**
     * Clear the diagnostic flag on a scooter (e.g., after user declines or collection completes).
     * Calls the Edge Function clear-diagnostic action.
     *
     * @param scooterId  The scooter UUID
     * @param declined   True if user declined the request
     * @param callback   Callback for result
     */
    public void clearDiagnosticFlag(String scooterId, boolean declined, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "clear-diagnostic");
                body.addProperty("scooter_id", scooterId);
                body.addProperty("declined", declined);

                Log.d(TAG, "Clearing diagnostic flag for scooter: " + scooterId
                        + " (declined=" + declined + ")");
                callEdgeFunction("update-scooter", body);
                Log.d(TAG, "Diagnostic flag cleared successfully");
                postSuccess(callback, null);

            } catch (Exception e) {
                Log.e(TAG, "clearDiagnosticFlag error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get registration status for a scooter - check if it's registered to a customer.
     * Looks up scooter ID by serial first — use getScooterRegistrationStatusById if you
     * already have the scooter ID to save a network round-trip.
     */
    public void getScooterRegistrationStatus(String scooterSerial, Callback<ScooterRegistrationInfo> callback) {
        executor.execute(() -> {
            try {
                String scooterId = lookupScooterId(scooterSerial);
                if (scooterId == null) {
                    postError(callback, "Scooter not found in database");
                    return;
                }
                fetchRegistrationStatus(scooterId, callback);
            } catch (Exception e) {
                Log.e(TAG, "getScooterRegistrationStatus error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get registration status when scooter ID is already known.
     * Saves one HTTP round-trip vs getScooterRegistrationStatus(serial).
     */
    public void getScooterRegistrationStatusById(String scooterId, Callback<ScooterRegistrationInfo> callback) {
        executor.execute(() -> {
            try {
                fetchRegistrationStatus(scooterId, callback);
            } catch (Exception e) {
                Log.e(TAG, "getScooterRegistrationStatusById error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Internal: fetch registration status for a known scooter ID.
     * Single query with JOIN to users and scooters (for PIN status) — 1 HTTP call.
     */
    private void fetchRegistrationStatus(String scooterId, Callback<ScooterRegistrationInfo> callback) throws IOException {
        // Single query: user_scooters with JOIN to users AND scooters (for pin_encrypted)
        String url = supabaseUrl + "/rest/v1/user_scooters"
                + "?scooter_id=eq." + scooterId
                + "&select=*,users(first_name,last_name,email),scooters(pin_encrypted)"
                + "&order=registered_at.desc"
                + "&limit=1";

        Request request = buildGetRequest(url);
        Response response = httpClient.newCall(request).execute();
        String body = getResponseBody(response);

        Log.d(TAG, "fetchRegistrationStatus HTTP " + response.code() + ": " + body);

        if (!response.isSuccessful()) {
            postError(callback, "Server error: HTTP " + response.code());
            return;
        }

        JsonArray array = JsonParser.parseString(body).getAsJsonArray();
        if (array.size() == 0) {
            // Not registered — still return info with scooterId and PIN status
            ScooterRegistrationInfo info = new ScooterRegistrationInfo();
            info.scooterId = scooterId;
            // Check PIN status even if unregistered (distributors need this)
            checkPinStatusFallback(scooterId, info);
            postSuccess(callback, info);
            return;
        }

        JsonObject obj = array.get(0).getAsJsonObject();
        ScooterRegistrationInfo info = new ScooterRegistrationInfo();
        info.scooterId = scooterId;

        info.userId = obj.has("user_id") ? obj.get("user_id").getAsString() : null;
        info.registeredDate = obj.has("registered_at") ? obj.get("registered_at").getAsString() : null;
        info.lastConnectedDate = obj.has("last_connected_at") && !obj.get("last_connected_at").isJsonNull()
                ? obj.get("last_connected_at").getAsString() : null;
        info.isPrimary = obj.has("is_primary") && obj.get("is_primary").getAsBoolean();
        info.nickname = obj.has("nickname") && !obj.get("nickname").isJsonNull()
                ? obj.get("nickname").getAsString() : null;

        // Parse user info from JOIN
        if (obj.has("users") && !obj.get("users").isJsonNull()) {
            JsonObject userObj = obj.get("users").getAsJsonObject();
            String firstName = userObj.has("first_name") && !userObj.get("first_name").isJsonNull()
                    ? userObj.get("first_name").getAsString() : "";
            String lastName = userObj.has("last_name") && !userObj.get("last_name").isJsonNull()
                    ? userObj.get("last_name").getAsString() : "";
            info.ownerName = (firstName + " " + lastName).trim();
            info.ownerEmail = userObj.has("email") ? userObj.get("email").getAsString() : "";
        }

        // PIN status from scooters JOIN (no extra HTTP call)
        if (obj.has("scooters") && !obj.get("scooters").isJsonNull()) {
            JsonObject scooterObj = obj.get("scooters").getAsJsonObject();
            info.hasPinSet = scooterObj.has("pin_encrypted")
                    && !scooterObj.get("pin_encrypted").isJsonNull();
        }

        postSuccess(callback, info);
    }

    /**
     * Fallback PIN check for unregistered scooters (no user_scooters row so no JOIN available).
     */
    private void checkPinStatusFallback(String scooterId, ScooterRegistrationInfo info) {
        try {
            String pinUrl = supabaseUrl + "/rest/v1/scooters"
                    + "?id=eq." + scooterId
                    + "&select=pin_encrypted";
            Request pinReq = buildGetRequest(pinUrl);
            Response pinResp = httpClient.newCall(pinReq).execute();
            String pinBody = getResponseBody(pinResp);
            if (pinResp.isSuccessful()) {
                JsonArray pinArr = JsonParser.parseString(pinBody).getAsJsonArray();
                if (pinArr.size() > 0) {
                    JsonObject scooterObj = pinArr.get(0).getAsJsonObject();
                    info.hasPinSet = scooterObj.has("pin_encrypted")
                            && !scooterObj.get("pin_encrypted").isJsonNull();
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not check PIN status: " + e.getMessage());
        }
    }
}
