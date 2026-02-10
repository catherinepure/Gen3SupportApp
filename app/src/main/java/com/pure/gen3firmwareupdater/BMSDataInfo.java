package com.pure.gen3firmwareupdater;

import android.util.Log;

/**
 * Represents Battery Management System (BMS) data from instruction 0xA1.
 * Contains battery voltage, current, charge state, capacity, and temperature.
 *
 * Packet structure: 25 bytes total
 * Format: [header(0xF0), 0xA1, length(0x19), ...data..., CRC_L, CRC_H]
 *
 * Byte layout (from Python reference ble_protocol.py):
 * [0]     Header (0xF0)
 * [1]     Packet type (0xA1)
 * [2]     Length (0x19 = 25)
 * [3-4]   Battery Status (uint16_BE, flags: bit 0 = charging)
 * [5-6]   Battery Current (int16_BE, 0.1A, signed: >32767 means negative)
 * [7-8]   Battery Voltage (uint16_BE, 0.1V)
 * [9]     Battery Percent (uint8, 0-100%)
 * [10-11] Charge Cycles (uint16_BE)
 * [12-13] Battery Capacity (uint16_BE, mAh)
 * [14-15] Battery Remaining (uint16_BE, mAh)
 * [16]    Battery Temperature (int8, °C)
 * [17-22] Reserved
 * [23-24] CRC16 (MODBUS)
 */
public class BMSDataInfo {
    private static final String TAG = "BMSDataInfo";

    // === Fields from 0xA1 packet (correct per Python protocol) ===

    // Battery status flags (bytes 3-4)
    public int batteryStatusFlags;          // Raw status flags
    public boolean isCharging;              // Bit 0 of status flags

    // Battery current and voltage
    public double batteryCurrent;           // Battery current in Amps (0.1A, signed)
    public double batteryVoltage;           // Battery pack voltage in Volts (0.1V)

    // Battery state of charge
    public int batteryPercent;              // Battery percentage 0-100% (byte 9)

    // Cycle count
    public int chargeCycles;                // Total charge cycles (bytes 10-11)

    // Capacity
    public int batteryCapacity;             // Full battery capacity in mAh (bytes 12-13)
    public int batteryRemaining;            // Remaining capacity in mAh (bytes 14-15)

    // Temperature
    public int batteryTemperature;          // Battery temperature in °C (byte 16, signed)

    // === Backward-compatible fields for existing code ===
    // These maintain compatibility with existing telemetry upload and display code.
    public int batterySOC;                  // Alias for batteryPercent
    public int batteryHealth;               // Calculated: (batteryCapacity > 0) ? remaining/capacity * 100 : 0
    public int dischargeCycles;             // Not available in protocol; kept at 0 for compat
    public int remainingCapacity;           // Alias for batteryRemaining
    public int fullCapacity;                // Alias for batteryCapacity
    public int designCapacity;              // Not available in protocol; kept at 0 for compat
    public int avgTemperature;              // Alias for batteryTemperature
    public int maxTemperature;              // Not available; same as batteryTemperature
    public int minTemperature;              // Not available; same as batteryTemperature
    public boolean isDischarging;           // Derived: !isCharging && batteryCurrent < 0
    public boolean isBalancing;             // Not available in protocol
    public boolean hasFault;                // Not available in protocol

    // Cell-level data (not available in 0xA1 protocol)
    public int[] cellTemperatures;
    public double[] cellVoltages;
    public double maxCellVoltage;
    public double minCellVoltage;

    // Raw data
    public byte[] rawData;
    public String rawHex;

    /**
     * Parse a 0xA1 BMS data packet from the scooter.
     * Byte layout matches the Python reference ble_protocol.py.
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
            // Parse battery status flags (bytes 3-4, uint16_BE)
            if (data.length > 4) {
                info.batteryStatusFlags = ((data[3] & 0xFF) << 8) | (data[4] & 0xFF);
                info.isCharging = (info.batteryStatusFlags & 0x01) != 0;  // Bit 0 = charging
            }

            // Parse battery current (bytes 5-6, int16_BE, 0.1A, signed)
            // Per Python: if raw > 32767, subtract 65536 to get negative value
            if (data.length > 6) {
                int currentRaw = ((data[5] & 0xFF) << 8) | (data[6] & 0xFF);
                if (currentRaw > 32767) {
                    currentRaw -= 65536;
                }
                info.batteryCurrent = currentRaw / 10.0;
                info.isDischarging = !info.isCharging && info.batteryCurrent < 0;
            }

            // Parse battery voltage (bytes 7-8, uint16_BE, 0.1V)
            if (data.length > 8) {
                int voltageRaw = ((data[7] & 0xFF) << 8) | (data[8] & 0xFF);
                info.batteryVoltage = voltageRaw / 10.0;
            }

            // Parse battery percent (byte 9, uint8, 0-100%)
            if (data.length > 9) {
                info.batteryPercent = data[9] & 0xFF;
                info.batterySOC = info.batteryPercent;  // Backward compat alias
            }

            // Parse charge cycles (bytes 10-11, uint16_BE)
            if (data.length > 11) {
                info.chargeCycles = ((data[10] & 0xFF) << 8) | (data[11] & 0xFF);
            }

            // Parse battery capacity (bytes 12-13, uint16_BE, mAh)
            if (data.length > 13) {
                info.batteryCapacity = ((data[12] & 0xFF) << 8) | (data[13] & 0xFF);
                info.fullCapacity = info.batteryCapacity;  // Backward compat alias
            }

            // Parse battery remaining (bytes 14-15, uint16_BE, mAh)
            if (data.length > 15) {
                info.batteryRemaining = ((data[14] & 0xFF) << 8) | (data[15] & 0xFF);
                info.remainingCapacity = info.batteryRemaining;  // Backward compat alias
            }

            // Parse battery temperature (byte 16, int8, °C)
            if (data.length > 16) {
                info.batteryTemperature = (byte) data[16]; // signed byte
                // Set all compat temperature fields to the same value
                info.avgTemperature = info.batteryTemperature;
                info.maxTemperature = info.batteryTemperature;
                info.minTemperature = info.batteryTemperature;
            }

            // Calculate battery health as percentage of design capacity remaining
            if (info.batteryCapacity > 0 && info.batteryRemaining > 0) {
                info.batteryHealth = Math.min(100,
                        (int) ((info.batteryRemaining * 100.0) / info.batteryCapacity));
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
                "voltage=" + String.format("%.1fV", batteryVoltage) +
                ", current=" + String.format("%.1fA", batteryCurrent) +
                ", SOC=" + batteryPercent + "%" +
                ", health=" + batteryHealth + "%" +
                ", chargeCycles=" + chargeCycles +
                ", capacity=" + batteryRemaining + "/" + batteryCapacity + " mAh" +
                ", temp=" + batteryTemperature + "°C" +
                ", charging=" + isCharging +
                ", statusFlags=0x" + String.format("%04X", batteryStatusFlags) +
                '}';
    }
}
