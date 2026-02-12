package com.pure.gen3firmwareupdater;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.OkHttpClient;

import com.pure.gen3firmwareupdater.services.SupabaseBaseRepository;
import com.pure.gen3firmwareupdater.services.SupabaseDistributorRepository;
import com.pure.gen3firmwareupdater.services.SupabaseScooterRepository;
import com.pure.gen3firmwareupdater.services.SupabaseFirmwareRepository;
import com.pure.gen3firmwareupdater.services.SupabaseTelemetryRepository;
import com.pure.gen3firmwareupdater.services.SupabaseUserRepository;

/**
 * Facade for all Supabase operations.
 * Delegates to domain-specific repository classes for actual implementation.
 *
 * All existing callers continue to work unchanged via the delegate methods below.
 * New code should prefer accessing the repositories directly via the public fields.
 */
public class SupabaseClient {

    private static final String TAG = "SupabaseClient";

    // Domain repositories - accessible for direct use by new code
    public final SupabaseDistributorRepository distributors;
    public final SupabaseScooterRepository scooters;
    public final SupabaseFirmwareRepository firmware;
    public final SupabaseTelemetryRepository telemetry;
    public final SupabaseUserRepository users;

    /**
     * Generic callback interface for async operations.
     * Delegates to the base repository callback.
     */
    public interface Callback<T> {
        void onSuccess(T result);
        void onError(String error);
    }

    public SupabaseClient(String supabaseUrl, String supabaseKey) {
        // Shared infrastructure
        OkHttpClient httpClient = new OkHttpClient();
        Gson gson = new Gson();
        Handler mainHandler = new Handler(Looper.getMainLooper());
        ExecutorService executor = Executors.newCachedThreadPool();

        // Create repositories with shared infrastructure
        this.distributors = new SupabaseDistributorRepository(
                supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
        this.scooters = new SupabaseScooterRepository(
                supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
        this.firmware = new SupabaseFirmwareRepository(
                supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor, scooters);
        this.telemetry = new SupabaseTelemetryRepository(
                supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor, scooters);
        this.users = new SupabaseUserRepository(
                supabaseUrl, supabaseKey, httpClient, gson, mainHandler, executor);
    }

    // ==================================================================================
    // DELEGATE METHODS - Backward compatibility for existing callers
    // All methods delegate to the appropriate repository.
    // ==================================================================================

    // --- Distributor Operations ---

    public void validateActivationCode(String code, Callback<DistributorInfo> callback) {
        distributors.validateActivationCode(code, wrapCallback(callback));
    }

    public void getDistributorById(String distributorId, Callback<DistributorInfo> callback) {
        distributors.getDistributorById(distributorId, wrapCallback(callback));
    }

    public void getDistributorScooters(String distributorId, Callback<List<String>> callback) {
        distributors.getDistributorScooters(distributorId, wrapCallback(callback));
    }

    // --- Scooter Operations ---

    public void getScooterBySerial(String zydSerial, Callback<JsonObject> callback) {
        scooters.getScooterBySerial(zydSerial, wrapCallback(callback));
    }

    public void getScooterRegistrationStatus(String scooterSerial, Callback<ScooterRegistrationInfo> callback) {
        scooters.getScooterRegistrationStatus(scooterSerial, wrapCallback(callback));
    }

    // --- Firmware Operations ---

    public void getLatestFirmware(String hwVersion, Callback<FirmwareVersion> callback) {
        firmware.getLatestFirmware(hwVersion, wrapCallback(callback));
    }

    public void getAllFirmwareForHardware(String hwVersion, Callback<List<FirmwareVersion>> callback) {
        firmware.getAllFirmwareForHardware(hwVersion, wrapCallback(callback));
    }

    public void downloadFirmwareBinary(String filePath, Callback<byte[]> callback) {
        firmware.downloadFirmwareBinary(filePath, wrapCallback(callback));
    }

    public void createUploadRecord(String scooterId, String firmwareVersionId,
                                    String distributorId, String oldHwVersion,
                                    String oldSwVersion, String newVersion,
                                    Callback<String> callback) {
        firmware.createUploadRecord(scooterId, firmwareVersionId, distributorId,
                oldHwVersion, oldSwVersion, newVersion, wrapCallback(callback));
    }

    public void updateUploadRecord(String recordId, String status, String errorMessage,
                                    Callback<Void> callback) {
        firmware.updateUploadRecord(recordId, status, errorMessage, wrapCallback(callback));
    }

    public void getScooterUpdateHistory(String scooterSerial, String distributorId,
                                        int limit, int offset,
                                        Callback<List<TelemetryRecord>> callback) {
        firmware.getScooterUpdateHistory(scooterSerial, distributorId, limit, offset, wrapCallback(callback));
    }

    // --- Telemetry Operations ---

    public void createScanRecord(String scooterSerial, String distributorId,
                                  String hwVersion, String swVersion,
                                  Callback<String> callback) {
        telemetry.createScanRecord(scooterSerial, distributorId, hwVersion, swVersion, wrapCallback(callback));
    }

    public void createScanRecord(String scooterSerial, String distributorId,
                                  String hwVersion, String swVersion,
                                  RunningDataInfo runningData, BMSDataInfo bmsData,
                                  String embeddedSerial, Callback<String> callback) {
        telemetry.createScanRecord(scooterSerial, distributorId, hwVersion, swVersion,
                runningData, bmsData, embeddedSerial, wrapCallback(callback));
    }

    public void createTelemetryRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion,
                                       RunningDataInfo runningData, BMSDataInfo bmsData,
                                       String embeddedSerial, String scanType,
                                       Callback<String> callback) {
        telemetry.createTelemetryRecord(scooterSerial, distributorId, hwVersion, swVersion,
                runningData, bmsData, embeddedSerial, scanType, wrapCallback(callback));
    }

    public void createTelemetryRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion,
                                       RunningDataInfo runningData, BMSDataInfo bmsData,
                                       String embeddedSerial, String scanType,
                                       VersionInfo versionInfo, String model,
                                       Callback<String> callback) {
        telemetry.createTelemetryRecord(scooterSerial, distributorId, hwVersion, swVersion,
                runningData, bmsData, embeddedSerial, scanType, versionInfo, model,
                wrapCallback(callback));
    }

    public void createTelemetryRecord(String scooterSerial, String distributorId,
                                       String hwVersion, String swVersion,
                                       RunningDataInfo runningData, BMSDataInfo bmsData,
                                       String embeddedSerial, String scanType,
                                       VersionInfo versionInfo, String model,
                                       String recordType,
                                       Callback<String> callback) {
        telemetry.createTelemetryRecord(scooterSerial, distributorId, hwVersion, swVersion,
                runningData, bmsData, embeddedSerial, scanType, versionInfo, model,
                recordType, wrapCallback(callback));
    }

    public void getScooterTelemetry(String scooterSerial, int limit, int offset,
                                     Callback<List<TelemetryRecord>> callback) {
        telemetry.getScooterTelemetry(scooterSerial, limit, offset, wrapCallback(callback));
    }

    // --- User Management Operations ---

    public void searchUsers(String query, String filter, String distributorId,
                             Callback<List<UserInfo>> callback) {
        users.searchUsers(query, filter, distributorId, wrapCallback(callback));
    }

    public void getUserById(String userId, Callback<UserInfo> callback) {
        users.getUserById(userId, wrapCallback(callback));
    }

    public void updateUser(String userId, JsonObject changes, Callback<Void> callback) {
        users.updateUser(userId, changes, wrapCallback(callback));
    }

    public void deactivateUser(String userId, Callback<Void> callback) {
        users.deactivateUser(userId, wrapCallback(callback));
    }

    public void createAuditLogEntry(String userId, String action, JsonObject details,
                                     Callback<Void> callback) {
        users.createAuditLogEntry(userId, action, details, wrapCallback(callback));
    }

    public void getUserAuditLog(String userId, int limit, Callback<List<JsonObject>> callback) {
        users.getUserAuditLog(userId, limit, wrapCallback(callback));
    }

    public void getUserScooters(String userId, Callback<List<String>> callback) {
        users.getUserScooters(userId, wrapCallback(callback));
    }

    // ==================================================================================
    // INFRASTRUCTURE
    // ==================================================================================

    /**
     * Shut down the executor service. Call from activity onDestroy().
     */
    public void shutdown() {
        // All repositories share the same executor, so shutting down any one shuts down all
        distributors.shutdown();
    }

    /**
     * Wraps a SupabaseClient.Callback into a SupabaseBaseRepository.Callback.
     * This adapter bridges the two callback interfaces during the transition period.
     */
    private <T> SupabaseBaseRepository.Callback<T> wrapCallback(Callback<T> callback) {
        return new SupabaseBaseRepository.Callback<T>() {
            @Override
            public void onSuccess(T result) {
                callback.onSuccess(result);
            }

            @Override
            public void onError(String error) {
                callback.onError(error);
            }
        };
    }
}
