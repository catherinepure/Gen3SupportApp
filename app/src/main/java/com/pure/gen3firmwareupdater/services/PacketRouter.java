package com.pure.gen3firmwareupdater.services;

import com.pure.gen3firmwareupdater.BMSDataInfo;
import com.pure.gen3firmwareupdater.ConfigInfo;
import com.pure.gen3firmwareupdater.RunningDataInfo;
import com.pure.gen3firmwareupdater.VersionInfo;

/**
 * Platform-independent BLE packet routing.
 * Receives raw BLE notification data and dispatches parsed results
 * to the appropriate listener callback.
 *
 * No Android imports - 100% portable to React Native / Flutter.
 *
 * Packet format: [header, command, ...data..., CRC_LSB, CRC_MSB]
 * The command byte (index 1) determines the packet type.
 */
public class PacketRouter {

    /**
     * Listener interface for receiving parsed packet data.
     * Activities or services implement this to receive structured data.
     */
    public interface PacketListener {
        /** Called when a B0 version info packet is successfully parsed. */
        void onVersionInfo(VersionInfo version);

        /** Called when a 0x01 configuration/settings packet is successfully parsed. */
        void onConfigInfo(ConfigInfo config);

        /** Called when a 0xA0 running data packet is successfully parsed. */
        void onRunningData(RunningDataInfo data);

        /** Called when a 0xA1 BMS battery data packet is successfully parsed. */
        void onBMSData(BMSDataInfo data);

        /** Called when a packet with an unrecognized command byte is received. */
        void onUnknownPacket(int packetType, byte[] data);
    }

    private PacketListener listener;

    public PacketRouter(PacketListener listener) {
        this.listener = listener;
    }

    public void setListener(PacketListener listener) {
        this.listener = listener;
    }

    /**
     * Route a raw BLE packet to the appropriate parser.
     * Inspects byte[1] (command byte) and dispatches to the correct parser class.
     *
     * @param data raw bytes from BLE notification (FFF2 characteristic)
     */
    public void routePacket(byte[] data) {
        if (data == null || data.length < 2) return;
        if (listener == null) return;

        int packetType = data[1] & 0xFF;

        switch (packetType) {
            case 0xB0: {
                VersionInfo version = VersionInfo.parseFromB0Packet(data);
                if (version != null) {
                    listener.onVersionInfo(version);
                }
                break;
            }
            case 0x01: {
                ConfigInfo config = ConfigInfo.parse(data);
                if (config != null) {
                    listener.onConfigInfo(config);
                }
                break;
            }
            case 0xA0: {
                RunningDataInfo running = RunningDataInfo.parse(data);
                if (running != null) {
                    listener.onRunningData(running);
                }
                break;
            }
            case 0xA1: {
                BMSDataInfo bms = BMSDataInfo.parse(data);
                if (bms != null) {
                    listener.onBMSData(bms);
                }
                break;
            }
            default:
                listener.onUnknownPacket(packetType, data);
                break;
        }
    }

    /**
     * Get a human-readable name for a packet type code.
     * Useful for logging and debug displays.
     *
     * @param packetType the command byte value (0xB0, 0xA0, etc.)
     * @return descriptive name string
     */
    public static String getPacketName(int packetType) {
        switch (packetType) {
            case 0x00: return "00 (Real-time Data)";
            case 0x01: return "01 (Config/Settings)";
            case 0xA0: return "A0 (Running Data)";
            case 0xA1: return "A1 (BMS Data)";
            case 0xA2: return "A2 (Trip Data)";
            case 0xB0: return "B0 (Version Info)";
            case 0xD0: return "D0 (FW Request)";
            case 0xD1: return "D1 (FW Erase)";
            case 0xD2: return "D2 (FW Data)";
            case 0xD3: return "D3 (FW Complete)";
            default: return String.format("0x%02X (Unknown)", packetType);
        }
    }
}
