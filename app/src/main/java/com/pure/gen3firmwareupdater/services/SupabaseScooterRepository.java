package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.ScooterRegistrationInfo;

import java.io.IOException;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
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
     * Create a scooter record in the database.
     * Returns the new scooter's UUID.
     * This is a synchronous call - must be called from a background thread.
     */
    public String createScooterRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion) throws IOException {
        JsonObject scooterBody = new JsonObject();
        scooterBody.addProperty("zyd_serial", scooterSerial);
        scooterBody.addProperty("distributor_id", distributorId);

        String url = supabaseUrl + "/rest/v1/scooters";
        RequestBody requestBody = RequestBody.create(scooterBody.toString(), JSON_MEDIA_TYPE);
        Request request = new Request.Builder()
                .url(url)
                .addHeader("apikey", supabaseKey)
                .addHeader("Authorization", "Bearer " + supabaseKey)
                .addHeader("Content-Type", "application/json")
                .addHeader("Prefer", "return=representation")
                .post(requestBody)
                .build();

        Log.d(TAG, "Creating scooter record: " + scooterBody);
        Response response = httpClient.newCall(request).execute();
        String responseBody = getResponseBody(response);
        Log.d(TAG, "createScooterRecord HTTP " + response.code() + ": " + responseBody);

        if (!response.isSuccessful()) {
            throw new IOException("Failed to create scooter: HTTP " + response.code() + " - " + responseBody);
        }

        JsonArray resultArray = JsonParser.parseString(responseBody).getAsJsonArray();
        if (resultArray.size() > 0) {
            return resultArray.get(0).getAsJsonObject().get("id").getAsString();
        } else {
            throw new IOException("No ID returned when creating scooter");
        }
    }

    /**
     * Get registration status for a scooter - check if it's registered to a customer.
     */
    public void getScooterRegistrationStatus(String scooterSerial, Callback<ScooterRegistrationInfo> callback) {
        executor.execute(() -> {
            try {
                String scooterId = lookupScooterId(scooterSerial);
                if (scooterId == null) {
                    postError(callback, "Scooter not found in database");
                    return;
                }

                // Query user_scooters table with JOIN to users table
                String url = supabaseUrl + "/rest/v1/user_scooters"
                        + "?scooter_id=eq." + scooterId
                        + "&select=*,users(first_name,last_name,email)"
                        + "&order=registered_at.desc"
                        + "&limit=1";

                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);

                Log.d(TAG, "getScooterRegistrationStatus HTTP " + response.code() + ": " + body);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    // Not registered to any user
                    postError(callback, "Scooter not registered to any customer");
                    return;
                }

                JsonObject obj = array.get(0).getAsJsonObject();
                ScooterRegistrationInfo info = new ScooterRegistrationInfo();

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

                postSuccess(callback, info);

            } catch (Exception e) {
                Log.e(TAG, "getScooterRegistrationStatus error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }
}
