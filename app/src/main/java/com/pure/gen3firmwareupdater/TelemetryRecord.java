package com.pure.gen3firmwareupdater;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Represents a telemetry snapshot from scooter_telemetry table
 * Created during distributor scans, user connections, and firmware updates
 */
public class TelemetryRecord {
    // IDs
    public String id;
    public String scooterId;
    public String distributorId;
    public String userId;

    // Version info at time of scan
    public String hwVersion;
    public String swVersion;
    public String embeddedSerial;

    // 0xA1 BMS Data (voltage, current, battery% come from BMS, not running data)
    public Double voltage;
    public Double current;
    public Integer batterySOC;
    public Integer batteryHealth;
    public Integer batteryChargeCycles;
    public Integer batteryDischargeCycles;
    public Integer remainingCapacityMah;
    public Integer fullCapacityMah;
    public Integer batteryTemp;

    // 0xA0 Running Data (speed, distances, temps, faults)
    public Double speedKmh;
    public Integer odometerKm;
    public Integer motorTemp;
    public Integer controllerTemp;
    public Integer faultCode;
    public Integer gearLevel;
    public Integer tripDistanceKm;
    public Integer remainingRangeKm;
    public Integer motorRpm;
    public Double currentLimit;

    // Metadata
    public String scanType;  // 'distributor_scan', 'user_connection', 'firmware_update'
    public String recordType; // 'start', 'stop', 'riding' — null for legacy records
    public String notes;
    public String scannedAt;

    // Firmware update fields (populated from firmware_uploads table)
    public String fromVersion;
    public String toVersion;
    public String status;
    public String errorMessage;
    public String startedAt;
    public String completedAt;
    public String newVersion;
    public String uploadedAt;  // alias for scannedAt in firmware update context

    // Optional: Distributor/User info (from JOINs)
    public String distributorName;
    public String userName;
    public String userEmail;

    /**
     * Get formatted timestamp for display
     */
    public String getFormattedDate() {
        String timestamp = scannedAt != null ? scannedAt : uploadedAt;
        if (timestamp == null) return "Unknown";
        try {
            SimpleDateFormat inputFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            SimpleDateFormat outputFormat = new SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.US);
            Date date = inputFormat.parse(timestamp);
            return outputFormat.format(date);
        } catch (Exception e) {
            return timestamp;
        }
    }

    /**
     * Get human-readable scan type
     */
    public String getScanTypeDisplay() {
        if (scanType == null) return "Unknown";
        switch (scanType) {
            case "distributor_scan":
                return "Distributor Scan";
            case "user_connection":
                return "User Connection";
            case "firmware_update":
                return "Firmware Update";
            default:
                return scanType;
        }
    }

    /**
     * Get short summary for list display
     */
    public String getSummary() {
        StringBuilder summary = new StringBuilder();
        summary.append(getFormattedDate());

        if (voltage != null || batterySOC != null) {
            summary.append(" • ");
            if (voltage != null) {
                summary.append(String.format("%.1fV", voltage));
            }
            if (batterySOC != null) {
                if (voltage != null) summary.append(", ");
                summary.append(batterySOC).append("%");
            }
        }

        if (odometerKm != null) {
            summary.append(" • ").append(odometerKm).append("km");
        }

        return summary.toString();
    }

    /**
     * Check if this record has meaningful telemetry data
     */
    public boolean hasTelemetryData() {
        return voltage != null || current != null || batterySOC != null ||
               odometerKm != null || batteryHealth != null;
    }

    @Override
    public String toString() {
        return "TelemetryRecord{" +
                "id='" + id + '\'' +
                ", scannedAt='" + scannedAt + '\'' +
                ", scanType='" + scanType + '\'' +
                ", voltage=" + voltage +
                ", batterySOC=" + batterySOC +
                ", odometer=" + odometerKm +
                '}';
    }
}
