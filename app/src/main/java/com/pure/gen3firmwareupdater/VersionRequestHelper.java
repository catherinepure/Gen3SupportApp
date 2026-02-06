package com.pure.gen3firmwareupdater;

import android.os.Handler;
import android.util.Log;

/**
 * Reusable helper for sending version/telemetry requests (A0, B0, A1)
 * with retry logic. Used by both ScanScooterActivity and FirmwareUpdaterActivity.
 *
 * Usage:
 *   helper = new VersionRequestHelper(bleManager, handler, () -> shouldRetry());
 *   helper.setListener(new VersionRequestHelper.Listener() { ... });
 *   helper.start();
 *
 * Call helper.cancel() when done or when version is received.
 */
public class VersionRequestHelper {

    private static final String TAG = "VersionRequestHelper";
    private static final int MAX_RETRIES = 3;
    private static final long RETRY_DELAY_MS = 3000;
    private static final long B0_DELAY_MS = 300;
    private static final long A1_DELAY_MS = 600;

    public interface ShouldRetryCheck {
        boolean shouldRetry();
    }

    public interface Listener {
        void onMaxRetriesReached();
    }

    private final BLEManager bleManager;
    private final Handler handler;
    private final ShouldRetryCheck shouldRetryCheck;
    private Listener listener;

    private int retryCount = 0;
    private boolean cancelled = false;

    public VersionRequestHelper(BLEManager bleManager, Handler handler, ShouldRetryCheck shouldRetryCheck) {
        this.bleManager = bleManager;
        this.handler = handler;
        this.shouldRetryCheck = shouldRetryCheck;
    }

    public void setListener(Listener listener) {
        this.listener = listener;
    }

    /**
     * Start sending version requests with automatic retries.
     */
    public void start() {
        retryCount = 0;
        cancelled = false;
        sendRequest();
    }

    /**
     * Cancel any pending retries. Call this when version info is received
     * or when the activity is being destroyed.
     */
    public void cancel() {
        cancelled = true;
    }

    public void reset() {
        retryCount = 0;
        cancelled = false;
    }

    private void sendRequest() {
        if (cancelled) return;
        if (retryCount >= MAX_RETRIES) {
            Log.w(TAG, "Max version request retries reached (" + MAX_RETRIES + ")");
            if (listener != null) listener.onMaxRetriesReached();
            return;
        }

        retryCount++;
        Log.d(TAG, "Sending version request (attempt " + retryCount + "/" + MAX_RETRIES + ")");

        // A0 - Running data (wakes up the protocol)
        boolean a0Sent = bleManager.requestRunningData();
        Log.d(TAG, "A0 running data request sent: " + a0Sent);

        // B0 - Version info (after short delay)
        handler.postDelayed(() -> {
            if (cancelled) return;
            boolean b0Sent = bleManager.requestVersionInfo();
            Log.d(TAG, "B0 version request sent: " + b0Sent);
        }, B0_DELAY_MS);

        // A1 - BMS data (after slightly longer delay)
        handler.postDelayed(() -> {
            if (cancelled) return;
            boolean a1Sent = bleManager.requestBMSData();
            Log.d(TAG, "A1 BMS data request sent: " + a1Sent);
        }, A1_DELAY_MS);

        // Retry after delay if no response
        handler.postDelayed(() -> {
            if (cancelled) return;
            if (shouldRetryCheck.shouldRetry()) {
                Log.w(TAG, "No B0 version response after " + RETRY_DELAY_MS + "ms, retrying...");
                sendRequest();
            }
        }, RETRY_DELAY_MS);
    }
}
