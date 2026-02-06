package com.pure.gen3firmwareupdater.services;

import android.os.Handler;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.pure.gen3firmwareupdater.DistributorInfo;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Repository for distributor-related Supabase operations.
 * Handles activation code validation and distributor info retrieval.
 */
public class SupabaseDistributorRepository extends SupabaseBaseRepository {

    private static final String TAG = "DistributorRepo";

    public SupabaseDistributorRepository(String supabaseUrl, String supabaseKey,
                                          OkHttpClient httpClient, Gson gson,
                                          Handler mainHandler, ExecutorService executor) {
        super(supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
    }

    /**
     * Validate an activation code against the distributors table.
     * Returns the matching DistributorInfo or an error.
     */
    public void validateActivationCode(String code, Callback<DistributorInfo> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/distributors"
                        + "?activation_code=ilike." + code
                        + "&is_active=eq.true"
                        + "&select=*";

                Log.d(TAG, "validateActivationCode URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "validateActivationCode HTTP " + response.code() + ": " + body);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    postError(callback, "Invalid activation code");
                    return;
                }

                DistributorInfo info = gson.fromJson(array.get(0), DistributorInfo.class);
                postSuccess(callback, info);

            } catch (Exception e) {
                Log.e(TAG, "validateActivationCode error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get distributor information by distributor ID.
     */
    public void getDistributorById(String distributorId, Callback<DistributorInfo> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/distributors"
                        + "?id=eq." + distributorId
                        + "&is_active=eq.true"
                        + "&select=*";

                Log.d(TAG, "getDistributorById URL: " + url);
                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "getDistributorById HTTP " + response.code() + ": " + body);

                if (!response.isSuccessful()) {
                    postError(callback, "Server error: HTTP " + response.code());
                    return;
                }

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                if (array.size() == 0) {
                    postError(callback, "Distributor not found");
                    return;
                }

                DistributorInfo info = gson.fromJson(array.get(0), DistributorInfo.class);
                postSuccess(callback, info);

            } catch (Exception e) {
                Log.e(TAG, "getDistributorById error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }

    /**
     * Get the list of scooter serial numbers assigned to a distributor.
     */
    public void getDistributorScooters(String distributorId, Callback<List<String>> callback) {
        executor.execute(() -> {
            try {
                String url = supabaseUrl + "/rest/v1/scooters"
                        + "?distributor_id=eq." + distributorId
                        + "&select=zyd_serial";

                Request request = buildGetRequest(url);
                Response response = httpClient.newCall(request).execute();
                String body = getResponseBody(response);
                Log.d(TAG, "getDistributorScooters response: " + body);

                JsonArray array = JsonParser.parseString(body).getAsJsonArray();
                List<String> serials = new ArrayList<>();
                for (JsonElement element : array) {
                    serials.add(element.getAsJsonObject().get("zyd_serial").getAsString());
                }

                postSuccess(callback, serials);

            } catch (Exception e) {
                Log.e(TAG, "getDistributorScooters error: " + e.getMessage());
                postError(callback, formatError(e));
            }
        });
    }
}
