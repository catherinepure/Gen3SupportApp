package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.UserInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Repository for user management Supabase operations.
 * Handles user search, retrieval, updates, deactivation, and audit logging.
 */
public class SupabaseUserRepository extends SupabaseBaseRepository {

    private static final String TAG = "UserRepo";

    public SupabaseUserRepository(String supabaseUrl, String supabaseKey,
                                   OkHttpClient httpClient, Gson gson,
                                   Handler mainHandler, ExecutorService executor) {
        super(supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
    }

    /**
     * Search users belonging to a distributor.
     * @param query Search term (matches email, first_name, last_name). Empty = all users.
     * @param filter "all", "active", "inactive", or "unverified"
     * @param distributorId The distributor's ID to scope results
     */
    public void searchUsers(String query, String filter, String distributorId,
                             Callback<List<UserInfo>> callback) {
        executor.execute(() -> {
            try {
                StringBuilder url = new StringBuilder(supabaseUrl + "/rest/v1/users");
                url.append("?distributor_id=eq.").append(distributorId);
                url.append("&select=*");

                // Add search query if provided
                if (query != null && !query.trim().isEmpty()) {
                    String q = query.trim().replace(" ", "%20");
                    url.append("&or=(email.ilike.*").append(q).append("*")
                       .append(",first_name.ilike.*").append(q).append("*")
                       .append(",last_name.ilike.*").append(q).append("*)");
                }

                // Add filter
                if (filter != null) {
                    switch (filter) {
                        case "active":
                            url.append("&is_active=eq.true&is_verified=eq.true");
                            break;
                        case "inactive":
                            url.append("&is_active=eq.false");
                            break;
                        case "unverified":
                            url.append("&is_verified=eq.false&is_active=eq.true");
                            break;
                        // "all" - no additional filter
                    }
                }

                url.append("&order=created_at.desc&limit=50");

                Log.d(TAG, "searchUsers URL: " + url);
                Request request = buildGetRequest(url.toString());
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "searchUsers HTTP " + response.code() + ": " + body);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                List<UserInfo> users = new ArrayList<>();

                for (JsonElement element : array) {
                    JsonObject obj = element.getAsJsonObject();
                    UserInfo user = parseUserInfo(obj);
                    users.add(user);
                }

                postSuccess(callback, users);

            } catch (Exception e) {
                Log.e(TAG, "searchUsers error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get a single user by ID.
     */
    public void getUserById(String userId, Callback<UserInfo> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/users"
                        + "?id=eq." + userId
                        + "&select=*";

                Log.d(TAG, "getUserById URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    postError(callback, "User not found");
                    return;
                }

                UserInfo user = parseUserInfo(array.get(0).getAsJsonObject());
                postSuccess(callback, user);

            } catch (Exception e) {
                Log.e(TAG, "getUserById error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Update user fields. Only sends changed fields.
     */
    public void updateUser(String userId, JsonObject changes, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/users?id=eq." + userId;

                RequestBody requestBody = RequestBody.create(changes.toString(), JSON_MEDIA_TYPE);
                Request request = new Request.Builder()
                        .url(url)
                        .addHeader("apikey", supabaseKey)
                        .addHeader("Authorization", "Bearer " + supabaseKey)
                        .addHeader("Content-Type", "application/json")
                        .addHeader("Prefer", "return=minimal")
                        .patch(requestBody)
                        .build();

                Log.d(TAG, "updateUser PATCH: " + changes);
                Response response = httpClient.newCall(request).execute();

                if (!response.isSuccessful()) {
                    String body = getResponseBody(response);
                    Log.e(TAG, "updateUser error: HTTP " + response.code() + " - " + body);
                    postError(callback, "Failed to update user: HTTP " + response.code());
                    return;
                }

                postSuccess(callback, null);

            } catch (Exception e) {
                Log.e(TAG, "updateUser error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Deactivate a user (soft delete: sets is_active=false).
     */
    public void deactivateUser(String userId, Callback<Void> callback) {
        JsonObject changes = new JsonObject();
        changes.addProperty("is_active", false);
        updateUser(userId, changes, callback);
    }

    /**
     * Create an audit log entry for user changes.
     */
    public void createAuditLogEntry(String userId, String action, JsonObject details,
                                     Callback<Void> callback) {
        executor.execute(() -> {
            try {
                JsonObject auditEntry = new JsonObject();
                auditEntry.addProperty("user_id", userId);
                auditEntry.addProperty("action", action);
                auditEntry.add("details", details);

                String url = supabaseUrl + "/rest/v1/user_audit_log";

                RequestBody requestBody = RequestBody.create(auditEntry.toString(), JSON_MEDIA_TYPE);
                Request request = new Request.Builder()
                        .url(url)
                        .addHeader("apikey", supabaseKey)
                        .addHeader("Authorization", "Bearer " + supabaseKey)
                        .addHeader("Content-Type", "application/json")
                        .addHeader("Prefer", "return=minimal")
                        .post(requestBody)
                        .build();

                Log.d(TAG, "createAuditLogEntry POST: " + auditEntry);
                Response response = httpClient.newCall(request).execute();

                if (!response.isSuccessful()) {
                    String body = getResponseBody(response);
                    Log.e(TAG, "createAuditLogEntry error: HTTP " + response.code() + " - " + body);
                    // Don't fail the main operation for audit log issues
                    postError(callback, "Failed to create audit log: HTTP " + response.code());
                    return;
                }

                postSuccess(callback, null);

            } catch (Exception e) {
                Log.e(TAG, "createAuditLogEntry error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get audit log entries for a user, ordered by most recent first.
     */
    public void getUserAuditLog(String userId, int limit, Callback<List<JsonObject>> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/user_audit_log"
                        + "?user_id=eq." + userId
                        + "&select=*"
                        + "&order=created_at.desc"
                        + "&limit=" + limit;

                Log.d(TAG, "getUserAuditLog URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                List<JsonObject> entries = new ArrayList<>();
                for (JsonElement element : array) {
                    entries.add(element.getAsJsonObject());
                }

                postSuccess(callback, entries);

            } catch (Exception e) {
                Log.e(TAG, "getUserAuditLog error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get scooter serial numbers linked to a user.
     */
    public void getUserScooters(String userId, Callback<List<String>> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/user_scooters"
                        + "?user_id=eq." + userId
                        + "&select=zyd_serial"
                        + "&order=registered_at.desc";

                Log.d(TAG, "getUserScooters URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                List<String> serials = new ArrayList<>();
                for (JsonElement element : array) {
                    JsonObject obj = element.getAsJsonObject();
                    if (obj.has("zyd_serial") && !obj.get("zyd_serial").isJsonNull()) {
                        serials.add(obj.get("zyd_serial").getAsString());
                    }
                }

                postSuccess(callback, serials);

            } catch (Exception e) {
                Log.e(TAG, "getUserScooters error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Parse a JSON object from the users table into a UserInfo.
     */
    private UserInfo parseUserInfo(JsonObject obj) {
        UserInfo user = new UserInfo();
        user.id = getStringField(obj, "id");
        user.email = getStringField(obj, "email");
        user.firstName = getStringField(obj, "first_name");
        user.lastName = getStringField(obj, "last_name");
        user.userLevel = getStringField(obj, "user_level");
        user.distributorId = getStringField(obj, "distributor_id");
        user.ageRange = getStringField(obj, "age_range");
        user.gender = getStringField(obj, "gender");
        user.scooterUseType = getStringField(obj, "scooter_use_type");
        user.isActive = obj.has("is_active") && !obj.get("is_active").isJsonNull()
                && obj.get("is_active").getAsBoolean();
        user.isVerified = obj.has("is_verified") && !obj.get("is_verified").isJsonNull()
                && obj.get("is_verified").getAsBoolean();
        user.createdAt = getStringField(obj, "created_at");
        return user;
    }
}
