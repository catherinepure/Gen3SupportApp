package com.pure.gen3firmwareupdater;

import android.bluetooth.le.ScanResult;
import java.util.List;

/**
 * Callback interface for BLE connection events.
 */
public interface BLEListener {
    void onScanStarted();
    void onScanCompleted(List<ScanResult> devices);
    void onScanFailed(String error);

    void onDeviceConnected(String deviceName, String address, String serialNumber);
    void onDeviceDisconnected(boolean wasExpected);
    void onConnectionFailed(String error);
    void onConnectionStatusChanged(String status);

    void onDataReceived(byte[] data);
    void onSerialNumberRead(String serialNumber);
    void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                          String modelNumber, String manufacturer);

    void onCommandSent(boolean success, String message);
}
