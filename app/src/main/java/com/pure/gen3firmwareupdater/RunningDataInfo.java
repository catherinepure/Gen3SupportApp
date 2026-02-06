package com.pure.gen3firmwareupdater;

import android.util.Log;

/**
 * Represents real-time running data from instruction 0xA0.
 * Contains telemetry like voltage, current, speed, odometer, and other real-time metrics.
 *
 * Packet structure: Variable length, typically 20-30 bytes
 * Format: [header, 0xA0, length, ...data..., CRC_L, CRC_H]
 */
public class RunningDataInfo {
    private static final String TAG = "RunningDataInfo";

    // Real-time telemetry
    public double voltage;              // Battery voltage in volts (V)
    public double current;              // Motor current in amps (A)
    public double speed;                // Current speed in km/h
    public int odometer;                // Total distance in km or meters
    public int batteryPercent;          // Battery level 0-100%
    public double power;                // Power in watts (calculated: voltage * current)

    // Temperature (if available)
    public int motorTemp;               // Motor temperature in °C
    public int batteryTemp;             // Battery temperature in °C

    // Status flags
    public boolean isMoving;
    public boolean isCharging;
    public boolean lightsOn;

    // Raw data
    public byte[] rawData;
    public String rawHex;

    /**
     * Parse a 0xA0 running data packet from the scooter.
     * Expected format: [0xAB/0xF0, 0xA0, length, ...data..., CRC_L, CRC_H]
     *
     * Byte layout (typical format, may vary by firmware):
     * [0-2]   Header, command, length
     * [3-4]   Speed (uint16, in 0.1 km/h units)
     * [5-6]   Voltage (uint16, in 0.1V units)
     * [7-8]   Current (int16, in 0.01A units, signed)
     * [9-10]  Battery percent (uint16, 0-100 or 0-1000)
     * [11-14] Odometer (uint32, in meters or 0.1km)
     * [15]    Motor temperature (int8, °C)
     * [16]    Battery temperature (int8, °C)
     * [17]    Status flags byte
     * [...-2] CRC_L
     * [...-1] CRC_H
     */
    public static RunningDataInfo parse(byte[] data) {
        if (data == null || data.length < 15) {
            Log.w(TAG, "A0 packet too short: " + (data == null ? "null" : data.length));
            return null;
        }

        // Verify packet type
        if ((data[0] != (byte) 0xAB && data[0] != (byte) 0xF0) || data[1] != (byte) 0xA0) {
            Log.w(TAG, "Not a valid A0 packet: header=0x" + String.format("%02X", data[0])
                    + " cmd=0x" + String.format("%02X", data[1]));
            return null;
        }

        RunningDataInfo info = new RunningDataInfo();
        info.rawData = data.clone();
        info.rawHex = bytesToHex(data);

        try {
            // Parse speed (bytes 3-4, uint16, in 0.1 km/h units)
            if (data.length > 4) {
                int speedRaw = ((data[3] & 0xFF) << 8) | (data[4] & 0xFF);
                info.speed = speedRaw / 10.0;
            }

            // Parse voltage (bytes 5-6, uint16, in 0.1V units)
            if (data.length > 6) {
                int voltageRaw = ((data[5] & 0xFF) << 8) | (data[6] & 0xFF);
                info.voltage = voltageRaw / 10.0;
            }

            // Parse current (bytes 7-8, int16, in 0.01A units, signed)
            if (data.length > 8) {
                int currentRaw = (short) (((data[7] & 0xFF) << 8) | (data[8] & 0xFF));
                info.current = currentRaw / 100.0;
            }

            // Parse battery percent (bytes 9-10, uint16)
            if (data.length > 10) {
                int batteryRaw = ((data[9] & 0xFF) << 8) | (data[10] & 0xFF);
                // Some devices report 0-100, others 0-1000
                info.batteryPercent = batteryRaw > 100 ? batteryRaw / 10 : batteryRaw;
            }

            // Parse odometer (bytes 11-14, uint32, in meters)
            if (data.length > 14) {
                long odometerRaw = ((data[11] & 0xFFL) << 24) |
                                   ((data[12] & 0xFFL) << 16) |
                                   ((data[13] & 0xFFL) << 8) |
                                   (data[14] & 0xFFL);
                info.odometer = (int) (odometerRaw / 1000); // Convert meters to km
            }

            // Parse motor temperature (byte 15, int8, °C)
            if (data.length > 15) {
                info.motorTemp = (byte) data[15]; // signed byte
            }

            // Parse battery temperature (byte 16, int8, °C)
            if (data.length > 16) {
                info.batteryTemp = (byte) data[16]; // signed byte
            }

            // Parse status flags (byte 17)
            if (data.length > 17) {
                int statusFlags = data[17] & 0xFF;
                info.isMoving = (statusFlags & 0x01) != 0;
                info.isCharging = (statusFlags & 0x02) != 0;
                info.lightsOn = (statusFlags & 0x04) != 0;
            }

            // Calculate power
            info.power = info.voltage * Math.abs(info.current);

            Log.d(TAG, "Parsed A0 packet: " + info);
            return info;

        } catch (Exception e) {
            Log.e(TAG, "Error parsing A0 packet: " + e.getMessage(), e);
            return null;
        }
    }

    private static String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    @Override
    public String toString() {
        return "RunningDataInfo{" +
                "voltage=" + String.format("%.1fV", voltage) +
                ", current=" + String.format("%.2fA", current) +
                ", power=" + String.format("%.1fW", power) +
                ", speed=" + String.format("%.1f km/h", speed) +
                ", battery=" + batteryPercent + "%" +
                ", odometer=" + odometer + " km" +
                ", motorTemp=" + motorTemp + "°C" +
                ", batteryTemp=" + batteryTemp + "°C" +
                '}';
    }
}
