package com.pure.gen3firmwareupdater;

/**
 * Represents configuration and settings data from instruction 0x01 (0xAB, 0x01).
 * Contains speed limits, fault flags, panel selections, and firmware version.
 * Packet structure: 25 bytes total
 */
public class ConfigInfo {
    // Speed settings (in km/h or mph depending on unit setting)
    public int minCruiseSpeed;      // Byte 3: Minimum speed for cruise control
    public int maxSpeedEco;         // Byte 4: Energy saving mode speed limit
    public int maxSpeedComfort;     // Byte 5: Comfort mode speed limit
    public int maxSpeedSport;       // Byte 6: Sport mode speed limit

    // Fault flags (bytes 8-9, 16 bits total)
    public int faultFlags;          // Combined fault flag word
    public boolean faultWarningEnabled;  // Bit 0
    public boolean brakeFailure;         // Bit 1 (E1)
    public boolean throttleFault;        // Bit 2 (E2)
    public boolean commDisconnect;       // Bit 3 (E3)
    public boolean overcurrent;          // Bit 4 (E4)
    public boolean hallFault;            // Bit 7 (E7)
    public boolean opAmpBias;            // Bit 9 (E9)
    public boolean brakeNotReset;        // Bit 11 (F1)
    public boolean throttleNotReset;     // Bit 12 (F2)

    // Panel selections (bytes 10-11, 16 bits total)
    public int panelFlags;          // Combined panel selection word
    public boolean snCodePanel;     // Bit 0: Show SN code panel
    public boolean mp3Panel;        // Bit 1: Show MP3 panel
    public boolean rgbPanel;        // Bit 2: Show RGB panel
    public boolean bmsPanel;        // Bit 3: Show BMS panel
    public boolean speedUnitMph;    // Bit 12: 0=km/h, 1=mph

    // Software version (bytes 18-22)
    public String softwareVersion;  // Parsed version string (e.g., "8025_01.00.01")

    // Raw data
    public byte[] rawData;
    public String rawHex;

    /**
     * Parse a 0x01 configuration packet from the scooter.
     * Expected format: [0xAB/0xF0, 0x01, 0x19, ...data..., CRC_L, CRC_H]
     */
    public static ConfigInfo parse(byte[] data) {
        if (data == null || data.length < 25) {
            return null;
        }

        // Verify packet type
        if ((data[0] != (byte) 0xAB && data[0] != (byte) 0xF0) || data[1] != 0x01) {
            return null;
        }

        ConfigInfo info = new ConfigInfo();
        info.rawData = data.clone();
        info.rawHex = bytesToHex(data);

        // Parse speed settings (bytes 3-6)
        info.minCruiseSpeed = data[3] & 0xFF;
        info.maxSpeedEco = data[4] & 0xFF;
        info.maxSpeedComfort = data[5] & 0xFF;
        info.maxSpeedSport = data[6] & 0xFF;

        // Parse fault flags (bytes 8-9)
        int faultHigh = data[8] & 0xFF;
        int faultLow = data[9] & 0xFF;
        info.faultFlags = (faultHigh << 8) | faultLow;

        info.faultWarningEnabled = (info.faultFlags & 0x0001) != 0;
        info.brakeFailure = (info.faultFlags & 0x0002) != 0;
        info.throttleFault = (info.faultFlags & 0x0004) != 0;
        info.commDisconnect = (info.faultFlags & 0x0008) != 0;
        info.overcurrent = (info.faultFlags & 0x0010) != 0;
        info.hallFault = (info.faultFlags & 0x0080) != 0;
        info.opAmpBias = (info.faultFlags & 0x0200) != 0;
        info.brakeNotReset = (info.faultFlags & 0x0800) != 0;
        info.throttleNotReset = (info.faultFlags & 0x1000) != 0;

        // Parse panel selections (bytes 10-11)
        int panelHigh = data[10] & 0xFF;
        int panelLow = data[11] & 0xFF;
        info.panelFlags = (panelHigh << 8) | panelLow;

        info.snCodePanel = (info.panelFlags & 0x0001) != 0;
        info.mp3Panel = (info.panelFlags & 0x0002) != 0;
        info.rgbPanel = (info.panelFlags & 0x0004) != 0;
        info.bmsPanel = (info.panelFlags & 0x0008) != 0;
        info.speedUnitMph = (info.panelFlags & 0x1000) != 0;

        // Parse software version (bytes 18-22)
        // Format: e.g., [0x80, 0x25, 0x01, 0x00, 0x01] = "8025_01.00.01"
        info.softwareVersion = String.format("%02X%02X_%02X.%02X.%02X",
                data[18] & 0xFF, data[19] & 0xFF, data[20] & 0xFF,
                data[21] & 0xFF, data[22] & 0xFF);

        return info;
    }

    /**
     * Get a human-readable summary of active faults.
     */
    public String getActiveFaults() {
        StringBuilder sb = new StringBuilder();

        if (brakeFailure) sb.append("E1: Brake failure\n");
        if (throttleFault) sb.append("E2: Throttle fault\n");
        if (commDisconnect) sb.append("E3: Communication disconnect\n");
        if (overcurrent) sb.append("E4: Overcurrent\n");
        if (hallFault) sb.append("E7: Hall fault\n");
        if (opAmpBias) sb.append("E9: Op amp bias\n");
        if (brakeNotReset) sb.append("F1: Brake not reset\n");
        if (throttleNotReset) sb.append("F2: Throttle not reset\n");

        if (sb.length() == 0) {
            return "No active faults";
        }
        return sb.toString().trim();
    }

    /**
     * Get a human-readable summary of enabled panels.
     */
    public String getEnabledPanels() {
        StringBuilder sb = new StringBuilder();

        if (snCodePanel) sb.append("SN Code, ");
        if (mp3Panel) sb.append("MP3, ");
        if (rgbPanel) sb.append("RGB, ");
        if (bmsPanel) sb.append("BMS, ");

        if (sb.length() == 0) {
            return "None";
        }
        // Remove trailing comma and space
        return sb.substring(0, sb.length() - 2);
    }

    /**
     * Get speed unit string.
     */
    public String getSpeedUnit() {
        return speedUnitMph ? "mph" : "km/h";
    }

    private static String bytesToHex(byte[] bytes) {
        return ProtocolUtils.bytesToHex(bytes);
    }

    @Override
    public String toString() {
        return "ConfigInfo{" +
                "minCruiseSpeed=" + minCruiseSpeed + " " + getSpeedUnit() +
                ", maxSpeedEco=" + maxSpeedEco + " " + getSpeedUnit() +
                ", maxSpeedComfort=" + maxSpeedComfort + " " + getSpeedUnit() +
                ", maxSpeedSport=" + maxSpeedSport + " " + getSpeedUnit() +
                ", softwareVersion='" + softwareVersion + '\'' +
                ", faults=" + getActiveFaults() +
                ", panels=" + getEnabledPanels() +
                '}';
    }
}
