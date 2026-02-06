package com.pure.gen3firmwareupdater;

import android.util.Log;

/**
 * Parsed version data from the 0xB0 BLE packet.
 *
 * Two known B0 response formats:
 *
 * FORMAT A — 25 bytes (standard protocol doc):
 *   [0]=header, [1]=cmd(0xB0), [2]=length(0x19),
 *   [3-4]=model, [5]=meter HW, [6]=meter SW,
 *   [7]=controller HW, [8]=controller SW,
 *   [9]=BMS HW, [10]=BMS SW, [11-22]=reserved, [23-24]=CRC
 *
 * FORMAT B — 32 bytes (seen on some devices, includes embedded SN):
 *   [0]=header, [1]=cmd(0xB0), [2]=length(0x20),
 *   [3-4]=model, [5-17]=13-char serial number (ASCII),
 *   [18-19]=reserved?, [20]=??,
 *   [21]=meter HW, [22]=meter SW,
 *   [23]=controller HW, [24]=controller SW,
 *   [25]=BMS HW, [26]=BMS SW, [27-29]=reserved, [30-31]=CRC
 *
 * Each version byte uses nibble format: high nibble = major, low nibble = minor.
 */
public class VersionInfo {
    private static final String TAG = "VersionInfo";

    public String controllerHwVersion;
    public String controllerSwVersion;
    public String meterHwVersion;
    public String meterSwVersion;
    public String bmsHwVersion;
    public String bmsSwVersion;
    public int model;
    public String embeddedSerialNumber;  // Only present in 32-byte format
    public String rawHex = "";           // Raw B0 packet hex for debugging
    public int packetLength;             // Total packet length

    public static VersionInfo parseFromB0Packet(byte[] data) {
        if (data == null || data.length < 11) return null;

        VersionInfo info = new VersionInfo();
        info.packetLength = data.length;

        // Store raw hex for debugging
        StringBuilder hex = new StringBuilder();
        for (byte b : data) hex.append(String.format("%02X ", b));
        info.rawHex = hex.toString().trim();
        Log.d(TAG, "B0 raw hex: " + info.rawHex);

        info.model = ((data[3] & 0xFF) << 8) | (data[4] & 0xFF);

        int len = data[2] & 0xFF;  // Length field
        Log.d(TAG, "B0 packet: totalLen=" + data.length + " lenField=0x"
                + String.format("%02X", len) + " (" + len + ")");

        if (data.length >= 27 && len >= 0x20) {
            // FORMAT B — 32-byte format with embedded SN at bytes 5-17
            Log.d(TAG, "Parsing B0 FORMAT B (32-byte with embedded SN)");

            // Extract 13-char serial number from bytes 5-17
            try {
                byte[] snBytes = new byte[13];
                System.arraycopy(data, 5, snBytes, 0, 13);
                info.embeddedSerialNumber = new String(snBytes).trim();
                Log.d(TAG, "Embedded SN: '" + info.embeddedSerialNumber + "'");
            } catch (Exception e) {
                info.embeddedSerialNumber = "";
            }

            // Version fields at offset +16 from standard positions
            info.meterHwVersion = parseNibbleVersion(data[21]);
            info.meterSwVersion = parseNibbleVersion(data[22]);
            info.controllerHwVersion = parseNibbleVersion(data[23]);
            info.controllerSwVersion = parseNibbleVersion(data[24]);
            info.bmsHwVersion = parseNibbleVersion(data[25]);
            info.bmsSwVersion = parseNibbleVersion(data[26]);
        } else {
            // FORMAT A — standard 25-byte format
            Log.d(TAG, "Parsing B0 FORMAT A (25-byte standard)");
            info.embeddedSerialNumber = "";
            info.meterHwVersion = parseNibbleVersion(data[5]);
            info.meterSwVersion = parseNibbleVersion(data[6]);
            info.controllerHwVersion = parseNibbleVersion(data[7]);
            info.controllerSwVersion = parseNibbleVersion(data[8]);
            info.bmsHwVersion = parseNibbleVersion(data[9]);
            info.bmsSwVersion = parseNibbleVersion(data[10]);
        }

        Log.d(TAG, "Parsed: " + info);
        return info;
    }

    private static String parseNibbleVersion(byte b) {
        return String.format("V%d.%d", (b >> 4) & 0x0F, b & 0x0F);
    }

    @Override
    public String toString() {
        return "Controller HW:" + controllerHwVersion + " SW:" + controllerSwVersion
                + " Meter HW:" + meterHwVersion + " SW:" + meterSwVersion
                + " BMS HW:" + bmsHwVersion + " SW:" + bmsSwVersion
                + (embeddedSerialNumber != null && !embeddedSerialNumber.isEmpty()
                    ? " SN:" + embeddedSerialNumber : "");
    }
}
