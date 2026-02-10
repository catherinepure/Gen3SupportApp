package com.pure.gen3firmwareupdater.services;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.le.ScanResult;
import android.os.Handler;
import android.util.Log;

import com.pure.gen3firmwareupdater.BLEListener;
import com.pure.gen3firmwareupdater.BLEManager;
import com.pure.gen3firmwareupdater.BMSDataInfo;
import com.pure.gen3firmwareupdater.ConfigInfo;
import com.pure.gen3firmwareupdater.RunningDataInfo;
import com.pure.gen3firmwareupdater.VersionInfo;
import com.pure.gen3firmwareupdater.VersionRequestHelper;

import java.util.List;

/**
 * Orchestrates the BLE scan -> connect -> identify -> collect telemetry flow.
 *
 * Wraps BLEManager, PacketRouter, and VersionRequestHelper into a single
 * cohesive service. Activities implement ConnectionListener for UI callbacks
 * instead of implementing BLEListener directly.
 *
 * This eliminates the BLE callback duplication between FirmwareUpdaterActivity
 * and ScanScooterActivity.
 *
 * Platform note: The ConnectionListener interface is the portable contract.
 * A React Native/Flutter bridge would implement ConnectionListener to forward
 * events to the cross-platform layer.
 */
public class ScooterConnectionService implements BLEListener, PacketRouter.PacketListener {

    private static final String TAG = "ScooterConnection";

    /**
     * Listener interface for activities to receive connection events.
     * Higher-level than BLEListener - translates raw BLE events into
     * application-meaningful events.
     */
    public interface ConnectionListener {
        /** BLE scan has started. */
        void onScanStarted();

        /** BLE scan completed with a list of discovered devices. */
        void onDevicesFound(List<ScanResult> devices);

        /** BLE scan failed. */
        void onScanFailed(String error);

        /** Connecting to a device. */
        void onConnecting(String deviceName);

        /** Successfully connected and serial number read. */
        void onConnected(String deviceName, String serialNumber);

        /** Device info characteristics read (hardware revision, etc.). */
        void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                              String modelNumber, String manufacturer);

        /** Version info packet (B0) parsed successfully. */
        void onVersionReceived(VersionInfo version);

        /** Telemetry data collected (A0 running data). */
        void onRunningDataReceived(RunningDataInfo data);

        /** BMS battery data collected (A1 packet). */
        void onBMSDataReceived(BMSDataInfo data);

        /** Config data collected (0x01 packet). */
        void onConfigReceived(ConfigInfo config);

        /** Connection status text update. */
        void onStatusChanged(String status);

        /** Device disconnected. */
        void onDisconnected(boolean wasExpected);

        /** Connection attempt failed. */
        void onConnectionFailed(String error);

        /** Version request timed out after retries. */
        void onVersionRequestTimeout();

        /** Raw data received - for debug logging purposes. */
        void onRawDataReceived(byte[] data);

        /** A command was sent to the device. */
        void onCommandSent(boolean success, String message);
    }

    // Dependencies
    private final BLEManager bleManager;
    private final PacketRouter packetRouter;
    private final Handler handler;

    // Listener
    private ConnectionListener listener;

    // State
    private VersionRequestHelper versionRequestHelper;
    private VersionInfo scooterVersion;
    private ConfigInfo scooterConfig;
    private RunningDataInfo scooterRunningData;
    private BMSDataInfo scooterBMSData;
    private String connectedDeviceName = "";
    private String connectedSerial = "";
    private String deviceHardwareRevision = "";
    private boolean isConnected = false;

    /**
     * Create a ScooterConnectionService.
     *
     * @param bleManager the BLE manager (Activity must still create this as it needs Context)
     * @param handler main thread handler for version request timing
     */
    public ScooterConnectionService(BLEManager bleManager, Handler handler) {
        this.bleManager = bleManager;
        this.handler = handler;
        this.packetRouter = new PacketRouter(this);
    }

    public void setListener(ConnectionListener listener) {
        this.listener = listener;
    }

    // ==================================================================================
    // PUBLIC API
    // ==================================================================================

    /** Start scanning for BLE devices. */
    public void startScan() {
        resetConnectionState();
        bleManager.startScanning();
    }

    /** Connect to a specific BLE device. */
    public void connectToDevice(BluetoothDevice device) {
        connectedDeviceName = device.getName() != null ? device.getName() : "ZYD Device";
        if (listener != null) listener.onConnecting(connectedDeviceName);
        bleManager.connectToDevice(device);
    }

    /** Disconnect from the current device. */
    public void disconnect() {
        if (bleManager != null) {
            bleManager.disconnect();
        }
    }

    /** Check if Bluetooth is available and enabled. */
    public boolean isBluetoothAvailable() {
        return bleManager.isBluetoothAvailable();
    }

    /** Clean up BLE resources. Call from Activity onDestroy(). */
    public void cleanup() {
        if (versionRequestHelper != null) {
            versionRequestHelper.cancel();
        }
        if (bleManager != null) {
            bleManager.cleanup();
        }
    }

    /** Get the underlying BLEManager (needed by FirmwareUploader). */
    public BLEManager getBLEManager() {
        return bleManager;
    }

    /** Get the PacketRouter (for activities that need to register additional listeners). */
    public PacketRouter getPacketRouter() {
        return packetRouter;
    }

    // ==================================================================================
    // STATE GETTERS
    // ==================================================================================

    public VersionInfo getScooterVersion() { return scooterVersion; }
    public ConfigInfo getScooterConfig() { return scooterConfig; }
    public RunningDataInfo getRunningData() { return scooterRunningData; }
    public BMSDataInfo getBMSData() { return scooterBMSData; }
    public String getConnectedDeviceName() { return connectedDeviceName; }
    public String getConnectedSerial() { return connectedSerial; }
    public String getDeviceHardwareRevision() { return deviceHardwareRevision; }
    public boolean isConnected() { return isConnected; }

    // ==================================================================================
    // BLEListener IMPLEMENTATION (receives raw BLE events from BLEManager)
    // ==================================================================================

    @Override
    public void onScanStarted() {
        Log.d(TAG, "Scan started");
        if (listener != null) listener.onScanStarted();
    }

    @Override
    public void onScanCompleted(List<ScanResult> devices) {
        Log.d(TAG, "Scan completed, found " + devices.size() + " devices");
        if (listener != null) listener.onDevicesFound(devices);
    }

    @Override
    public void onScanFailed(String error) {
        Log.e(TAG, "Scan failed: " + error);
        if (listener != null) listener.onScanFailed(error);
    }

    @Override
    public void onDeviceConnected(String deviceName, String address, String serialNumber) {
        Log.d(TAG, "Connected: " + deviceName + " serial: " + serialNumber);
        isConnected = true;
        if (deviceName != null && !deviceName.isEmpty()) {
            connectedDeviceName = deviceName;
        }
        if (listener != null) listener.onConnected(connectedDeviceName, serialNumber);
    }

    @Override
    public void onSerialNumberRead(String serialNumber) {
        Log.d(TAG, "Serial number (2A25): " + serialNumber + ", ZYD name: " + connectedDeviceName);
        if (serialNumber != null && !serialNumber.isEmpty()) {
            connectedSerial = serialNumber;
        }
        // Start version request after serial number is read
        handler.postDelayed(this::sendVersionRequest, 1000);
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                  String modelNumber, String manufacturer) {
        Log.d(TAG, "Device Info: hwRev='" + hardwareRevision + "' fwRev='" + firmwareRevision
                + "' model='" + modelNumber + "' mfr='" + manufacturer + "'");
        deviceHardwareRevision = hardwareRevision != null ? hardwareRevision : "";
        if (listener != null) listener.onDeviceInfoRead(hardwareRevision, firmwareRevision,
                modelNumber, manufacturer);
    }

    @Override
    public void onDeviceDisconnected(boolean wasExpected) {
        Log.d(TAG, "Disconnected (expected=" + wasExpected + ")");
        isConnected = false;
        if (listener != null) listener.onDisconnected(wasExpected);
    }

    @Override
    public void onConnectionFailed(String error) {
        Log.e(TAG, "Connection failed: " + error);
        isConnected = false;
        if (listener != null) listener.onConnectionFailed(error);
    }

    @Override
    public void onConnectionStatusChanged(String status) {
        Log.d(TAG, "Connection status: " + status);
        if (listener != null) listener.onStatusChanged(status);
    }

    @Override
    public void onDataReceived(byte[] data) {
        if (data == null || data.length < 2) return;

        // Forward raw data to listener for debug logging
        if (listener != null) listener.onRawDataReceived(data);

        // Cancel version request retry on B0 packet
        int packetType = data[1] & 0xFF;
        if (packetType == 0xB0 && versionRequestHelper != null) {
            versionRequestHelper.cancel();
        }

        // Dispatch to PacketRouter for parsing
        packetRouter.routePacket(data);
    }

    @Override
    public void onCommandSent(boolean success, String message) {
        if (listener != null) listener.onCommandSent(success, message);
    }

    // ==================================================================================
    // PacketRouter.PacketListener IMPLEMENTATION (receives parsed packet data)
    // ==================================================================================

    @Override
    public void onVersionInfo(VersionInfo version) {
        Log.d(TAG, "Version info parsed: " + version);
        scooterVersion = version;
        if (listener != null) listener.onVersionReceived(version);
    }

    @Override
    public void onConfigInfo(ConfigInfo config) {
        Log.d(TAG, "Config info parsed: " + config);
        scooterConfig = config;
        if (listener != null) listener.onConfigReceived(config);
    }

    @Override
    public void onRunningData(RunningDataInfo data) {
        Log.d(TAG, "Running data parsed");
        scooterRunningData = data;
        // Cross-populate voltage/current/battery from BMS if already received
        if (scooterBMSData != null) {
            data.populateFromBMS(scooterBMSData);
        }
        if (listener != null) listener.onRunningDataReceived(data);
    }

    @Override
    public void onBMSData(BMSDataInfo data) {
        Log.d(TAG, "BMS data parsed");
        scooterBMSData = data;
        // Cross-populate voltage/current/battery into running data if already received
        if (scooterRunningData != null) {
            scooterRunningData.populateFromBMS(data);
        }
        if (listener != null) listener.onBMSDataReceived(data);
    }

    @Override
    public void onUnknownPacket(int packetType, byte[] data) {
        // Not forwarded - already logged in onRawDataReceived
    }

    // ==================================================================================
    // INTERNAL HELPERS
    // ==================================================================================

    private void sendVersionRequest() {
        if (scooterVersion != null) return;
        if (versionRequestHelper == null) {
            versionRequestHelper = new VersionRequestHelper(bleManager, handler,
                    () -> scooterVersion == null && isConnected);
            versionRequestHelper.setListener(() -> {
                if (listener != null) listener.onVersionRequestTimeout();
            });
        }
        versionRequestHelper.start();
    }

    private void resetConnectionState() {
        scooterVersion = null;
        scooterConfig = null;
        scooterRunningData = null;
        scooterBMSData = null;
        connectedDeviceName = "";
        connectedSerial = "";
        deviceHardwareRevision = "";
        isConnected = false;
        if (versionRequestHelper != null) {
            versionRequestHelper.cancel();
            versionRequestHelper = null;
        }
    }
}
