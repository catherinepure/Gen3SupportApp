package com.pure.gen3firmwareupdater;

import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class AuthClient {
    private static final String TAG = "AuthClient";
    // Supabase Edge Functions URL
    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1";
    private static final String SUPABASE_ANON_KEY = BuildConfig.SUPABASE_ANON_KEY;

    private final OkHttpClient httpClient;
    private final Gson gson;
    private final ExecutorService executor;

    public AuthClient() {
        this.httpClient = new OkHttpClient();
        this.gson = new Gson();
        this.executor = Executors.newSingleThreadExecutor();
    }

    // Helper method to add Supabase auth headers to requests
    private Request.Builder addSupabaseHeaders(Request.Builder builder) {
        return builder
                .header("Authorization", "Bearer " + SUPABASE_ANON_KEY)
                .header("apikey", SUPABASE_ANON_KEY);
    }

    public interface Callback<T> {
        void onSuccess(T result);
        void onError(String error);
    }

    public static class User {
        public String id;
        public String email;
        public String role;
        public String distributorId;
    }

    public static class LoginResponse {
        public boolean success;
        public String sessionToken;
        public User user;
    }

    public static class DistributorRegistrationResponse {
        public boolean success;
        public String message;
        public String userId;
        public String distributorName;
    }

    public void register(JsonObject registrationData, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                RequestBody body = RequestBody.create(
                        registrationData.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/register")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body().string();

                if (response.isSuccessful()) {
                    callback.onSuccess(null);
                } else {
                    JsonObject error = gson.fromJson(responseBody, JsonObject.class);
                    String errorMsg = error.has("error") ? error.get("error").getAsString() : "Registration failed";
                    callback.onError(errorMsg);
                }
            } catch (IOException e) {
                Log.e(TAG, "Registration error: " + e.getMessage());
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void login(String email, String password, String deviceInfo, Callback<LoginResponse> callback) {
        executor.execute(() -> {
            try {
                Log.d(TAG, "Sending login request to: " + BASE_URL + "/login");
                JsonObject json = new JsonObject();
                json.addProperty("email", email);
                json.addProperty("password", password);
                json.addProperty("device_info", deviceInfo);

                RequestBody body = RequestBody.create(
                        json.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/login")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body().string();

                Log.d(TAG, "Login response code: " + response.code());
                Log.d(TAG, "Login response body: " + responseBody);

                if (response.isSuccessful()) {
                    JsonObject jsonResponse = gson.fromJson(responseBody, JsonObject.class);

                    LoginResponse loginResponse = new LoginResponse();
                    loginResponse.success = jsonResponse.get("success").getAsBoolean();
                    loginResponse.sessionToken = jsonResponse.get("session_token").getAsString();

                    JsonObject userObj = jsonResponse.getAsJsonObject("user");
                    loginResponse.user = new User();
                    loginResponse.user.id = userObj.get("id").getAsString();
                    loginResponse.user.email = userObj.get("email").getAsString();
                    loginResponse.user.role = userObj.get("role").getAsString();

                    if (userObj.has("distributor_id") && !userObj.get("distributor_id").isJsonNull()) {
                        loginResponse.user.distributorId = userObj.get("distributor_id").getAsString();
                    }

                    callback.onSuccess(loginResponse);
                } else {
                    Log.e(TAG, "Login request failed with code: " + response.code());
                    JsonObject error = gson.fromJson(responseBody, JsonObject.class);
                    String errorMsg = error.has("error") ? error.get("error").getAsString() : "Login failed";
                    Log.e(TAG, "Login error message: " + errorMsg);
                    callback.onError(errorMsg);
                }
            } catch (Exception e) {
                Log.e(TAG, "Login error: " + e.getMessage());
                e.printStackTrace();
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void validateSession(String sessionToken, Callback<User> callback) {
        executor.execute(() -> {
            try {
                JsonObject json = new JsonObject();
                json.addProperty("session_token", sessionToken);

                RequestBody body = RequestBody.create(
                        json.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/validate-session")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body().string();

                if (response.isSuccessful()) {
                    JsonObject jsonResponse = gson.fromJson(responseBody, JsonObject.class);

                    if (jsonResponse.get("valid").getAsBoolean()) {
                        JsonObject userObj = jsonResponse.getAsJsonObject("user");
                        User user = new User();
                        user.id = userObj.get("id").getAsString();
                        user.email = userObj.get("email").getAsString();
                        user.role = userObj.get("role").getAsString();

                        if (userObj.has("distributor_id") && !userObj.get("distributor_id").isJsonNull()) {
                            user.distributorId = userObj.get("distributor_id").getAsString();
                        }

                        callback.onSuccess(user);
                    } else {
                        callback.onError("Session invalid");
                    }
                } else {
                    callback.onError("Session validation failed");
                }
            } catch (Exception e) {
                Log.e(TAG, "Validation error: " + e.getMessage());
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void resendVerification(String email, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                JsonObject json = new JsonObject();
                json.addProperty("email", email);

                RequestBody body = RequestBody.create(
                        json.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/resend-verification")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();

                if (response.isSuccessful()) {
                    callback.onSuccess(null);
                } else {
                    String responseBody = response.body().string();
                    JsonObject error = gson.fromJson(responseBody, JsonObject.class);
                    String errorMsg = error.has("error") ? error.get("error").getAsString() : "Failed to resend verification";
                    callback.onError(errorMsg);
                }
            } catch (Exception e) {
                Log.e(TAG, "Resend verification error: " + e.getMessage());
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void logout(String sessionToken, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                JsonObject json = new JsonObject();
                json.addProperty("session_token", sessionToken);

                RequestBody body = RequestBody.create(
                        json.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/logout")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();

                if (response.isSuccessful()) {
                    callback.onSuccess(null);
                } else {
                    callback.onError("Logout failed");
                }
            } catch (Exception e) {
                Log.e(TAG, "Logout error: " + e.getMessage());
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void registerUser(JsonObject registrationData, Callback<Void> callback) {
        executor.execute(() -> {
            try {
                RequestBody body = RequestBody.create(
                        registrationData.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/register-user")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body().string();

                if (response.isSuccessful()) {
                    callback.onSuccess(null);
                } else {
                    JsonObject error = gson.fromJson(responseBody, JsonObject.class);
                    String errorMsg = error.has("error") ? error.get("error").getAsString() : "Registration failed";
                    callback.onError(errorMsg);
                }
            } catch (IOException e) {
                Log.e(TAG, "User registration error: " + e.getMessage());
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }

    public void shutdown() {
        executor.shutdown();
    }

    public void registerDistributor(JsonObject registrationData, Callback<DistributorRegistrationResponse> callback) {
        executor.execute(() -> {
            try {
                Log.d(TAG, "Sending request to: " + BASE_URL + "/register-distributor");
                Log.d(TAG, "Request body: " + registrationData.toString());

                RequestBody body = RequestBody.create(
                        registrationData.toString(),
                        MediaType.parse("application/json"));

                Request request = addSupabaseHeaders(new Request.Builder())
                        .url(BASE_URL + "/register-distributor")
                        .post(body)
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body().string();

                Log.d(TAG, "Response code: " + response.code());
                Log.d(TAG, "Response body: " + responseBody);

                if (response.isSuccessful()) {
                    JsonObject jsonResponse = gson.fromJson(responseBody, JsonObject.class);

                    DistributorRegistrationResponse regResponse = new DistributorRegistrationResponse();
                    regResponse.success = jsonResponse.get("success").getAsBoolean();
                    regResponse.message = jsonResponse.get("message").getAsString();
                    regResponse.userId = jsonResponse.get("user_id").getAsString();
                    regResponse.distributorName = jsonResponse.get("distributor_name").getAsString();

                    callback.onSuccess(regResponse);
                } else {
                    Log.e(TAG, "Request failed with code: " + response.code());
                    Log.e(TAG, "Error response: " + responseBody);
                    JsonObject error = gson.fromJson(responseBody, JsonObject.class);
                    String errorMsg = error.has("error") ? error.get("error").getAsString() : "Registration failed";
                    callback.onError(errorMsg);
                }
            } catch (Exception e) {
                Log.e(TAG, "Distributor registration error: " + e.getMessage());
                e.printStackTrace();
                callback.onError("Network error: " + e.getMessage());
            }
        });
    }
}
