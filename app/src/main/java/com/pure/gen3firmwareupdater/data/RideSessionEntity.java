package com.pure.gen3firmwareupdater.data;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/**
 * Room entity — one row per ride recording session.
 * Created when user presses "Go" or accepts a CS diagnostic request.
 */
@Entity(tableName = "ride_sessions")
public class RideSessionEntity {

    @PrimaryKey
    @NonNull
    @ColumnInfo(name = "id")
    public String id; // Local UUID

    @ColumnInfo(name = "scooter_serial")
    public String scooterSerial;

    @ColumnInfo(name = "scooter_db_id")
    public String scooterDbId;

    @ColumnInfo(name = "trigger_type")
    public String triggerType; // "manual" or "diagnostic"

    @ColumnInfo(name = "started_at")
    public long startedAt; // epoch millis

    @ColumnInfo(name = "ended_at")
    public long endedAt;

    @ColumnInfo(name = "sample_count")
    public int sampleCount;

    @ColumnInfo(name = "max_duration_seconds")
    public int maxDurationSeconds;

    @ColumnInfo(name = "status")
    public String status; // "recording", "completed", "uploaded", "upload_failed"

    @ColumnInfo(name = "remote_session_id")
    public String remoteSessionId; // Supabase UUID after upload

    @ColumnInfo(name = "diagnostic_config_json")
    public String diagnosticConfigJson;
}
