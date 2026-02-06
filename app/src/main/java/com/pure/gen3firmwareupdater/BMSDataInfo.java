package com.pure.gen3firmwareupdater;

import android.util.Log;

/**
 * Represents Battery Management System (BMS) data from instruction 0xA1.
 * Contains battery health metrics like SOC, charge cycles, discharge cycles, cell voltages.
 *
 * Packet structure: Variable length, typically 20-40 bytes
 * Format: [header, 0xA1, length, ...data..., CRC_L, CRC_H]
 */
public class BMSDataInfo {
    private static final String TAG = "BMSDataInfo";

    // Battery metrics
    public int batterySOC;              // State of Charge (0-100%)
    public int chargeCycles;            // Total charge cycles completed
    public int dischargeCycles;         // Total discharge cycles completed
    public double batteryVoltage;       // Total battery pack voltage (V)
    public double batteryCurrent;       // Battery current in amps (A)
    public int batteryHealth;           // Battery health percentage (0-100%)

    // Temperature
    public int[] cellTemperatures;      // Individual cell temperatures (°C)
    public int avgTemperature;          // Average battery temperature (°C)
    public int maxTemperature;          // Maximum cell temperature (°C)
    public int minTemperature;          // Minimum cell temperature (°C)

    // Cell voltages (if available)
    public double[] cellVoltages;       // Individual cell voltages (V)
    public double maxCellVoltage;       // Highest cell voltage (V)
    public double minCellVoltage;       // Lowest cell voltage (V)

    // Capacity
    public int remainingCapacity;       // Remaining capacity in mAh
    public int fullCapacity;            // Full charge capacity in mAh
    public int designCapacity;          // Design capacity in mAh

    // Status flags
    public boolean isCharging;
    public boolean isDischarging;
    public boolean isBalancing;
    public boolean hasFault;

    // Raw data
    public byte[] rawData;
    public String rawHex;

    /**
     * Parse a 0xA1 BMS data packet from the scooter.
     * Expected format: [0xAB/0xF0, 0xA1, length, ...data..., CRC_L, CRC_H]
     *
     * Byte layout (typical format, may vary by firmware):
     * [0-2]   Header, command, length
     * [3]     Battery SOC (uint8, 0-100%)
     * [4]     Battery health (uint8, 0-100%)
     * [5-6]   Charge cycles (uint16)
     * [7-8]   Discharge cycles (uint16)
     * [9-10]  Battery voltage (uint16, in 0.01V units)
     * [11-12] Battery current (int16, in 0.01A units, signed)
     * [13-14] Remaining capacity (uint16, in mAh)
     * [15-16] Full capacity (uint16, in mAh)
     * [17-18] Design capacity (uint16, in mAh)
     * [19]    Avg temperature (int8, °C)
     * [20]    Max temperature (int8, °C)
     * [21]    Min temperature (int8, °C)
     * [22]    Status flags byte
     * [...-2] CRC_L
     * [...-1] CRC_H
     */
    public static BMSDataInfo parse(byte[] data) {
        if (data == null || data.length < 15) {
            Log.w(TAG, "A1 packet too short: " + (data == null ? "null" : data.length));
            return null;
        }

        // Verify packet type
        if ((data[0] != (byte) 0xAB && data[0] != (byte) 0xF0) || data[1] != (byte) 0xA1) {
            Log.w(TAG, "Not a valid A1 packet: header=0x" + String.format("%02X", data[0])
                    + " cmd=0x" + String.format("%02X", data[1]));
            return null;
        }

        BMSDataInfo info = new BMSDataInfo();
        info.rawData = data.clone();
        info.rawHex = bytesToHex(data);

        try {
            // Parse Battery SOC (byte 3, uint8, 0-100%)
            if (data.length > 3) {
                info.batterySOC = data[3] & 0xFF;
            }

            // Parse Battery health (byte 4, uint8, 0-100%)
            if (data.length > 4) {
                info.batteryHealth = data[4] & 0xFF;
            }

            // Parse charge cycles (bytes 5-6, uint16)
            if (data.length > 6) {
                info.chargeCycles = ((data[5] & 0xFF) << 8) | (data[6] & 0xFF);
            }

            // Parse discharge cycles (bytes 7-8, uint16)
            if (data.length > 8) {
                info.dischargeCycles = ((data[7] & 0xFF) << 8) | (data[8] & 0xFF);
            }

            // Parse battery voltage (bytes 9-10, uint16, in 0.01V units)
            if (data.length > 10) {
                int voltageRaw = ((data[9] & 0xFF) << 8) | (data[10] & 0xFF);
                info.batteryVoltage = voltageRaw / 100.0;
            }

            // Parse battery current (bytes 11-12, int16, in 0.01A units, signed)
            if (data.length > 12) {
                int currentRaw = (short) (((data[11] & 0xFF) << 8) | (data[12] & 0xFF));
                info.batteryCurrent = currentRaw / 100.0;
            }

            // Parse remaining capacity (bytes 13-14, uint16, in mAh)
            if (data.length > 14) {
                info.remainingCapacity = ((data[13] & 0xFF) << 8) | (data[14] & 0xFF);
            }

            // Parse full capacity (bytes 15-16, uint16, in mAh)
            if (data.length > 16) {
                info.fullCapacity = ((data[15] & 0xFF) << 8) | (data[16] & 0xFF);
            }

            // Parse design capacity (bytes 17-18, uint16, in mAh)
            if (data.length > 18) {
                info.designCapacity = ((data[17] & 0xFF) << 8) | (data[18] & 0xFF);
            }

            // Parse average temperature (byte 19, int8, °C)
            if (data.length > 19) {
                info.avgTemperature = (byte) data[19]; // signed byte
            }

            // Parse max temperature (byte 20, int8, °C)
            if (data.length > 20) {
                info.maxTemperature = (byte) data[20]; // signed byte
            }

            // Parse min temperature (byte 21, int8, °C)
            if (data.length > 21) {
                info.minTemperature = (byte) data[21]; // signed byte
            }

            // Parse status flags (byte 22)
            if (data.length > 22) {
                int statusFlags = data[22] & 0xFF;
                info.isCharging = (statusFlags & 0x01) != 0;
                info.isDischarging = (statusFlags & 0x02) != 0;
                info.isBalancing = (statusFlags & 0x04) != 0;
                info.hasFault = (statusFlags & 0x80) != 0;
            }

            Log.d(TAG, "Parsed A1 packet: " + info);
            return info;

        } catch (Exception e) {
            Log.e(TAG, "Error parsing A1 packet: " + e.getMessage(), e);
            return null;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    @Override
    public String toString() {
        return "BMSDataInfo{" +
                "SOC=" + batterySOC + "%" +
                ", health=" + batteryHealth + "%" +
                ", chargeCycles=" + chargeCycles +
                ", dischargeCycles=" + dischargeCycles +
                ", voltage=" + String.format("%.2fV", batteryVoltage) +
                ", current=" + String.format("%.2fA", batteryCurrent) +
                ", capacity=" + remainingCapacity + "/" + fullCapacity + " mAh" +
                ", temp=" + avgTemperature + "°C (min:" + minTemperature + " max:" + maxTemperature + ")" +
                '}';
    }
}
