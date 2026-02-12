package com.pure.gen3firmwareupdater.services;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.BMSDataInfo;
import com.pure.gen3firmwareupdater.RunningDataInfo;
import com.pure.gen3firmwareupdater.data.AppDatabase;
import com.pure.gen3firmwareupdater.data.RideDao;
import com.pure.gen3firmwareupdater.data.RideSampleEntity;
import com.pure.gen3firmwareupdater.data.RideSessionEntity;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Manages ride recording sessions: start/stop, sample collection, upload.
 * Receives A0/A1 data from dashboard callbacks and stores samples in Room.
 * Singleton registered in ServiceFactory.
 */
public class RideRecordingManager {

    private static final String TAG = "RideRecording";
    private static final int UPLOAD_BATCH_SIZE = 500;

    private final Context appContext;
    private final RideDao dao;
    private final ExecutorService dbExecutor;
    private final Handler mainHandler;

    // Recording state
    private final AtomicBoolean isRecording = new AtomicBoolean(false);
    private RideSessionEntity currentSession;
    private int sampleCounter;
    private long recordingStartMillis;

    // Latest data snapshots (updated on each callback)
    private volatile RunningDataInfo latestA0;
    private volatile BMSDataInfo latestA1;

    // Timer tick runnable
    private RecordingListener listener;
    private final Runnable tickRunnable = new Runnable() {
        @Override
        public void run() {
            if (!isRecording.get() || currentSession == null) return;

            int elapsed = (int) ((System.currentTimeMillis() - recordingStartMillis) / 1000);
            int max = currentSession.maxDurationSeconds;

            if (elapsed >= max) {
                stopRecording();
                return;
            }

            if (listener != null) {
                listener.onRecordingTick(elapsed, max, sampleCounter);
            }
            mainHandler.postDelayed(this, 1000);
        }
    };

    public interface RecordingListener {
        void onRecordingStarted(String sessionId);
        void onRecordingTick(int elapsedSeconds, int maxSeconds, int sampleCount);
        void onRecordingStopped(String sessionId, int totalSamples);
        void onUploadComplete(String sessionId, boolean success);
    }

    public RideRecordingManager(Context context) {
        this.appContext = context.getApplicationContext();
        this.dao = AppDatabase.getInstance(appContext).rideDao();
        this.dbExecutor = Executors.newSingleThreadExecutor();
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    public void setListener(RecordingListener listener) {
        this.listener = listener;
    }

    public boolean isRecording() {
        return isRecording.get();
    }

    public int getElapsedSeconds() {
        if (!isRecording.get()) return 0;
        return (int) ((System.currentTimeMillis() - recordingStartMillis) / 1000);
    }

    public int getMaxDurationSeconds() {
        return currentSession != null ? currentSession.maxDurationSeconds : 0;
    }

    public int getSampleCount() {
        return sampleCounter;
    }

    // ==================================================================================
    // START / STOP
    // ==================================================================================

    /**
     * Start a new recording session.
     *
     * @param triggerType       "manual" or "diagnostic"
     * @param maxDurationSeconds maximum recording duration
     * @param scooterSerial     ZYD serial of connected scooter
     * @param scooterDbId       Supabase UUID of the scooter (can be null)
     * @param diagnosticConfigJson JSON config if diagnostic trigger (can be null)
     */
    public void startRecording(String triggerType, int maxDurationSeconds,
                                String scooterSerial, String scooterDbId,
                                String diagnosticConfigJson) {
        if (isRecording.getAndSet(true)) {
            Log.w(TAG, "Already recording, ignoring start request");
            return;
        }

        sampleCounter = 0;
        recordingStartMillis = System.currentTimeMillis();

        RideSessionEntity session = new RideSessionEntity();
        session.id = UUID.randomUUID().toString();
        session.scooterSerial = scooterSerial;
        session.scooterDbId = scooterDbId;
        session.triggerType = triggerType;
        session.startedAt = recordingStartMillis;
        session.maxDurationSeconds = maxDurationSeconds;
        session.status = "recording";
        session.diagnosticConfigJson = diagnosticConfigJson;
        currentSession = session;

        dbExecutor.execute(() -> {
            dao.insertSession(session);
            Log.d(TAG, "Recording started: " + session.id + " (" + triggerType
                    + ", max " + maxDurationSeconds + "s)");
        });

        mainHandler.post(tickRunnable);

        if (listener != null) {
            mainHandler.post(() -> listener.onRecordingStarted(session.id));
        }
    }

    /**
     * Stop the current recording session.
     */
    public void stopRecording() {
        if (!isRecording.getAndSet(false)) {
            Log.d(TAG, "Not recording, ignoring stop request");
            return;
        }

        mainHandler.removeCallbacks(tickRunnable);

        final RideSessionEntity session = currentSession;
        currentSession = null;
        final int totalSamples = sampleCounter;

        if (session != null) {
            session.endedAt = System.currentTimeMillis();
            session.sampleCount = totalSamples;
            session.status = "completed";

            dbExecutor.execute(() -> {
                dao.updateSession(session);
                Log.d(TAG, "Recording stopped: " + session.id
                        + " (" + totalSamples + " samples)");
            });
        }

        if (listener != null) {
            String sessionId = session != null ? session.id : "";
            mainHandler.post(() -> listener.onRecordingStopped(sessionId, totalSamples));
        }
    }

    // ==================================================================================
    // DATA FEED (called from dashboard BLE callbacks)
    // ==================================================================================

    /**
     * Feed A0 (running data) into the recorder.
     * If recording, combines with latest A1 to create a sample.
     */
    public void onRunningDataReceived(RunningDataInfo data) {
        latestA0 = data;

        if (!isRecording.get() || currentSession == null || data == null) return;

        // Capture a sample on each A0 callback (A0 drives the sample rate)
        final RideSampleEntity sample = new RideSampleEntity();
        sample.sessionId = currentSession.id;
        sample.sampleIndex = sampleCounter++;
        sample.recordedAt = System.currentTimeMillis();

        // A0 fields
        sample.speedKmh = data.currentSpeed;
        sample.motorTemp = data.motorTemp;
        sample.controllerTemp = data.controllerTemp;
        sample.faultCode = data.faultCode;
        sample.gearLevel = data.gearLevel;
        sample.tripDistanceKm = data.tripDistance;
        sample.totalDistanceKm = data.totalDistance;
        sample.remainingRangeKm = data.remainingRange;
        sample.motorRpm = data.motorRPM;
        sample.currentLimit = data.currentLimit;
        sample.controlFlags = data.controlFlags;

        // A1 fields from latest BMS snapshot
        BMSDataInfo bms = latestA1;
        if (bms != null) {
            sample.batteryVoltage = bms.batteryVoltage;
            sample.batteryCurrent = bms.batteryCurrent;
            sample.batteryPercent = bms.batteryPercent;
            sample.batteryTemp = bms.batteryTemperature;
        }

        dbExecutor.execute(() -> dao.insertSample(sample));
    }

    /**
     * Feed A1 (BMS data) into the recorder. Stored as latest snapshot.
     */
    public void onBmsDataReceived(BMSDataInfo data) {
        latestA1 = data;
    }

    // ==================================================================================
    // UPLOAD
    // ==================================================================================

    /**
     * Upload all pending sessions (completed or upload_failed) to Supabase.
     * Fire-and-forget. Called on BLE reconnect.
     */
    public void uploadPendingSessions() {
        dbExecutor.execute(() -> {
            List<RideSessionEntity> pending = dao.getPendingUploadSessions();
            if (pending.isEmpty()) {
                Log.d(TAG, "No pending ride sessions to upload");
                return;
            }

            Log.d(TAG, "Uploading " + pending.size() + " pending ride session(s)");

            for (RideSessionEntity session : pending) {
                try {
                    uploadSession(session);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to upload session " + session.id + ": " + e.getMessage());
                    session.status = "upload_failed";
                    dao.updateSession(session);
                }
            }
        });
    }

    private void uploadSession(RideSessionEntity session) throws Exception {
        List<RideSampleEntity> samples = dao.getSamplesForSession(session.id);
        if (samples.isEmpty()) {
            Log.w(TAG, "Session " + session.id + " has no samples, marking uploaded");
            session.status = "uploaded";
            dao.updateSession(session);
            return;
        }

        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);

        // Build request body
        JsonObject body = new JsonObject();
        body.addProperty("action", "create-ride-session");
        body.addProperty("scooter_id", session.scooterDbId);
        body.addProperty("trigger_type", session.triggerType);
        body.addProperty("started_at", iso.format(new Date(session.startedAt)));
        if (session.endedAt > 0) {
            body.addProperty("ended_at", iso.format(new Date(session.endedAt)));
        }
        body.addProperty("sample_count", samples.size());
        body.addProperty("max_duration_seconds", session.maxDurationSeconds);

        if (session.diagnosticConfigJson != null) {
            body.add("diagnostic_config",
                    com.google.gson.JsonParser.parseString(session.diagnosticConfigJson));
        }

        // Build samples array
        JsonArray samplesArray = new JsonArray();
        for (RideSampleEntity s : samples) {
            JsonObject sampleJson = new JsonObject();
            sampleJson.addProperty("sample_index", s.sampleIndex);
            sampleJson.addProperty("recorded_at", iso.format(new Date(s.recordedAt)));
            sampleJson.addProperty("speed_kmh", s.speedKmh);
            sampleJson.addProperty("motor_temp", s.motorTemp);
            sampleJson.addProperty("controller_temp", s.controllerTemp);
            sampleJson.addProperty("fault_code", s.faultCode);
            sampleJson.addProperty("gear_level", s.gearLevel);
            sampleJson.addProperty("trip_distance_km", s.tripDistanceKm);
            sampleJson.addProperty("total_distance_km", s.totalDistanceKm);
            sampleJson.addProperty("remaining_range_km", s.remainingRangeKm);
            sampleJson.addProperty("motor_rpm", s.motorRpm);
            sampleJson.addProperty("current_limit", s.currentLimit);
            sampleJson.addProperty("control_flags", s.controlFlags);
            sampleJson.addProperty("battery_voltage", s.batteryVoltage);
            sampleJson.addProperty("battery_current", s.batteryCurrent);
            sampleJson.addProperty("battery_percent", s.batteryPercent);
            sampleJson.addProperty("battery_temp", s.batteryTemp);
            samplesArray.add(sampleJson);
        }
        body.add("samples", samplesArray);

        // Call Edge Function
        ServiceFactory.scooterRepo().uploadRideSession(body);

        // Mark uploaded
        session.status = "uploaded";
        dao.updateSession(session);
        dao.markSamplesUploaded(session.id);

        Log.d(TAG, "Ride session uploaded: " + session.id + " (" + samples.size() + " samples)");

        if (listener != null) {
            final String sid = session.id;
            mainHandler.post(() -> listener.onUploadComplete(sid, true));
        }
    }

    /**
     * Delete all local ride sessions and samples for a given scooter serial.
     * Used when user re-records during a diagnostic — old data is replaced.
     *
     * @param scooterSerial ZYD serial to match
     * @param onComplete    callback on main thread when deletion finishes
     */
    public void deleteSessionsForScooter(String scooterSerial, Runnable onComplete) {
        dbExecutor.execute(() -> {
            try {
                List<RideSessionEntity> sessions = dao.getSessionsByScooterSerial(scooterSerial);
                for (RideSessionEntity s : sessions) {
                    dao.deleteSamplesForSession(s.id);
                }
                dao.deleteSessionsByScooterSerial(scooterSerial);
                Log.d(TAG, "Deleted " + sessions.size() + " local session(s) for " + scooterSerial);
            } catch (Exception e) {
                Log.w(TAG, "Error deleting local sessions: " + e.getMessage());
            }
            if (onComplete != null) {
                mainHandler.post(onComplete);
            }
        });
    }

    /**
     * Clean up uploaded sessions older than 7 days from local Room DB.
     * Called periodically (e.g., on app start).
     */
    public void cleanupOldSessions() {
        dbExecutor.execute(() -> {
            long sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000);
            dao.deleteUploadedSessionsBefore(sevenDaysAgo);
            Log.d(TAG, "Cleaned up old uploaded sessions");
        });
    }
}
