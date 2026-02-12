package com.pure.gen3firmwareupdater.data;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.Query;
import androidx.room.Update;

import java.util.List;

/**
 * Room DAO for ride recording data.
 */
@Dao
public interface RideDao {

    // --- Sessions ---

    @Insert
    void insertSession(RideSessionEntity session);

    @Update
    void updateSession(RideSessionEntity session);

    @Query("SELECT * FROM ride_sessions WHERE status = 'recording' LIMIT 1")
    RideSessionEntity getActiveSession();

    @Query("SELECT * FROM ride_sessions WHERE status IN ('completed', 'upload_failed') ORDER BY started_at ASC")
    List<RideSessionEntity> getPendingUploadSessions();

    @Query("SELECT * FROM ride_sessions WHERE id = :sessionId")
    RideSessionEntity getSessionById(String sessionId);

    @Query("DELETE FROM ride_sessions WHERE status = 'uploaded' AND ended_at < :beforeMillis")
    void deleteUploadedSessionsBefore(long beforeMillis);

    @Query("SELECT * FROM ride_sessions WHERE scooter_serial = :scooterSerial")
    List<RideSessionEntity> getSessionsByScooterSerial(String scooterSerial);

    @Query("DELETE FROM ride_sessions WHERE scooter_serial = :scooterSerial")
    void deleteSessionsByScooterSerial(String scooterSerial);

    // --- Samples ---

    @Insert
    void insertSample(RideSampleEntity sample);

    @Query("SELECT * FROM ride_samples WHERE session_id = :sessionId ORDER BY sample_index ASC")
    List<RideSampleEntity> getSamplesForSession(String sessionId);

    @Query("SELECT COUNT(*) FROM ride_samples WHERE session_id = :sessionId")
    int getSampleCountForSession(String sessionId);

    @Query("DELETE FROM ride_samples WHERE session_id = :sessionId")
    void deleteSamplesForSession(String sessionId);

    @Query("UPDATE ride_samples SET uploaded = 1 WHERE session_id = :sessionId")
    void markSamplesUploaded(String sessionId);
}
