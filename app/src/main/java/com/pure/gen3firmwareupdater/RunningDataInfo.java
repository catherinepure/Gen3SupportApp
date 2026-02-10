package com.pure.gen3firmwareupdater;

import android.util.Log;

/**
 * Represents real-time running data from instruction 0xA0.
 * Contains telemetry like speed, distances, temperatures, fault codes, and control state.
 *
 * Packet structure: 25 bytes total
 * Format: [header(0xF0), 0xA0, length(0x19), ...data..., CRC_L, CRC_H]
 *
 * Byte layout (from Python reference ble_protocol.py):
 * [0]     Header (0xF0)
 * [1]     Packet type (0xA0)
 * [2]     Length (0x19 = 25)
 * [3-4]   Fault Code (uint16_BE, bitmap: bit N = fault EN)
 * [5-6]   Control Function (uint16_BE, flags for gear/lights/cruise/lock)
 * [7]     Cruise Speed (uint8, 1 km/h)
 * [8]     Current Speed (uint8, 1 km/h)
 * [9]     Max Speed (uint8, 1 km/h)
 * [10]    Trip Distance (uint8, 1 km)
 * [11-12] Total Distance (uint16_BE, 1 km)
 * [13]    Remaining Range (uint8, 1 km)
 * [14-15] Current Limit (uint16_BE, 0.1A)
 * [16]    Motor Temperature (int8, °C)
 * [17]    Controller Temperature (int8, °C)
 * [18-19] Motor RPM (uint16_BE)
 * [20-22] Reserved
 * [23-24] CRC16 (MODBUS)
 *
 * NOTE: Voltage, current, and battery percent are NOT in this packet.
 *       They come from 0xA1 (BMS data). We expose them here for backward
 *       compatibility with existing telemetry upload code, but they will
 *       be 0/null until populated from BMS data.
 */
public class RunningDataInfo {
    private static final String TAG = "RunningDataInfo";

    // === Fields from 0xA0 packet (correct per Python protocol) ===

    // Fault codes (bytes 3-4, uint16 bitmap)
    public int faultCode;                   // Raw fault code bitmap
    public String[] activeFaults;           // Human-readable active fault names

    // Control function flags (bytes 5-6)
    public int controlFlags;                // Raw control function flags
    public int gearLevel;                   // 1-4 (from bits 0-1)
    public boolean headlightsOn;            // Bit 4
    public boolean cruiseEnabled;           // Bit 5
    public boolean deviceLocked;            // Bit 8
    public boolean unitIsMiles;             // Bit 9 (false=km, true=miles)
    public boolean zeroStart;               // Bit 10 (false=glide start, true=zero start)

    // Speed data
    public int cruiseSpeed;                 // Cruise speed in km/h (byte 7)
    public int currentSpeed;                // Current speed in km/h (byte 8)
    public int maxSpeed;                    // Max speed setting in km/h (byte 9)

    // Distance data
    public int tripDistance;                // Trip distance in km (byte 10)
    public int totalDistance;               // Total odometer in km (bytes 11-12)
    public int remainingRange;              // Estimated remaining range in km (byte 13)

    // Current limit (bytes 14-15)
    public double currentLimit;             // Current limit in Amps (0.1A resolution)

    // Temperatures
    public int motorTemp;                   // Motor temperature in °C (byte 16, signed)
    public int controllerTemp;              // Controller temperature in °C (byte 17, signed)

    // Motor RPM (bytes 18-19)
    public int motorRPM;                    // Motor RPM

    // === Backward-compatible fields for telemetry upload ===
    // These map to the existing telemetry DB columns.
    // voltage and current come from 0xA1 (BMS), but are kept here
    // so the existing upload code still works.
    public double voltage;                  // Populated from BMS data (for compat)
    public double current;                  // Populated from BMS data (for compat)
    public double speed;                    // Alias for currentSpeed (for compat)
    public int odometer;                    // Alias for totalDistance (for compat)
    public int batteryPercent;              // Populated from BMS data (for compat)
    public double power;                    // Calculated: voltage * |current| (for compat)
    public int batteryTemp;                 // Populated from BMS data (for compat)

    // Status flags (derived from control flags)
    public boolean isMoving;
    public boolean isCharging;              // Not in 0xA0, will be false
    public boolean lightsOn;                // Alias for headlightsOn

    // Raw data
    public byte[] rawData;
    public String rawHex;

    // Fault code names (bit position → fault name)
    private static final String[] FAULT_NAMES = {
            "E0: Motor Temp Out of Range",
            "E1: Brake Fault",
            "E2: Throttle Fault",
            "E3: Controller Fault",
            "E4: Communication Fault",
            "E5: Battery Fault",
            "E6: Hall Sensor Fault",
            "E7: Motor Phase Fault",
            "E8: MOS Fault",
            "E9: Over-Voltage",
            "E10: Under-Voltage",
            "E11: Over-Current",
            "E12: Controller Over-Temp",
            "E13: Battery Fault"
    };

    /**
     * Parse a 0xA0 running data packet from the scooter.
     * Byte layout matches the Python reference ble_protocol.py.
     */
    public static RunningDataInfo parse(byte[] data) {
        if (data == null || data.length < 18) {
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
            // Parse fault code (bytes 3-4, uint16_BE, bitmap)
            if (data.length > 4) {
                info.faultCode = ((data[3] & 0xFF) << 8) | (data[4] & 0xFF);
                info.activeFaults = decodeFaultCodes(info.faultCode);
            }

            // Parse control function flags (bytes 5-6, uint16_BE)
            if (data.length > 6) {
                info.controlFlags = ((data[5] & 0xFF) << 8) | (data[6] & 0xFF);
                info.gearLevel = (info.controlFlags & 0x03) + 1;          // Bits 0-1, add 1 for display
                info.headlightsOn = (info.controlFlags & 0x10) != 0;      // Bit 4
                info.cruiseEnabled = (info.controlFlags & 0x20) != 0;     // Bit 5
                info.deviceLocked = (info.controlFlags & 0x100) != 0;     // Bit 8
                info.unitIsMiles = (info.controlFlags & 0x200) != 0;      // Bit 9
                info.zeroStart = (info.controlFlags & 0x400) != 0;        // Bit 10
                info.lightsOn = info.headlightsOn; // Backward compat alias
            }

            // Parse cruise speed (byte 7, uint8, 1 km/h)
            if (data.length > 7) {
                info.cruiseSpeed = data[7] & 0xFF;
            }

            // Parse current speed (byte 8, uint8, 1 km/h)
            if (data.length > 8) {
                info.currentSpeed = data[8] & 0xFF;
                info.speed = info.currentSpeed;                           // Backward compat
                info.isMoving = info.currentSpeed > 0;                    // Derive from speed
            }

            // Parse max speed (byte 9, uint8, 1 km/h)
            if (data.length > 9) {
                info.maxSpeed = data[9] & 0xFF;
            }

            // Parse trip distance (byte 10, uint8, 1 km)
            if (data.length > 10) {
                info.tripDistance = data[10] & 0xFF;
            }

            // Parse total distance (bytes 11-12, uint16_BE, 1 km)
            if (data.length > 12) {
                info.totalDistance = ((data[11] & 0xFF) << 8) | (data[12] & 0xFF);
                info.odometer = info.totalDistance;                        // Backward compat
            }

            // Parse remaining range (byte 13, uint8, 1 km)
            if (data.length > 13) {
                info.remainingRange = data[13] & 0xFF;
            }

            // Parse current limit (bytes 14-15, uint16_BE, 0.1A)
            if (data.length > 15) {
                int currentLimitRaw = ((data[14] & 0xFF) << 8) | (data[15] & 0xFF);
                info.currentLimit = currentLimitRaw / 10.0;
            }

            // Parse motor temperature (byte 16, int8, °C)
            if (data.length > 16) {
                info.motorTemp = (byte) data[16]; // signed byte for negative temps
            }

            // Parse controller temperature (byte 17, int8, °C)
            if (data.length > 17) {
                info.controllerTemp = (byte) data[17]; // signed byte
            }

            // Parse motor RPM (bytes 18-19, uint16_BE)
            if (data.length > 19) {
                info.motorRPM = ((data[18] & 0xFF) << 8) | (data[19] & 0xFF);
            }

            Log.d(TAG, "Parsed A0 packet: " + info);
            return info;

        } catch (Exception e) {
            Log.e(TAG, "Error parsing A0 packet: " + e.getMessage(), e);
            return null;
        }
    }

    /**
     * Decode fault code bitmap into human-readable fault names.
     */
    private static String[] decodeFaultCodes(int faultCode) {
        if (faultCode == 0) return new String[0];

        java.util.List<String> faults = new java.util.ArrayList<>();
        for (int i = 0; i < FAULT_NAMES.length; i++) {
            if ((faultCode & (1 << i)) != 0) {
                faults.add(FAULT_NAMES[i]);
            }
        }
        return faults.toArray(new String[0]);
    }

    /**
     * Populate backward-compatible fields from BMS data.
     * Call this after both A0 and A1 packets have been received.
     */
    public void populateFromBMS(BMSDataInfo bms) {
        if (bms != null) {
            this.voltage = bms.batteryVoltage;
            this.current = bms.batteryCurrent;
            this.batteryPercent = bms.batteryPercent;
            this.batteryTemp = bms.batteryTemperature;
            this.isCharging = bms.isCharging;
            this.power = this.voltage * Math.abs(this.current);
        }
    }

    private static String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    @Override
    public String toString() {
        return "RunningDataInfo{" +
                "speed=" + currentSpeed + " km/h" +
                ", totalDist=" + totalDistance + " km" +
                ", tripDist=" + tripDistance + " km" +
                ", range=" + remainingRange + " km" +
                ", gear=" + gearLevel +
                ", motorTemp=" + motorTemp + "°C" +
                ", ctrlTemp=" + controllerTemp + "°C" +
                ", rpm=" + motorRPM +
                ", faults=0x" + String.format("%04X", faultCode) +
                ", voltage=" + String.format("%.1fV", voltage) +
                ", current=" + String.format("%.2fA", current) +
                ", battery=" + batteryPercent + "%" +
                '}';
    }
}
