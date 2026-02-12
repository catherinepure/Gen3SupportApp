package com.pure.gen3firmwareupdater.data;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/**
 * Room entity — one combined A0+A1 sample per row.
 * Compact fields only (things that change during a ride).
 */
@Entity(
    tableName = "ride_samples",
    indices = {
        @Index("session_id"),
        @Index("uploaded")
    }
)
public class RideSampleEntity {

    @PrimaryKey(autoGenerate = true)
    public long id;

    @NonNull
    @ColumnInfo(name = "session_id")
    public String sessionId;

    @ColumnInfo(name = "sample_index")
    public int sampleIndex;

    @ColumnInfo(name = "recorded_at")
    public long recordedAt; // epoch millis

    @ColumnInfo(name = "uploaded")
    public boolean uploaded;

    // A0 fields
    @ColumnInfo(name = "speed_kmh")
    public int speedKmh;

    @ColumnInfo(name = "motor_temp")
    public int motorTemp;

    @ColumnInfo(name = "controller_temp")
    public int controllerTemp;

    @ColumnInfo(name = "fault_code")
    public int faultCode;

    @ColumnInfo(name = "gear_level")
    public int gearLevel;

    @ColumnInfo(name = "trip_distance_km")
    public int tripDistanceKm;

    @ColumnInfo(name = "total_distance_km")
    public int totalDistanceKm;

    @ColumnInfo(name = "remaining_range_km")
    public int remainingRangeKm;

    @ColumnInfo(name = "motor_rpm")
    public int motorRpm;

    @ColumnInfo(name = "current_limit")
    public double currentLimit;

    @ColumnInfo(name = "control_flags")
    public int controlFlags;

    // A1 fields
    @ColumnInfo(name = "battery_voltage")
    public double batteryVoltage;

    @ColumnInfo(name = "battery_current")
    public double batteryCurrent;

    @ColumnInfo(name = "battery_percent")
    public int batteryPercent;

    @ColumnInfo(name = "battery_temp")
    public int batteryTemp;
}
