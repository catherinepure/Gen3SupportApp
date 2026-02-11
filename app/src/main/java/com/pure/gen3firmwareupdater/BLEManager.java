package com.pure.gen3firmwareupdater;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.core.app.ActivityCompat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Simplified BLE connection manager for firmware upload only.
 * Stripped from Gen3Telemetry's BLEConnectionManager — no auto-connect,
 * no telemetry requests, no AT command service.
 */
public class BLEManager {

    private static final String TAG = "BLEManager";

    // Main data exchange service
    private static final String MAIN_SERVICE_UUID = "0000fff0-0000-1000-8000-00805f9b34fb";
    private static final String CONTROL_UUID = "0000fff1-0000-1000-8000-00805f9b34fb";
    private static final String NOTIFY_UUID = "0000fff2-0000-1000-8000-00805f9b34fb";

    // Device Information Service
    private static final String DEVICE_INFO_SERVICE_UUID = "0000180A-0000-1000-8000-00805F9B34FB";
    private static final String MODEL_NUMBER_UUID     = "00002A24-0000-1000-8000-00805F9B34FB";
    private static final String SERIAL_NUMBER_UUID    = "00002A25-0000-1000-8000-00805F9B34FB";
    private static final String FIRMWARE_REV_UUID     = "00002A26-0000-1000-8000-00805F9B34FB";
    private static final String HARDWARE_REV_UUID     = "00002A27-0000-1000-8000-00805F9B34FB";
    private static final String SOFTWARE_REV_UUID     = "00002A28-0000-1000-8000-00805F9B34FB";
    private static final String MANUFACTURER_UUID     = "00002A29-0000-1000-8000-00805F9B34FB";

    // Notification descriptor UUID
    private static final String CLIENT_CHARACTERISTIC_CONFIG_UUID = "00002902-0000-1000-8000-00805f9b34fb";

    // Protocol packet type for version info request
    private static final int PACKET_VERSION_INFO = 0xB0;

    // Protocol header byte — standard is 0xF0, some devices use 0xAB
    private int protocolHeader = 0xF0;

    // State
    private Context context;
    private BLEListener listener;
    private FirmwareNotificationHandler firmwareNotificationHandler;

    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bleScanner;
    private BluetoothGatt bluetoothGatt;
    private BluetoothGattCharacteristic controlCharacteristic;
    private BluetoothGattCharacteristic notifyCharacteristic;

    private boolean isConnected = false;
    private boolean isScanning = false;
    private String deviceSerialNumber = "";
    private String deviceModelNumber = "";
    private String deviceHardwareRevision = "";
    private String deviceFirmwareRevision = "";
    private String deviceSoftwareRevision = "";
    private String deviceManufacturer = "";
    private List<ScanResult> discoveredDevices = new ArrayList<>();

    // Queue for reading multiple Device Info characteristics sequentially
    private List<String> deviceInfoReadQueue = new ArrayList<>();

    // Synchronization for BLE write completion (used by writeRawBytesAndWait)
    private volatile CountDownLatch writeLatch;

    // Negotiated MTU (default 23; usable payload = MTU - 3)
    private int negotiatedMtu = 23;

    @FunctionalInterface
    public interface FirmwareNotificationHandler {
        void onFirmwareResponse(byte[] data);
    }

    public void setFirmwareNotificationHandler(FirmwareNotificationHandler handler) {
        this.firmwareNotificationHandler = handler;
        Log.d(TAG, "Firmware notification handler " + (handler != null ? "SET" : "CLEARED"));
    }

    public boolean isFirmwareUploadActive() {
        return firmwareNotificationHandler != null;
    }

    // ==================================================================================
    // CONSTRUCTOR
    // ==================================================================================

    public BLEManager(Context context, BLEListener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
        initializeBluetooth();
    }

    /**
     * Set or replace the BLE listener.
     * Used by ScooterConnectionService to intercept BLE callbacks.
     */
    public void setListener(BLEListener listener) {
        this.listener = listener;
    }

    private void initializeBluetooth() {
        BluetoothManager bluetoothManager =
                (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        bluetoothAdapter = bluetoothManager.getAdapter();
        if (bluetoothAdapter != null) {
            bleScanner = bluetoothAdapter.getBluetoothLeScanner();
            Log.d(TAG, "Bluetooth initialized");
        } else {
            Log.e(TAG, "Bluetooth not available");
        }
    }

    // ==================================================================================
    // SCANNING
    // ==================================================================================

    public void startScanning() {
        if (bleScanner == null) {
            listener.onScanFailed("Bluetooth not available");
            return;
        }

        discoveredDevices.clear();
        isScanning = true;
        listener.onScanStarted();
        Log.d(TAG, "Starting BLE scan for ZYD devices...");

        ScanSettings settings = new ScanSettings.Builder()
                .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
                .build();

        bleScanner.startScan(null, settings, scanCallback);

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (bleScanner != null && isScanning) {
                bleScanner.stopScan(scanCallback);
                isScanning = false;
                Log.d(TAG, "Scan completed - found " + discoveredDevices.size() + " ZYD devices");
                listener.onScanCompleted(discoveredDevices);
            }
        }, 3000);
    }

    private ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            String deviceName = device.getName();
            int rssi = result.getRssi();

            if (deviceName != null && deviceName.startsWith("ZYD")) {
                boolean found = false;
                for (int i = 0; i < discoveredDevices.size(); i++) {
                    if (discoveredDevices.get(i).getDevice().getAddress().equals(device.getAddress())) {
                        if (rssi > discoveredDevices.get(i).getRssi()) {
                            discoveredDevices.set(i, result);
                        }
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    discoveredDevices.add(result);
                    Log.d(TAG, "Found ZYD device: " + deviceName + " RSSI: " + rssi);
                }
            }
        }

        @Override
        public void onScanFailed(int errorCode) {
            Log.e(TAG, "BLE scan failed: " + errorCode);
            isScanning = false;
            listener.onScanFailed("Scan failed: " + errorCode);
        }
    };

    // ==================================================================================
    // CONNECTION
    // ==================================================================================

    public void connectToDevice(BluetoothDevice device) {
        if (device == null) {
            listener.onConnectionFailed("Device is null");
            return;
        }
        if (isConnected) {
            Log.d(TAG, "Already connected");
            return;
        }

        Log.d(TAG, "Connecting to: " + device.getName() + " (" + device.getAddress() + ")");

        if (ActivityCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            listener.onConnectionFailed("Missing Bluetooth permission");
            return;
        }

        bluetoothGatt = device.connectGatt(context, false, gattCallback);
        if (bluetoothGatt == null) {
            listener.onConnectionFailed("Failed to create GATT connection");
        }
    }

    private BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                isConnected = true;
                listener.onConnectionStatusChanged("Connected - Requesting MTU...");
                Log.d(TAG, "Connected to GATT server, requesting MTU 512");
                // Request large MTU so firmware D2 packets (136 bytes) fit in a single write.
                // onMtuChanged will trigger service discovery.
                boolean mtuRequested = bluetoothGatt.requestMtu(512);
                if (!mtuRequested) {
                    Log.w(TAG, "MTU request failed, proceeding with default MTU");
                    bluetoothGatt.discoverServices();
                }

            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.d(TAG, "Disconnected from GATT server");
                boolean wasExpected = !isConnected;
                forceDisconnectCleanup();
                listener.onDeviceDisconnected(wasExpected);
            }
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                negotiatedMtu = mtu;
                Log.d(TAG, "MTU negotiated: " + mtu + " (usable payload: " + (mtu - 3) + " bytes)");
            } else {
                Log.w(TAG, "MTU negotiation failed (status=" + status + "), using default");
            }
            // Proceed with service discovery regardless of MTU result
            listener.onConnectionStatusChanged("Connected - Discovering services...");
            bluetoothGatt.discoverServices();
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.d(TAG, "Services discovered");
                setupCharacteristics();
            } else {
                listener.onConnectionFailed("Service discovery failed: " + status);
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt,
                                            BluetoothGattCharacteristic characteristic) {
            byte[] rawData = characteristic.getValue();
            if (rawData != null && rawData.length > 0) {
                Log.d(TAG, "Raw BLE data: " + bytesToHex(rawData));

                int header = rawData[0] & 0xFF;

                // Auto-detect protocol header: some devices use 0xAB instead of 0xF0.
                if (header == 0xAB && protocolHeader != 0xAB) {
                    Log.d(TAG, "Detected 0xAB protocol header — switching to 0xAB mode");
                    protocolHeader = 0xAB;
                }

                byte[] data = rawData;

                // Check for firmware responses first — match protocol header + D0-D3 command
                if (firmwareNotificationHandler != null && data.length >= 2) {
                    boolean isFirmwareResponse = (header == 0xF0 || header == 0xAB) &&
                            (data[1] == (byte) 0xD0 || data[1] == (byte) 0xD1 ||
                             data[1] == (byte) 0xD2 || data[1] == (byte) 0xD3);

                    if (isFirmwareResponse) {
                        Log.d(TAG, "Firmware response detected: " + bytesToHex(data));
                        firmwareNotificationHandler.onFirmwareResponse(data);
                        return;
                    }
                }

                // Forward decrypted data to listener
                listener.onDataReceived(data);
            }
        }

        @Override
        public void onCharacteristicRead(BluetoothGatt gatt,
                                         BluetoothGattCharacteristic characteristic, int status) {
            if (characteristic == null) {
                Log.w(TAG, "onCharacteristicRead: characteristic is null, skipping");
                readNextDeviceInfoCharacteristic();
                return;
            }

            if (status == BluetoothGatt.GATT_SUCCESS) {
                byte[] data = characteristic.getValue();
                String uuid = characteristic.getUuid().toString().toUpperCase();
                String value = (data != null) ? new String(data).trim() : "";
                Log.d(TAG, "CharRead " + uuid.substring(4, 8) + " = '" + value + "'");

                if (uuid.contains("2A25")) {
                    deviceSerialNumber = value;
                } else if (uuid.contains("2A24")) {
                    deviceModelNumber = value;
                } else if (uuid.contains("2A27")) {
                    deviceHardwareRevision = value;
                } else if (uuid.contains("2A26")) {
                    deviceFirmwareRevision = value;
                } else if (uuid.contains("2A28")) {
                    deviceSoftwareRevision = value;
                } else if (uuid.contains("2A29")) {
                    deviceManufacturer = value;
                }
            } else {
                String uuid = characteristic.getUuid().toString().toUpperCase();
                Log.w(TAG, "CharRead failed " + uuid.substring(4, 8) + " status=" + status);
            }

            // Continue reading the next characteristic in the queue
            readNextDeviceInfoCharacteristic();
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt,
                                          BluetoothGattCharacteristic characteristic, int status) {
            // Signal any waiting write latch (used by writeRawBytesAndWait)
            if (writeLatch != null) {
                writeLatch.countDown();
            }
            if (status == BluetoothGatt.GATT_SUCCESS) {
                listener.onCommandSent(true, "Command sent");
            } else {
                listener.onCommandSent(false, "Write failed: " + status);
            }
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt,
                                      BluetoothGattDescriptor descriptor, int status) {
            continueSetupAfterNotifications();
        }
    };

    // ==================================================================================
    // CHARACTERISTIC SETUP
    // ==================================================================================

    private void setupCharacteristics() {
        try {
            BluetoothGattService mainService =
                    bluetoothGatt.getService(UUID.fromString(MAIN_SERVICE_UUID));

            if (mainService != null) {
                controlCharacteristic =
                        mainService.getCharacteristic(UUID.fromString(CONTROL_UUID));
                notifyCharacteristic =
                        mainService.getCharacteristic(UUID.fromString(NOTIFY_UUID));

                if (controlCharacteristic != null && notifyCharacteristic != null) {
                    int props = controlCharacteristic.getProperties();
                    int writeType = controlCharacteristic.getWriteType();
                    Log.d(TAG, "FFF1 properties=0x" + String.format("%02X", props)
                            + " writeType=" + writeType
                            + " (WRITE=" + ((props & BluetoothGattCharacteristic.PROPERTY_WRITE) != 0)
                            + " WRITE_NO_RSP=" + ((props & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0) + ")");
                    boolean notifEnabled =
                            bluetoothGatt.setCharacteristicNotification(notifyCharacteristic, true);

                    if (notifEnabled) {
                        BluetoothGattDescriptor descriptor = notifyCharacteristic.getDescriptor(
                                UUID.fromString(CLIENT_CHARACTERISTIC_CONFIG_UUID));
                        if (descriptor != null) {
                            descriptor.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                            bluetoothGatt.writeDescriptor(descriptor);
                        } else {
                            continueSetupAfterNotifications();
                        }
                    } else {
                        continueSetupAfterNotifications();
                    }
                } else {
                    listener.onConnectionFailed("Required characteristics not found");
                }
            } else {
                listener.onConnectionFailed("Main service not found");
            }
        } catch (Exception e) {
            listener.onConnectionFailed("Setup error: " + e.getMessage());
        }
    }

    private void continueSetupAfterNotifications() {
        new Handler(Looper.getMainLooper()).postDelayed(this::readDeviceInformation, 500);
    }

    private void readDeviceInformation() {
        try {
            BluetoothGattService deviceInfoService =
                    bluetoothGatt.getService(UUID.fromString(DEVICE_INFO_SERVICE_UUID));

            if (deviceInfoService == null) {
                Log.w(TAG, "Device Information Service (180A) not found");
                completeConnectionSetupWithoutSerial();
                return;
            }

            // Build a queue of all characteristics to read
            deviceInfoReadQueue.clear();
            String[] uuids = { SERIAL_NUMBER_UUID, MODEL_NUMBER_UUID, HARDWARE_REV_UUID,
                               FIRMWARE_REV_UUID, SOFTWARE_REV_UUID, MANUFACTURER_UUID };
            for (String uuid : uuids) {
                BluetoothGattCharacteristic c =
                        deviceInfoService.getCharacteristic(UUID.fromString(uuid));
                if (c != null) {
                    deviceInfoReadQueue.add(uuid);
                }
            }

            if (deviceInfoReadQueue.isEmpty()) {
                Log.w(TAG, "No Device Info characteristics found");
                completeConnectionSetupWithoutSerial();
                return;
            }

            Log.d(TAG, "Reading " + deviceInfoReadQueue.size() + " Device Info characteristics");
            readNextDeviceInfoCharacteristic();

        } catch (Exception e) {
            Log.e(TAG, "Error reading device info: " + e.getMessage());
            completeConnectionSetupWithoutSerial();
        }
    }

    private void readNextDeviceInfoCharacteristic() {
        if (deviceInfoReadQueue.isEmpty()) {
            // All done — report results
            Log.d(TAG, "Device Info complete: SN='" + deviceSerialNumber
                    + "' model='" + deviceModelNumber
                    + "' hwRev='" + deviceHardwareRevision
                    + "' fwRev='" + deviceFirmwareRevision
                    + "' swRev='" + deviceSoftwareRevision
                    + "' mfr='" + deviceManufacturer + "'");

            // Notify listener of all device info
            listener.onDeviceInfoRead(deviceHardwareRevision, deviceFirmwareRevision,
                    deviceModelNumber, deviceManufacturer);

            if (deviceSerialNumber != null && !deviceSerialNumber.isEmpty()) {
                listener.onSerialNumberRead(deviceSerialNumber);
                completeConnectionSetup();
            } else {
                completeConnectionSetupWithoutSerial();
            }
            return;
        }

        String uuid = deviceInfoReadQueue.remove(0);
        try {
            BluetoothGattService svc =
                    bluetoothGatt.getService(UUID.fromString(DEVICE_INFO_SERVICE_UUID));
            BluetoothGattCharacteristic c =
                    svc.getCharacteristic(UUID.fromString(uuid));

            if (c != null) {
                boolean success = bluetoothGatt.readCharacteristic(c);
                Log.d(TAG, "readCharacteristic(" + uuid.substring(4, 8) + ") = " + success);
                if (!success) {
                    // Skip this one, try next
                    readNextDeviceInfoCharacteristic();
                }
            } else {
                readNextDeviceInfoCharacteristic();
            }
        } catch (Exception e) {
            Log.e(TAG, "Error reading " + uuid + ": " + e.getMessage());
            readNextDeviceInfoCharacteristic();
        }
    }

    private void completeConnectionSetupWithoutSerial() {
        deviceSerialNumber = "";
        // Pass the BLE device name so the activity can use it as fallback SN
        String name = bluetoothGatt != null && bluetoothGatt.getDevice() != null
                ? bluetoothGatt.getDevice().getName() : "";
        Log.d(TAG, "No serial number from 2A25, BLE device name: " + name);
        listener.onSerialNumberRead("");
        listener.onDeviceConnected(name != null ? name : "Unknown",
                bluetoothGatt != null && bluetoothGatt.getDevice() != null
                        ? bluetoothGatt.getDevice().getAddress() : "", "");
    }

    private void completeConnectionSetup() {
        listener.onConnectionStatusChanged("Connected");
        String address = bluetoothGatt != null && bluetoothGatt.getDevice() != null
                ? bluetoothGatt.getDevice().getAddress() : "";
        String name = bluetoothGatt != null && bluetoothGatt.getDevice() != null
                ? bluetoothGatt.getDevice().getName() : "ZYD Device";
        listener.onDeviceConnected(name != null ? name : "ZYD Device", address, deviceSerialNumber);
    }

    // ==================================================================================
    // COMMANDS
    // ==================================================================================

    /** Request running data (0xA0 packet) to wake up the protocol. */
    public boolean requestRunningData() {
        byte[] packet = createCommand(0xA0);
        boolean success = sendCommand(packet);
        Log.d(TAG, "Sent running data request: " + bytesToHex(packet) + " success=" + success);
        return success;
    }

    /** Request version info (0xB0 packet) from the scooter. */
    public boolean requestVersionInfo() {
        byte[] packet = createCommand(PACKET_VERSION_INFO);
        boolean success = sendCommand(packet);
        Log.d(TAG, "Sent version info request: " + bytesToHex(packet) + " success=" + success);
        return success;
    }

    /** Request BMS data (0xA1 packet) from the scooter. */
    public boolean requestBMSData() {
        byte[] packet = createCommand(0xA1);
        boolean success = sendCommand(packet);
        Log.d(TAG, "Sent BMS data request: " + bytesToHex(packet) + " success=" + success);
        return success;
    }

    /** Create a 5-byte command packet with header, type, length and CRC16. */
    private byte[] createCommand(int packetType) {
        byte[] packet = new byte[5];
        packet[0] = (byte) protocolHeader;
        packet[1] = (byte) packetType;
        packet[2] = (byte) 0x05;

        int crc = calculateCRC16(packet, 3);
        packet[3] = (byte) (crc & 0xFF);
        packet[4] = (byte) ((crc >> 8) & 0xFF);
        return packet;
    }

    /** Set the protocol header byte (0xF0 standard, 0xAB for some devices). */
    public void setProtocolHeader(int header) {
        protocolHeader = header;
        Log.d(TAG, "Protocol header set to 0x" + String.format("%02X", header));
    }

    public int getProtocolHeader() { return protocolHeader; }

    /** Send raw command bytes to the control characteristic. */
    public boolean sendCommand(byte[] command) {
        if (bluetoothGatt != null && controlCharacteristic != null && isConnected) {
            Log.d(TAG, "sendCommand: " + bytesToHex(command));
            controlCharacteristic.setValue(command);
            boolean success = bluetoothGatt.writeCharacteristic(controlCharacteristic);
            if (!success) {
                Log.e(TAG, "Failed to write characteristic");
            }
            return success;
        } else {
            Log.e(TAG, "Cannot send command - not ready");
            return false;
        }
    }

    /**
     * Write raw bytes directly to the control characteristic WITHOUT any encryption.
     * Used by firmware uploader for MTU testing and single-write firmware commands.
     */
    public boolean writeRawBytes(byte[] data) {
        if (bluetoothGatt != null && controlCharacteristic != null && isConnected) {
            controlCharacteristic.setValue(data);
            boolean success = bluetoothGatt.writeCharacteristic(controlCharacteristic);
            if (!success) {
                Log.e(TAG, "Failed to write raw bytes");
            }
            return success;
        } else {
            Log.e(TAG, "Cannot write raw bytes - not ready");
            return false;
        }
    }

    /**
     * Write raw bytes and BLOCK until the onCharacteristicWrite callback fires (or timeout).
     * This is essential for multi-write chunking: Android BLE requires each write to
     * complete before the next one is issued, otherwise writes are silently dropped.
     *
     * @param data      bytes to write
     * @param timeoutMs max time to wait for write callback
     * @return true if write succeeded and callback received within timeout
     */
    public boolean writeRawBytesAndWait(byte[] data, long timeoutMs) {
        if (bluetoothGatt == null || controlCharacteristic == null || !isConnected) {
            Log.e(TAG, "Cannot write raw bytes - not ready");
            return false;
        }

        writeLatch = new CountDownLatch(1);
        controlCharacteristic.setValue(data);
        boolean success = bluetoothGatt.writeCharacteristic(controlCharacteristic);
        if (!success) {
            Log.e(TAG, "Failed to write raw bytes (writeCharacteristic returned false)");
            writeLatch = null;
            return false;
        }

        try {
            boolean completed = writeLatch.await(timeoutMs, TimeUnit.MILLISECONDS);
            if (!completed) {
                Log.e(TAG, "writeRawBytesAndWait: timeout after " + timeoutMs + "ms");
                return false;
            }
            return true;
        } catch (InterruptedException e) {
            Log.e(TAG, "writeRawBytesAndWait: interrupted");
            return false;
        } finally {
            writeLatch = null;
        }
    }

    /**
     * Set the write type on the control characteristic.
     * Use BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT (with ack) or
     * BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE.
     */
    public void setWriteType(int writeType) {
        if (controlCharacteristic != null) {
            controlCharacteristic.setWriteType(writeType);
            Log.d(TAG, "Write type set to " + (writeType == BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE ? "NO_RESPONSE" : "DEFAULT"));
        }
    }

    // ==================================================================================
    // DISCONNECT
    // ==================================================================================

    public void disconnect() {
        listener.onConnectionStatusChanged("Disconnecting...");
        if (bluetoothGatt != null) {
            try {
                bluetoothGatt.disconnect();
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (isConnected) {
                        forceDisconnectCleanup();
                        listener.onDeviceDisconnected(true);
                    }
                }, 3000);
            } catch (Exception e) {
                forceDisconnectCleanup();
                listener.onDeviceDisconnected(true);
            }
        } else {
            forceDisconnectCleanup();
            listener.onDeviceDisconnected(true);
        }
    }

    private void forceDisconnectCleanup() {
        isConnected = false;
        deviceSerialNumber = "";
        deviceModelNumber = "";
        deviceHardwareRevision = "";
        deviceFirmwareRevision = "";
        deviceSoftwareRevision = "";
        deviceManufacturer = "";
        if (bluetoothGatt != null) {
            try { bluetoothGatt.close(); } catch (Exception ignored) {}
            bluetoothGatt = null;
        }
        controlCharacteristic = null;
        notifyCharacteristic = null;
    }

    public void cleanup() {
        if (isScanning && bleScanner != null) {
            try { bleScanner.stopScan(scanCallback); } catch (Exception ignored) {}
            isScanning = false;
        }
        disconnect();
    }

    // ==================================================================================
    // UTILITY
    // ==================================================================================

    public int calculateCRC16(byte[] data, int length) {
        return ProtocolUtils.calculateCRC16(data, length);
    }

    public String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    public boolean isConnected() { return isConnected; }
    public boolean isScanning() { return isScanning; }
    /** Returns the negotiated MTU. Usable ATT payload = MTU - 3. */
    public int getNegotiatedMtu() { return negotiatedMtu; }
    /** Returns the max bytes that can be sent in a single BLE write (MTU - 3). */
    public int getMaxWriteSize() { return negotiatedMtu - 3; }
    public String getDeviceSerialNumber() { return deviceSerialNumber != null ? deviceSerialNumber : ""; }
    public String getDeviceModelNumber() { return deviceModelNumber != null ? deviceModelNumber : ""; }
    public String getDeviceHardwareRevision() { return deviceHardwareRevision != null ? deviceHardwareRevision : ""; }
    public String getDeviceFirmwareRevision() { return deviceFirmwareRevision != null ? deviceFirmwareRevision : ""; }
    public String getDeviceSoftwareRevision() { return deviceSoftwareRevision != null ? deviceSoftwareRevision : ""; }
    public String getDeviceManufacturer() { return deviceManufacturer != null ? deviceManufacturer : ""; }
    public boolean isBluetoothAvailable() { return bluetoothAdapter != null && bluetoothAdapter.isEnabled(); }
    public BluetoothGatt getBluetoothGatt() { return bluetoothGatt; }
    public BluetoothGattCharacteristic getControlCharacteristic() { return controlCharacteristic; }
    public List<ScanResult> getDiscoveredDevices() { return new ArrayList<>(discoveredDevices); }
}
