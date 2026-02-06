package com.pure.gen3firmwareupdater.services;

import android.util.Log;

import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.BLEManager;
import com.pure.gen3firmwareupdater.BMSDataInfo;
import com.pure.gen3firmwareupdater.DistributorInfo;
import com.pure.gen3firmwareupdater.FirmwareUploader;
import com.pure.gen3firmwareupdater.FirmwareVersion;
import com.pure.gen3firmwareupdater.RunningDataInfo;
import com.pure.gen3firmwareupdater.SupabaseClient;
import com.pure.gen3firmwareupdater.VersionInfo;

import java.util.List;

/**
 * Orchestrates the firmware update business logic:
 * verify scooter → match firmware → download → upload → record result.
 *
 * Extracts all non-UI business logic from FirmwareUpdaterActivity so the
 * Activity becomes a thin UI shell that only handles views and state transitions.
 *
 * Platform note: This class has zero Android UI imports. The FirmwareUpdateListener
 * interface is the portable contract for driving UI updates.
 * A React Native/Flutter bridge implements FirmwareUpdateListener to forward
 * events to the cross-platform layer.
 */
public class FirmwareUpdateOrchestrator implements FirmwareUploader.FirmwareUploadListener {

    private static final String TAG = "FWOrchestrator";

    /**
     * Listener interface for UI updates during the firmware update flow.
     * Activities implement this to drive their state machine.
     */
    public interface FirmwareUpdateListener {
        /** Scooter matched against distributor list and DB lookup succeeded. */
        void onScooterVerified(String scooterId);

        /** Available firmware versions loaded for this hardware. */
        void onFirmwareOptionsLoaded(List<FirmwareVersion> firmwareList, FirmwareVersion recommended);

        /** Firmware binary download has started. */
        void onFirmwareDownloadStarted(String versionLabel);

        /** Firmware binary downloaded successfully. */
        void onFirmwareDownloaded(int byteCount);

        /** Firmware upload has started (BLE transfer beginning). */
        void onUploadStarted();

        /** Firmware upload progress update. */
        void onUploadProgress(int current, int total, int percentage);

        /** Upload log message (for real-time debug display). */
        void onUploadLog(String message, String level);

        /** Firmware upload completed successfully. */
        void onUploadCompleted(String scooterName, String newVersion, String oldVersion);

        /** Firmware upload failed. */
        void onUploadFailed(String error);

        /** A non-fatal error occurred (e.g. scan record creation failed). */
        void onWarning(String message);

        /** A fatal error occurred that stops the flow. */
        void onError(String error);
    }

    // Dependencies
    private final SupabaseClient supabase;
    private final BLEManager bleManager;

    // Listener
    private FirmwareUpdateListener listener;

    // State
    private FirmwareUploader firmwareUploader;
    private String matchedScooterId;
    private FirmwareVersion targetFirmware;
    private byte[] firmwareData;
    private String currentUploadRecordId;

    // Context from connection phase (set by Activity before starting orchestrator)
    private DistributorInfo distributor;
    private String connectedDeviceName;
    private String connectedSerial;
    private VersionInfo scooterVersion;
    private RunningDataInfo scooterRunningData;
    private BMSDataInfo scooterBMSData;
    private String deviceHardwareRevision;

    public FirmwareUpdateOrchestrator(SupabaseClient supabase, BLEManager bleManager) {
        this.supabase = supabase;
        this.bleManager = bleManager;
    }

    public void setListener(FirmwareUpdateListener listener) {
        this.listener = listener;
    }

    // ==================================================================================
    // CONTEXT SETTERS (called by Activity to pass data from connection phase)
    // ==================================================================================

    public void setDistributor(DistributorInfo distributor) {
        this.distributor = distributor;
    }

    public void setConnectionData(String deviceName, String serial,
                                   VersionInfo version, RunningDataInfo runningData,
                                   BMSDataInfo bmsData, String hwRevision) {
        this.connectedDeviceName = deviceName;
        this.connectedSerial = serial;
        this.scooterVersion = version;
        this.scooterRunningData = runningData;
        this.scooterBMSData = bmsData;
        this.deviceHardwareRevision = hwRevision != null ? hwRevision : "";
    }

    // ==================================================================================
    // STATE GETTERS
    // ==================================================================================

    public String getMatchedScooterId() { return matchedScooterId; }
    public FirmwareVersion getTargetFirmware() { return targetFirmware; }
    public void setTargetFirmware(FirmwareVersion fw) { this.targetFirmware = fw; }
    public byte[] getFirmwareData() { return firmwareData; }
    public String getCurrentUploadRecordId() { return currentUploadRecordId; }

    // ==================================================================================
    // VERIFICATION: Match scooter against distributor list + DB
    // ==================================================================================

    /**
     * Verify the connected scooter against the distributor's scooter list,
     * look up its DB record, create a scan record, and fetch available firmware.
     *
     * @param scooterSerials list of ZYD device names registered to this distributor
     * @param distributorId  the distributor's Supabase ID
     */
    public void verifyAndMatchScooter(List<String> scooterSerials, String distributorId) {
        String hwVersionForMatch = scooterVersion.controllerHwVersion;
        String zydName = connectedDeviceName;

        Log.d(TAG, "Matching ZYD name: " + zydName + " against scooter list: " + scooterSerials);

        // Step 1: Verify scooter is in distributor's list
        if (!scooterSerials.contains(zydName)) {
            if (listener != null) {
                listener.onError("Scooter '" + zydName
                        + "' is not registered for this distributor.\n\n"
                        + "BLE Serial: " + connectedSerial);
            }
            return;
        }

        // Create a scan record to track that this scooter was scanned/connected
        if (distributorId != null) {
            String embeddedSerial = (scooterVersion.embeddedSerialNumber != null)
                    ? scooterVersion.embeddedSerialNumber : null;
            supabase.createScanRecord(zydName, distributorId, hwVersionForMatch,
                    scooterVersion.controllerSwVersion, scooterRunningData, scooterBMSData,
                    embeddedSerial, new SupabaseClient.Callback<String>() {
                        @Override
                        public void onSuccess(String recordId) {
                            Log.d(TAG, "Scan record created with telemetry: " + recordId);
                        }

                        @Override
                        public void onError(String error) {
                            Log.w(TAG, "Failed to create scan record: " + error);
                            if (listener != null) listener.onWarning("Scan record creation failed: " + error);
                        }
                    });
        }

        // Step 2: Get scooter ID from database using the ZYD device name
        final String hwVersion = hwVersionForMatch;
        supabase.getScooterBySerial(zydName, new SupabaseClient.Callback<JsonObject>() {
            @Override
            public void onSuccess(JsonObject scooterObj) {
                matchedScooterId = scooterObj.get("id").getAsString();
                if (listener != null) listener.onScooterVerified(matchedScooterId);

                // Step 3: Load available firmware for this hardware
                loadFirmwareOptions(hwVersion);
            }

            @Override
            public void onError(String error) {
                if (listener != null) listener.onError("Scooter not found in database: " + error);
            }
        });
    }

    /**
     * Load all available firmware versions for a given hardware version.
     */
    public void loadFirmwareOptions(String hwVersion) {
        supabase.getAllFirmwareForHardware(hwVersion,
                new SupabaseClient.Callback<List<FirmwareVersion>>() {
                    @Override
                    public void onSuccess(List<FirmwareVersion> firmwareList) {
                        if (firmwareList.isEmpty()) {
                            if (listener != null) {
                                listener.onError("No compatible firmware found for HW " + hwVersion);
                            }
                            return;
                        }

                        // Use the first (latest) firmware as recommended
                        FirmwareVersion recommended = firmwareList.get(0);
                        targetFirmware = recommended;

                        if (listener != null) {
                            listener.onFirmwareOptionsLoaded(firmwareList, recommended);
                        }
                    }

                    @Override
                    public void onError(String error) {
                        if (listener != null) {
                            listener.onError("No compatible firmware found: " + error);
                        }
                    }
                });
    }

    // ==================================================================================
    // FIRMWARE DOWNLOAD + UPLOAD
    // ==================================================================================

    /**
     * Download the target firmware binary and start the BLE upload.
     * Call after user selects a firmware version.
     */
    public void downloadAndInstall() {
        if (targetFirmware == null) {
            if (listener != null) listener.onError("No firmware selected");
            return;
        }

        if (listener != null) listener.onFirmwareDownloadStarted(targetFirmware.version_label);

        supabase.downloadFirmwareBinary(targetFirmware.file_path, new SupabaseClient.Callback<byte[]>() {
            @Override
            public void onSuccess(byte[] data) {
                firmwareData = data;
                Log.d(TAG, "Firmware downloaded: " + data.length + " bytes");
                if (listener != null) listener.onFirmwareDownloaded(data.length);
                startFirmwareUpload();
            }

            @Override
            public void onError(String error) {
                if (listener != null) listener.onError("Firmware download failed: " + error);
            }
        });
    }

    /**
     * Start the BLE firmware upload after download.
     * Creates an upload record in the database, then starts the FirmwareUploader.
     */
    private void startFirmwareUpload() {
        // Create upload record in database
        String hwForRecord = (deviceHardwareRevision != null && !deviceHardwareRevision.isEmpty())
                ? deviceHardwareRevision : scooterVersion.controllerHwVersion;
        String swForRecord = scooterVersion.controllerSwVersion;

        supabase.createUploadRecord(
                matchedScooterId,
                targetFirmware.id,
                distributor.id,
                hwForRecord,
                swForRecord,
                targetFirmware.version_label,
                new SupabaseClient.Callback<String>() {
                    @Override
                    public void onSuccess(String recordId) {
                        currentUploadRecordId = recordId;
                        beginBLEUpload();
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Failed to create upload record: " + error);
                        // Proceed anyway — upload is more important than logging
                        currentUploadRecordId = null;
                        beginBLEUpload();
                    }
                });
    }

    private void beginBLEUpload() {
        firmwareUploader = new FirmwareUploader(bleManager, this);
        firmwareUploader.startUpload(firmwareData);
    }

    /**
     * Abort a running firmware upload.
     */
    public void abortUpload() {
        if (firmwareUploader != null) {
            firmwareUploader.cancelUpload();
        }
    }

    // ==================================================================================
    // FirmwareUploader.FirmwareUploadListener IMPLEMENTATION
    // ==================================================================================

    @Override
    public void onUploadStarted() {
        Log.d(TAG, "Upload started");
        if (listener != null) listener.onUploadStarted();
    }

    @Override
    public void onUploadProgress(int current, int total, int percentage) {
        if (listener != null) listener.onUploadProgress(current, total, percentage);
    }

    @Override
    public void onUploadCompleted() {
        Log.d(TAG, "Upload completed");

        // Update database record
        if (currentUploadRecordId != null) {
            supabase.updateUploadRecord(currentUploadRecordId, "completed", null,
                    new SupabaseClient.Callback<Void>() {
                        @Override
                        public void onSuccess(Void result) {
                            Log.d(TAG, "Upload record updated to completed");
                        }

                        @Override
                        public void onError(String error) {
                            Log.w(TAG, "Failed to update upload record: " + error);
                        }
                    });
        }

        if (listener != null) {
            listener.onUploadCompleted(
                    connectedDeviceName,
                    targetFirmware.version_label,
                    scooterVersion.controllerSwVersion);
        }
    }

    @Override
    public void onUploadFailed(String error) {
        Log.e(TAG, "Upload failed: " + error);

        // Update database record
        if (currentUploadRecordId != null) {
            supabase.updateUploadRecord(currentUploadRecordId, "failed", error,
                    new SupabaseClient.Callback<Void>() {
                        @Override
                        public void onSuccess(Void result) {
                            Log.d(TAG, "Upload record updated to failed");
                        }

                        @Override
                        public void onError(String e) {
                            Log.w(TAG, "Failed to update upload record: " + e);
                        }
                    });
        }

        if (listener != null) listener.onUploadFailed(error);
    }

    @Override
    public void onUploadLog(String message, String level) {
        if (listener != null) listener.onUploadLog(message, level);
    }

    // ==================================================================================
    // UTILITIES
    // ==================================================================================

    /**
     * Extract the version part from hardware revision string.
     * e.g. "HW9073_V2.92" → "V2.92", "V2.92" → "V2.92"
     * If no underscore, returns the whole string.
     *
     * Platform-independent utility.
     */
    public static String extractHwVersion(String hwRevision) {
        if (hwRevision == null || hwRevision.isEmpty()) return "";
        int underscoreIdx = hwRevision.lastIndexOf('_');
        if (underscoreIdx >= 0 && underscoreIdx < hwRevision.length() - 1) {
            return hwRevision.substring(underscoreIdx + 1);
        }
        return hwRevision;
    }

    /**
     * Reset state for a new firmware update cycle.
     */
    public void reset() {
        matchedScooterId = null;
        targetFirmware = null;
        firmwareData = null;
        currentUploadRecordId = null;
        firmwareUploader = null;
    }
}
