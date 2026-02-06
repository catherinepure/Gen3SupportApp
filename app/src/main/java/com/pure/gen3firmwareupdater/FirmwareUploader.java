package com.pure.gen3firmwareupdater;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Firmware uploader stripped for distributor use.
 * Accepts firmware bytes directly (downloaded from Supabase).
 * No file picker, no engineering mode, no headlight checks.
 *
 * Protocol: D0 (request) -> D1 (erase) -> D2 (128-byte chunks) -> D3 (complete)
 *
 * Based on the working Gen3Telemetry FirmwareUploader implementation.
 * Key points:
 * - Firmware commands use the auto-detected protocol header (0xF0 or 0xAB)
 * - Uses multi-write method (128-byte chunks) for reliability
 * - No MTU gate — always uses multi-write
 * - No extra delays between D1 and D2, or before D3
 */
public class FirmwareUploader {

    private static final String TAG = "FirmwareUploader";

    private static final byte CMD_REQUEST_UPGRADE = (byte) 0xD0;
    private static final byte CMD_ERASE_MEMORY = (byte) 0xD1;
    private static final byte CMD_UPLOAD_DATA = (byte) 0xD2;
    private static final byte CMD_COMPLETE_UPLOAD = (byte) 0xD3;

    // Upload constraints
    private static final int FIRMWARE_CHUNK_SIZE = 128;
    private static final int MIN_FIRMWARE_SIZE = 1024;
    private static final int MAX_FIRMWARE_SIZE = 512 * 1024;

    // Timeouts (matching working implementation)
    private static final long D0_TIMEOUT_MS = 10000;
    private static final long D1_TIMEOUT_MS = 15000;
    private static final long D2_INITIAL_TIMEOUT_MS = 5000;
    private static final long D2_PACKET_TIMEOUT_MS = 3000;
    private static final long D3_TIMEOUT_MS = 5000;

    // State
    private BLEManager bleManager;
    private FirmwareUploadListener listener;
    private Handler mainHandler;

    private boolean uploadActive = false;
    private byte[] firmwareData;
    private int currentPacket = 0;
    private int totalPackets = 0;
    private CompletableFuture<byte[]> responseWaiter;
    private int maxWriteSize = 128;

    public interface FirmwareUploadListener {
        void onUploadStarted();
        void onUploadProgress(int current, int total, int percentage);
        void onUploadCompleted();
        void onUploadFailed(String error);
        void onUploadLog(String message, String level);
    }

    public FirmwareUploader(BLEManager bleManager, FirmwareUploadListener listener) {
        this.bleManager = bleManager;
        this.listener = listener;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    /**
     * Start firmware upload with pre-loaded binary data.
     */
    public void startUpload(byte[] data) {
        if (uploadActive) {
            notifyFailed("Upload already in progress");
            return;
        }
        if (!bleManager.isConnected()) {
            notifyFailed("Not connected to device");
            return;
        }
        if (data == null || data.length < MIN_FIRMWARE_SIZE) {
            notifyFailed("Firmware data too small (min " + (MIN_FIRMWARE_SIZE / 1024) + "KB)");
            return;
        }
        if (data.length > MAX_FIRMWARE_SIZE) {
            notifyFailed("Firmware data too large (max " + (MAX_FIRMWARE_SIZE / 1024) + "KB)");
            return;
        }

        this.firmwareData = data;
        uploadActive = true;
        currentPacket = 0;

        logMessage("Starting MCU firmware upload (" + data.length + " bytes)", "info");

        if (listener != null) listener.onUploadStarted();

        new Thread(() -> {
            try {
                performFirmwareUpload();
                mainHandler.post(() -> {
                    if (listener != null) listener.onUploadCompleted();
                });
            } catch (Exception e) {
                String error = "Firmware upload failed: " + e.getMessage();
                logMessage(error, "error");
                mainHandler.post(() -> {
                    if (listener != null) listener.onUploadFailed(error);
                });
            } finally {
                uploadActive = false;
            }
        }).start();
    }

    public boolean isUploadActive() { return uploadActive; }

    public void cancelUpload() {
        if (uploadActive) {
            uploadActive = false;
            if (responseWaiter != null && !responseWaiter.isDone()) {
                responseWaiter.cancel(true);
            }
            bleManager.setFirmwareNotificationHandler(null);
            logMessage("Upload aborted by user", "warning");
            if (listener != null) listener.onUploadFailed("Upload aborted by user");
        }
    }

    // ==================================================================================
    // UPLOAD PROCEDURE
    // ==================================================================================

    private void performFirmwareUpload() throws Exception {
        bleManager.setFirmwareNotificationHandler(data -> {
            if (uploadActive && responseWaiter != null && !responseWaiter.isDone()) {
                responseWaiter.complete(data);
            }
        });

        try {
            // Step 1: D0 - Request upgrade
            logMessage("Requesting upgrade permission...", "info");
            sendD0();

            // Step 2: D1 - Erase flash
            logMessage("Erasing flash memory...", "info");
            sendD1();

            // Step 3: D2 - Upload data using multi-write for reliability
            logMessage("Uploading firmware data (multi-write mode)...", "info");
            uploadFirmwareDataMultiWrite();

            // Step 4: D3 - Complete
            logMessage("Sending completion command...", "info");
            sendD3();

        } finally {
            bleManager.setFirmwareNotificationHandler(null);
        }

        logMessage("Firmware upload completed successfully", "success");
    }

    // ==================================================================================
    // FIRMWARE COMMANDS
    // ==================================================================================

    private void sendD0() throws Exception {
        byte[] cmd = new byte[4];
        cmd[0] = (byte) bleManager.getProtocolHeader();
        cmd[1] = CMD_REQUEST_UPGRADE;
        int crc = calculateCRC16(cmd, 2);
        cmd[2] = (byte) (crc & 0xFF);
        cmd[3] = (byte) ((crc >> 8) & 0xFF);

        logMessage("Sending D0 upgrade request: " + bytesToHex(cmd), "info");

        byte[] response = sendCommandAndWait(cmd, D0_TIMEOUT_MS);
        if (response.length < 3 || response[1] != CMD_REQUEST_UPGRADE || response[2] != 0x00) {
            throw new Exception("D0 upgrade permission denied: " + bytesToHex(response));
        }
        logMessage("D0 upgrade permission granted", "success");
    }

    private void sendD1() throws Exception {
        byte[] cmd = new byte[4];
        cmd[0] = (byte) bleManager.getProtocolHeader();
        cmd[1] = CMD_ERASE_MEMORY;
        int crc = calculateCRC16(cmd, 2);
        cmd[2] = (byte) (crc & 0xFF);
        cmd[3] = (byte) ((crc >> 8) & 0xFF);

        logMessage("Sending D1 flash erase: " + bytesToHex(cmd), "info");

        byte[] response = sendCommandAndWait(cmd, D1_TIMEOUT_MS);
        if (response.length < 3 || response[1] != CMD_ERASE_MEMORY || response[2] != 0x00) {
            throw new Exception("D1 flash erase failed: " + bytesToHex(response));
        }
        logMessage("D1 flash erase completed", "success");
    }

    /**
     * Upload firmware using multi-write method for reliability.
     * Matches the working Gen3Telemetry implementation which always uses
     * multi-write with 128-byte chunks regardless of MTU.
     */
    private void uploadFirmwareDataMultiWrite() throws Exception {
        totalPackets = (firmwareData.length + 127) / 128;
        logMessage("Uploading " + totalPackets + " packets (multi-write, " + maxWriteSize + " bytes per write)...", "info");

        for (currentPacket = 0; currentPacket < totalPackets; currentPacket++) {
            if (!uploadActive) throw new Exception("Upload cancelled");

            int dataStart = currentPacket * 128;
            int dataEnd = Math.min(dataStart + 128, firmwareData.length);
            int packetDataSize = dataEnd - dataStart;

            // Pad to 128 bytes with 0xFF
            byte[] packetData = new byte[128];
            System.arraycopy(firmwareData, dataStart, packetData, 0, packetDataSize);
            if (packetDataSize < 128) {
                for (int i = packetDataSize; i < 128; i++) packetData[i] = (byte) 0xFF;
            }

            // Build D2 packet (136 bytes)
            byte[] packet = new byte[136];
            packet[0] = (byte) bleManager.getProtocolHeader();
            packet[1] = CMD_UPLOAD_DATA;
            packet[2] = (byte) ((currentPacket >> 8) & 0xFF);
            packet[3] = (byte) (currentPacket & 0xFF);
            packet[4] = 0x00;
            packet[5] = (byte) 0x80;
            System.arraycopy(packetData, 0, packet, 6, 128);

            int crc = calculateCRC16(packet, 134);
            packet[134] = (byte) (crc & 0xFF);
            packet[135] = (byte) ((crc >> 8) & 0xFF);

            if (currentPacket == 0) {
                logMessage("First D2 packet: " + bytesToHex(packet, 6) + " ... (" + packet.length + " bytes)", "info");
            }

            long timeout = currentPacket < 5 ? D2_INITIAL_TIMEOUT_MS : D2_PACKET_TIMEOUT_MS;
            byte[] response = sendCommandMultiWrite(packet, timeout);

            if (response.length < 2 || response[1] != CMD_UPLOAD_DATA) {
                throw new Exception("Invalid D2 response for packet " + currentPacket + ": " + bytesToHex(response));
            }

            // Update progress
            int progress = ((currentPacket + 1) * 100) / totalPackets;
            final int pkt = currentPacket + 1;
            mainHandler.post(() -> {
                if (listener != null) listener.onUploadProgress(pkt, totalPackets, progress);
            });

            Thread.sleep(10);
        }

        logMessage("All firmware data uploaded", "success");
    }

    private void sendD3() throws Exception {
        byte[] cmd = new byte[4];
        cmd[0] = (byte) bleManager.getProtocolHeader();
        cmd[1] = CMD_COMPLETE_UPLOAD;
        int crc = calculateCRC16(cmd, 2);
        cmd[2] = (byte) (crc & 0xFF);
        cmd[3] = (byte) ((crc >> 8) & 0xFF);

        logMessage("Sending D3 completion: " + bytesToHex(cmd), "info");

        boolean sent = bleManager.sendCommand(cmd);
        if (!sent) throw new Exception("Failed to send D3 command");

        logMessage("D3 completion command sent - device will restart", "success");
        Thread.sleep(5000);
    }

    // ==================================================================================
    // BLE COMMUNICATION
    // ==================================================================================

    private byte[] sendCommandAndWait(byte[] command, long timeoutMs) throws Exception {
        responseWaiter = new CompletableFuture<>();
        boolean sent = bleManager.sendCommand(command);
        if (!sent) throw new Exception("Failed to send command via BLE");

        try {
            return responseWaiter.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            throw new Exception("Timeout waiting for response after " + timeoutMs + "ms");
        }
    }

    /**
     * Send command using multiple BLE writes, matching the working implementation.
     * Splits the 136-byte D2 packet into chunks of maxWriteSize bytes.
     */
    private byte[] sendCommandMultiWrite(byte[] command, long timeoutMs) throws Exception {
        responseWaiter = new CompletableFuture<>();

        int writesNeeded = (command.length + maxWriteSize - 1) / maxWriteSize;

        for (int writeNo = 0; writeNo < writesNeeded; writeNo++) {
            int startIdx = writeNo * maxWriteSize;
            int endIdx = Math.min(startIdx + maxWriteSize, command.length);
            int chunkSize = endIdx - startIdx;

            byte[] chunk = new byte[chunkSize];
            System.arraycopy(command, startIdx, chunk, 0, chunkSize);

            // Use writeRawBytesAndWait to ensure each chunk completes before sending next
            // This is required by Android BLE - writes fail if not properly sequenced
            boolean sent = bleManager.writeRawBytesAndWait(chunk, 1000);
            if (!sent) throw new Exception("Failed to send chunk " + (writeNo + 1) + "/" + writesNeeded);

            // Small delay between writes for device processing
            Thread.sleep(10);
        }

        try {
            return responseWaiter.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            throw new Exception("Multi-write timeout after " + timeoutMs + "ms");
        }
    }

    // ==================================================================================
    // UTILITY
    // ==================================================================================

    private int calculateCRC16(byte[] data, int length) {
        return ProtocolUtils.calculateCRC16(data, length);
    }

    private String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    private String bytesToHex(byte[] bytes, int length) {
        return ProtocolUtils.bytesToHex(bytes, length);
    }

    private void logMessage(String message, String level) {
        Log.d(TAG, message);
        if (listener != null) listener.onUploadLog(message, level);
    }

    private void notifyFailed(String error) {
        logMessage(error, "error");
        if (listener != null) listener.onUploadFailed(error);
    }
}
