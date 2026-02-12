package com.pure.gen3firmwareupdater;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.google.firebase.messaging.FirebaseMessaging;

import android.widget.ProgressBar;
import android.widget.Toast;

import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.services.DeviceTokenManager;
import com.pure.gen3firmwareupdater.services.PermissionHelper;
import com.pure.gen3firmwareupdater.services.RideRecordingManager;
import com.pure.gen3firmwareupdater.services.ScooterConnectionService;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.SupabaseBaseRepository;
import com.pure.gen3firmwareupdater.services.TelemetryQueueManager;
import com.pure.gen3firmwareupdater.services.TermsManager;
import com.pure.gen3firmwareupdater.services.UserSettingsManager;
import com.pure.gen3firmwareupdater.views.BatteryGaugeView;
import com.pure.gen3firmwareupdater.views.SpeedGaugeView;

import io.intercom.android.sdk.Intercom;
import io.intercom.android.sdk.identity.Registration;

import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Dashboard activity for normal (non-distributor) users.
 * Shows real-time scooter telemetry and provides control toggles.
 *
 * Visual states: DISCONNECTED → CONNECTING → CONNECTED
 */
public class UserDashboardActivity extends AppCompatActivity
        implements ScooterConnectionService.ConnectionListener {

    private static final String TAG = "UserDashboard";
    private static final int PERMISSION_REQUEST_CODE = 300;
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 301;
    private static final int REQUEST_CODE_TERMS = 1002;
    private static final long TELEMETRY_POLL_INTERVAL_MS = 2000;
    private static final long RECORDING_POLL_INTERVAL_MS = 1000;
    private static final int DEFAULT_RECORDING_DURATION_SECONDS = 300; // 5 minutes
    private static final long FAULT_DEDUP_INTERVAL_MS = 30_000; // 30 seconds

    private enum State { DISCONNECTED, CONNECTING, CONNECTED }

    // Services
    private ScooterConnectionService connectionService;
    private SessionManager session;
    private TermsManager termsManager;
    private UserSettingsManager userSettings;
    private final Handler handler = new Handler(Looper.getMainLooper());

    // State
    private State currentState = State.DISCONNECTED;
    private int lastControlFlags = 0;
    private int lastCruiseSpeed = 0;
    private int lastMaxSpeed = 25;
    private final AtomicBoolean pollingActive = new AtomicBoolean(false);
    private final AtomicBoolean updatingToggles = new AtomicBoolean(false); // Prevents toggle listener feedback loop
    private boolean autoConnectAttempted = false; // Only attempt auto-connect once per scan
    private boolean devicePickerShown = false; // Prevent duplicate device picker dialogs
    private volatile boolean intercomUserReady = false; // True once loginIdentifiedUser succeeds

    // Stored BLE data for passing to ScooterDetailsActivity
    private String connectedDeviceName; // ZYD serial (BLE device name) — used as DB key
    private VersionInfo storedVersion;
    private RunningDataInfo storedRunningData;
    private BMSDataInfo storedBMSData;

    // Stop telemetry guard — prevents duplicate stop records
    private final AtomicBoolean stopRecordCreated = new AtomicBoolean(false);

    // Snapshot fields for stop telemetry (saved on connect, updated on each A0/A1 callback)
    private String savedScooterSerial;
    private String savedDistributorId;
    private VersionInfo savedVersion;
    private RunningDataInfo savedRunningData;
    private BMSDataInfo savedBMSData;
    private String savedEmbeddedSerial;

    // PIN / Lock state
    private String scooterDbId;         // UUID from scooters table (looked up on connect)
    private boolean scooterHasPin;      // Whether this scooter has a PIN set

    // Fault capture state
    private int lastReportedFaultCode = 0;
    private long lastFaultReportTimeMs = 0;
    private boolean faultCaptureEnabled = true;

    // Recording poll interval (switches between 2s and 1s during recording)
    private long currentPollInterval = TELEMETRY_POLL_INTERVAL_MS;

    // UI - Header
    private View statusDot;
    private TextView tvConnectionStatus;
    private ImageButton btnSettings;
    private MaterialButton btnLogout;

    // UI - Disconnected state
    private View layoutDisconnected;
    private MaterialButton btnConnect;

    // UI - Connecting state
    private View layoutConnecting;
    private TextView tvConnectingStatus;

    // UI - Connected state
    private View layoutConnected;
    private SpeedGaugeView speedGauge;
    private BatteryGaugeView batteryGauge;
    private TextView tvOdometer;
    private TextView tvRange;
    private MaterialSwitch switchHeadlight;
    private MaterialSwitch switchCruise;
    private MaterialSwitch switchLock;
    private MaterialButton btnScooterDetails;
    private MaterialButton btnDisconnect;

    // UI - Recording
    private View cardRecording;
    private View layoutRecordIdle;
    private View layoutRecordActive;
    private MaterialButton btnRecordGo;
    private MaterialButton btnRecordStop;
    private TextView tvRecordTitle;
    private TextView tvRecordSubtitle;
    private TextView tvRecordingTimer;
    private TextView tvSampleCount;
    private ProgressBar progressRecording;

    // Diagnostic recording state
    private boolean diagnosticActive = false;
    private String diagnosticConfigJson = null;
    private int diagnosticRecordingCount = 0;
    private int diagnosticMaxRecordings = 1;

    // Telemetry polling runnable
    private final Runnable telemetryPoller = new Runnable() {
        @Override
        public void run() {
            if (connectionService != null && connectionService.isConnected()) {
                BLEManager ble = connectionService.getBLEManager();
                if (ble != null) {
                    ble.requestRunningData();
                    // Stagger BMS request to avoid BLE write collision
                    handler.postDelayed(() -> {
                        if (connectionService != null && connectionService.isConnected()) {
                            BLEManager ble2 = connectionService.getBLEManager();
                            if (ble2 != null) {
                                ble2.requestBMSData();
                            }
                        }
                    }, 300);
                }
            }
            if (pollingActive.get()) {
                handler.postDelayed(this, currentPollInterval);
            }
        }
    };

    // ==================================================================================
    // LIFECYCLE
    // ==================================================================================

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark status bar
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(getColor(R.color.dashboard_bg));

        setContentView(R.layout.activity_user_dashboard);

        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        termsManager = ServiceFactory.getTermsManager();
        userSettings = ServiceFactory.getUserSettingsManager();

        initViews();
        setupListeners();

        // Prevent going back to login
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Do nothing — user must use Logout button
            }
        });

        // T&C check — always check if user hasn't accepted yet (no throttle),
        // otherwise respect the 24-hour interval
        if (session.getUserId() != null) {
            checkTermsAcceptance();
        }

        // If there's already an active BLE connection (e.g., from a previous session),
        // attach to it
        if (ServiceFactory.isConnectionServiceActive()) {
            connectionService = ServiceFactory.getConnectionService(this, handler);
            connectionService.setListener(this);
            setState(State.CONNECTED);
            startTelemetryPolling();
        }

        // Ensure user is registered with Intercom (needed when app auto-routes
        // here via RegistrationChoiceActivity, bypassing LoginActivity)
        ensureIntercomRegistered();

        // Register FCM token with Supabase (covers auto-login bypass path)
        ensureFcmTokenRegistered();

        // Request notification permission for Intercom push (Android 13+)
        requestNotificationPermission();
    }

    private void requestNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                    != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(
                        new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                        NOTIFICATION_PERMISSION_REQUEST_CODE);
            }
        }
    }

    /**
     * Register FCM token with Supabase for custom push notifications.
     * Covers the auto-login path that bypasses LoginActivity.
     */
    private void ensureFcmTokenRegistered() {
        if (session.getSessionToken() == null) return;
        FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    Log.d(TAG, "FCM token obtained, registering with Supabase");
                    new DeviceTokenManager().registerToken(token);
                })
                .addOnFailureListener(e ->
                        Log.w(TAG, "Failed to get FCM token", e));
    }

    /**
     * Register the current user with Intercom so the messenger works.
     * This is idempotent — calling it when already registered is a no-op.
     * Needed because users who are already logged in bypass LoginActivity
     * and go straight to this dashboard via RegistrationChoiceActivity.
     */
    private void ensureIntercomRegistered() {
        if (!Gen3FirmwareUpdaterApp.isIntercomInitialized()) return;
        String userId = session.getUserId();
        if (userId == null) {
            Log.w(TAG, "Intercom: no userId in session, skipping registration");
            return;
        }

        // The Intercom SDK persists login state across app launches.
        // Calling loginIdentifiedUser() when already registered causes a
        // "user already exists" error. Track state in SharedPreferences.
        boolean alreadyRegistered = Gen3FirmwareUpdaterApp.isIntercomUserRegistered(userId);

        if (alreadyRegistered) {
            Log.d(TAG, "Intercom user already registered, showing launcher");
            intercomUserReady = true;
            Intercom.client().setLauncherVisibility(Intercom.Visibility.VISIBLE);
            return;
        }

        doIntercomLogin(userId, true);
    }

    /**
     * Attempt Intercom loginIdentifiedUser. If it fails with "user already exists",
     * logout the stale SDK session and retry once cleanly.
     */
    private void doIntercomLogin(String userId, boolean canRetry) {
        try {
            Registration registration = Registration.create().withUserId(userId);
            Intercom.client().loginIdentifiedUser(registration, new io.intercom.android.sdk.IntercomStatusCallback() {
                @Override
                public void onSuccess() {
                    Log.d(TAG, "Intercom user registered: " + userId);
                    intercomUserReady = true;

                    Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);

                    io.intercom.android.sdk.UserAttributes userAttributes =
                            new io.intercom.android.sdk.UserAttributes.Builder()
                                    .withEmail(session.getUserEmail())
                                    .withCustomAttribute("role", session.getUserRole() != null ? session.getUserRole() : "normal")
                                    .withCustomAttribute("app_version", BuildConfig.VERSION_NAME)
                                    .build();
                    Intercom.client().updateUser(userAttributes);

                    runOnUiThread(() -> {
                        if (!isDestroyed() && !isFinishing()) {
                            Intercom.client().setLauncherVisibility(Intercom.Visibility.VISIBLE);
                        }
                    });
                }

                @Override
                public void onFailure(io.intercom.android.sdk.IntercomError intercomError) {
                    Log.w(TAG, "Intercom registration failed: " + intercomError.getErrorMessage());

                    if (canRetry) {
                        // SDK has stale state — logout and retry once
                        Log.d(TAG, "Clearing stale Intercom session and retrying login");
                        Intercom.client().logout();
                        runOnUiThread(() -> {
                            if (!isDestroyed() && !isFinishing()) {
                                doIntercomLogin(userId, false);
                            }
                        });
                    } else {
                        // Retry also failed — mark as registered anyway
                        Log.w(TAG, "Intercom retry also failed, showing launcher anyway");
                        intercomUserReady = true;
                        Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);

                        runOnUiThread(() -> {
                            if (!isDestroyed() && !isFinishing()) {
                                Intercom.client().setLauncherVisibility(Intercom.Visibility.VISIBLE);
                            }
                        });
                    }
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "Intercom registration error", e);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Show Intercom launcher only if user registration has completed
        // (prevents "no user registered" error if tapped before async login finishes)
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized() && intercomUserReady) {
            Intercom.client().setLauncherVisibility(Intercom.Visibility.VISIBLE);
        }

        // Re-attach as BLE listener when returning from ScooterDetailsActivity
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.setListener(this);
            if (!pollingActive.get()) {
                startTelemetryPolling();
            }
        } else if (connectionService != null && !connectionService.isConnected()) {
            // Connection was lost or released while away
            setState(State.DISCONNECTED);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        // Hide Intercom launcher when leaving dashboard
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
            Intercom.client().setLauncherVisibility(Intercom.Visibility.GONE);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopTelemetryPolling();
        if (connectionService != null) {
            connectionService.setListener(null);
        }
        handler.removeCallbacksAndMessages(null);
    }

    // ==================================================================================
    // VIEW INITIALIZATION
    // ==================================================================================

    private void initViews() {
        // Header
        statusDot = findViewById(R.id.statusDot);
        tvConnectionStatus = findViewById(R.id.tvConnectionStatus);
        btnSettings = findViewById(R.id.btnSettings);
        btnLogout = findViewById(R.id.btnLogout);

        // Disconnected
        layoutDisconnected = findViewById(R.id.layoutDisconnected);
        btnConnect = findViewById(R.id.btnConnect);

        // Connecting
        layoutConnecting = findViewById(R.id.layoutConnecting);
        tvConnectingStatus = findViewById(R.id.tvConnectingStatus);

        // Connected
        layoutConnected = findViewById(R.id.layoutConnected);
        speedGauge = findViewById(R.id.speedGauge);
        batteryGauge = findViewById(R.id.batteryGauge);
        tvOdometer = findViewById(R.id.tvOdometer);
        tvRange = findViewById(R.id.tvRange);
        switchHeadlight = findViewById(R.id.switchHeadlight);
        switchCruise = findViewById(R.id.switchCruise);
        switchLock = findViewById(R.id.switchLock);
        btnScooterDetails = findViewById(R.id.btnScooterDetails);
        btnDisconnect = findViewById(R.id.btnDisconnect);

        // Recording
        cardRecording = findViewById(R.id.cardRecording);
        layoutRecordIdle = findViewById(R.id.layoutRecordIdle);
        layoutRecordActive = findViewById(R.id.layoutRecordActive);
        btnRecordGo = findViewById(R.id.btnRecordGo);
        btnRecordStop = findViewById(R.id.btnRecordStop);
        tvRecordTitle = findViewById(R.id.tvRecordTitle);
        tvRecordSubtitle = findViewById(R.id.tvRecordSubtitle);
        tvRecordingTimer = findViewById(R.id.tvRecordingTimer);
        tvSampleCount = findViewById(R.id.tvSampleCount);
        progressRecording = findViewById(R.id.progressRecording);
    }

    private void setupListeners() {
        btnConnect.setOnClickListener(v -> startScanAndConnect());
        btnScooterDetails.setOnClickListener(v -> openScooterDetails());
        btnDisconnect.setOnClickListener(v -> disconnectScooter());
        btnSettings.setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));
        btnLogout.setOnClickListener(v -> logout());

        btnRecordGo.setOnClickListener(v -> onRecordGoTapped());
        btnRecordStop.setOnClickListener(v -> stopRideRecording());

        switchHeadlight.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles.get()) {
                toggleHeadlight(isChecked);
            }
        });
        switchCruise.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles.get()) {
                toggleCruise(isChecked);
            }
        });
        switchLock.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles.get()) {
                toggleLock(isChecked);
            }
        });
    }

    // ==================================================================================
    // STATE MANAGEMENT
    // ==================================================================================

    private void setState(State state) {
        currentState = state;
        runOnUiThread(() -> {
            layoutDisconnected.setVisibility(state == State.DISCONNECTED ? View.VISIBLE : View.GONE);
            layoutConnecting.setVisibility(state == State.CONNECTING ? View.VISIBLE : View.GONE);
            layoutConnected.setVisibility(state == State.CONNECTED ? View.VISIBLE : View.GONE);

            switch (state) {
                case DISCONNECTED:
                    statusDot.setBackgroundResource(R.drawable.circle_red);
                    tvConnectionStatus.setText("Disconnected");
                    break;
                case CONNECTING:
                    statusDot.setBackgroundResource(R.drawable.circle_red);
                    tvConnectionStatus.setText("Connecting...");
                    break;
                case CONNECTED:
                    statusDot.setBackgroundResource(R.drawable.circle_green);
                    tvConnectionStatus.setText("Connected");
                    break;
            }
        });
    }

    // ==================================================================================
    // BLE SCAN & CONNECT
    // ==================================================================================

    private void startScanAndConnect() {
        // Check permissions first
        List<String> needed = PermissionHelper.getNeededBLEPermissions(this);
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
            return;
        }

        setState(State.CONNECTING);
        tvConnectingStatus.setText("Scanning for scooters...");
        devicePickerShown = false; // Reset so picker can show for this new scan
        autoConnectAttempted = false;

        connectionService = ServiceFactory.getConnectionService(this, handler);
        connectionService.setListener(this);
        connectionService.startScan();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (PermissionHelper.hasAllBLEPermissions(this)) {
                startScanAndConnect();
            } else {
                setState(State.DISCONNECTED);
            }
        }
    }

    private void showDevicePicker(List<ScanResult> devices) {
        if (devicePickerShown) return; // Prevent duplicate picker if scan fires twice
        devicePickerShown = true;

        String[] names = new String[devices.size()];
        for (int i = 0; i < devices.size(); i++) {
            BluetoothDevice d = devices.get(i).getDevice();
            String name = d.getName() != null ? d.getName() : "Unknown";
            int rssi = devices.get(i).getRssi();
            names[i] = name + " (RSSI: " + rssi + " dBm)";
        }

        runOnUiThread(() -> {
            new AlertDialog.Builder(this)
                    .setTitle("Select Scooter")
                    .setItems(names, (dialog, which) -> {
                        tvConnectingStatus.setText("Connecting...");
                        connectionService.connectToDevice(devices.get(which).getDevice());
                    })
                    .setNegativeButton("Cancel", (dialog, which) -> setState(State.DISCONNECTED))
                    .setCancelable(false)
                    .show();
        });
    }

    private void disconnectScooter() {
        // Auto-stop recording if active
        if (ServiceFactory.getRideRecordingManager().isRecording()) {
            stopRideRecording();
        }
        stopTelemetryPolling();
        // Create stop telemetry BEFORE releasing connection service
        // (releaseConnectionService nulls scooterDbId and connectionService)
        createStopTelemetry();
        ServiceFactory.releaseConnectionService();
        connectionService = null;
        scooterDbId = null;
        scooterHasPin = false;
        autoConnectAttempted = false;
        devicePickerShown = false;

        // Reset diagnostic state and hide recording card
        diagnosticActive = false;
        diagnosticConfigJson = null;
        diagnosticRecordingCount = 0;
        diagnosticMaxRecordings = 1;
        cardRecording.setVisibility(View.GONE);

        setState(State.DISCONNECTED);

        // Reset gauges
        speedGauge.setSpeed(0);
        batteryGauge.setBatteryPercent(0);
        tvOdometer.setText("0 km");
        tvRange.setText("0 km");
        updatingToggles.set(true);
        switchHeadlight.setChecked(false);
        switchCruise.setChecked(false);
        switchLock.setChecked(false);
        updatingToggles.set(false);
    }

    private void logout() {
        stopTelemetryPolling();
        if (connectionService != null) {
            ServiceFactory.releaseConnectionService();
            connectionService = null;
        }
        // Unregister device token before clearing session (needs session token)
        try {
            new DeviceTokenManager().unregisterToken();
        } catch (Exception e) {
            Log.w(TAG, "Failed to unregister device token", e);
        }
        session.clearSession();
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
            Intercom.client().logout();
            Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
        }

        Intent intent = new Intent(this, RegistrationChoiceActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    // ==================================================================================
    // TERMS & CONDITIONS CHECK
    // ==================================================================================

    private void checkTermsAcceptance() {
        String userId = session.getUserId();
        String sessionToken = session.getSessionToken();
        if (userId == null || sessionToken == null) return;

        termsManager.checkAcceptanceStatus(userId, sessionToken,
                new TermsManager.TermsCallback<TermsManager.ConsentCheckResult>() {
                    @Override
                    public void onSuccess(TermsManager.ConsentCheckResult result) {
                        runOnUiThread(() -> {
                            if (result.needsAcceptance && result.termsUrl != null) {
                                Log.d(TAG, "User needs to accept T&C version " + result.latestVersion);
                                launchTermsAcceptance(result);
                            } else {
                                Log.d(TAG, "T&C up-to-date");
                            }
                        });
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "T&C check failed (non-blocking): " + error);
                    }
                });
    }

    private void launchTermsAcceptance(TermsManager.ConsentCheckResult result) {
        Intent intent = new Intent(this, TermsAcceptanceActivity.class);
        intent.putExtra("terms_url", result.termsUrl);
        intent.putExtra("terms_id", result.termsId);
        intent.putExtra("version", result.latestVersion);
        intent.putExtra("language_code", result.language != null ? result.language : "en");
        intent.putExtra("region_code", result.region != null ? result.region : "US");
        intent.putExtra("document_type", "terms");
        intent.putExtra("title", result.termsTitle != null ? result.termsTitle : "Terms & Conditions");
        intent.putExtra("user_id", session.getUserId());
        intent.putExtra("session_token", session.getSessionToken());
        startActivityForResult(intent, REQUEST_CODE_TERMS);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_TERMS) {
            if (resultCode == RESULT_OK) {
                Toast.makeText(this, "Thank you for accepting the Terms & Conditions", Toast.LENGTH_SHORT).show();
            } else {
                new AlertDialog.Builder(this)
                        .setTitle("Terms & Conditions Required")
                        .setMessage("You must accept the Terms & Conditions to use this app.")
                        .setPositiveButton("Try Again", (dialog, which) -> checkTermsAcceptance())
                        .setNegativeButton("Logout", (dialog, which) -> logout())
                        .setCancelable(false)
                        .show();
            }
        }
    }

    // ==================================================================================
    // NAVIGATION
    // ==================================================================================

    private void openScooterDetails() {
        if (connectionService == null || !connectionService.isConnected()) {
            Log.w(TAG, "Cannot open details - not connected");
            return;
        }

        Intent intent = new Intent(this, ScooterDetailsActivity.class);
        // Use device name (ZYD serial) — this is the key in the scooters table (zyd_serial)
        intent.putExtra("scooter_serial", connectedDeviceName != null
                ? connectedDeviceName : connectionService.getConnectedDeviceName());
        intent.putExtra("connected_mode", true);

        // Version data
        VersionInfo version = storedVersion != null ? storedVersion : connectionService.getScooterVersion();
        if (version != null) {
            intent.putExtra("hw_version", version.controllerHwVersion);
            intent.putExtra("sw_version", version.controllerSwVersion);
        }

        // BMS data
        BMSDataInfo bms = storedBMSData != null ? storedBMSData : connectionService.getBMSData();
        if (bms != null) {
            intent.putExtra("voltage", bms.batteryVoltage);
            intent.putExtra("current", bms.batteryCurrent);
            intent.putExtra("battery_percent", bms.batteryPercent);
            intent.putExtra("battery_soc", bms.batteryPercent);
            intent.putExtra("battery_health", bms.batteryHealth);
            intent.putExtra("charge_cycles", bms.chargeCycles);
        }

        // Running data
        RunningDataInfo running = storedRunningData != null ? storedRunningData : connectionService.getRunningData();
        if (running != null) {
            intent.putExtra("odometer", running.totalDistance);
        }

        startActivity(intent);
    }

    // ==================================================================================
    // TELEMETRY POLLING
    // ==================================================================================

    private void startTelemetryPolling() {
        if (pollingActive.getAndSet(true)) return;
        handler.post(telemetryPoller);
        Log.d(TAG, "Telemetry polling started");
    }

    private void stopTelemetryPolling() {
        pollingActive.set(false);
        handler.removeCallbacks(telemetryPoller);
        Log.d(TAG, "Telemetry polling stopped");
    }

    // ==================================================================================
    // SCOOTER PIN LOOKUP
    // ==================================================================================

    /**
     * Look up the scooter's database ID and PIN status after BLE connection.
     * Runs in background. Sets scooterDbId and scooterHasPin for lock toggle.
     */
    private void lookupScooterPinStatus(String zydSerial) {
        ServiceFactory.scooterRepo().getScooterBySerial(zydSerial,
                new SupabaseBaseRepository.Callback<com.google.gson.JsonObject>() {
                    @Override
                    public void onSuccess(com.google.gson.JsonObject scooter) {
                        scooterDbId = scooter.has("id") ? scooter.get("id").getAsString() : null;
                        scooterHasPin = scooter.has("pin_encrypted")
                                && !scooter.get("pin_encrypted").isJsonNull();
                        // Read fault_capture_disabled flag
                        faultCaptureEnabled = !(scooter.has("fault_capture_disabled")
                                && !scooter.get("fault_capture_disabled").isJsonNull()
                                && scooter.get("fault_capture_disabled").getAsBoolean());

                        Log.d(TAG, "Scooter DB lookup: id=" + scooterDbId
                                + " hasPin=" + scooterHasPin
                                + " faultCapture=" + faultCaptureEnabled);

                        // Check if CS team has requested diagnostics for this scooter
                        boolean diagRequested = scooter.has("diagnostic_requested")
                                && !scooter.get("diagnostic_requested").isJsonNull()
                                && scooter.get("diagnostic_requested").getAsBoolean();
                        if (diagRequested && scooter.has("diagnostic_config")
                                && !scooter.get("diagnostic_config").isJsonNull()) {
                            JsonObject config = scooter.get("diagnostic_config").getAsJsonObject();
                            runOnUiThread(() -> {
                                if (!isDestroyed() && !isFinishing()) {
                                    showDiagnosticConsentDialog(config);
                                }
                            });
                        }
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Could not look up scooter: " + error);
                        scooterDbId = null;
                        scooterHasPin = false;
                    }
                });
    }

    // ==================================================================================
    // CONTROL COMMANDS (0xC0)
    // ==================================================================================

    private void toggleHeadlight(boolean on) {
        int newFlags = on
                ? (lastControlFlags | 0x0010)
                : (lastControlFlags & ~0x0010);
        sendControlCommand(newFlags);
    }

    private void toggleCruise(boolean on) {
        int newFlags = on
                ? (lastControlFlags | 0x0020)
                : (lastControlFlags & ~0x0020);
        sendControlCommand(newFlags);
    }

    private void toggleLock(boolean on) {
        // Revert the toggle immediately — we'll set it again after PIN verification
        updatingToggles.set(true);
        switchLock.setChecked(!on);
        updatingToggles.set(false);

        if (scooterDbId == null) {
            Log.w(TAG, "No scooter DB ID — cannot check PIN");
            sendLockCommand(on);
            return;
        }

        // Check PIN status and prompt accordingly
        checkPinAndLock(on);
    }

    /**
     * Check if the scooter has a PIN. If yes, prompt for entry. If no, prompt for setup.
     */
    private void checkPinAndLock(boolean locking) {
        // Use the cached PIN status — it was looked up on connect
        if (scooterHasPin) {
            // PIN exists: ask user to enter it
            showPinEntryDialog(locking);
        } else {
            // No PIN: ask user to create one
            showPinSetupForLock(locking);
        }
    }

    private void showPinEntryDialog(boolean isLocking) {
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Log.e(TAG, "No session token for PIN verification");
            return;
        }

        PinEntryDialog dialog = PinEntryDialog.newInstance(scooterDbId, sessionToken, isLocking);
        dialog.setPinEntryListener(new PinEntryDialog.PinEntryListener() {
            @Override
            public void onPinVerified(boolean isLocking) {
                sendLockCommand(isLocking);
            }

            @Override
            public void onPinCancelled() {
                // Toggle stays in its original position (already reverted)
                Log.d(TAG, "Lock PIN entry cancelled");
            }

            @Override
            public void onPinNotSet(boolean isLocking) {
                // PIN was cleared remotely — update local state and show setup dialog
                Log.d(TAG, "PIN was cleared remotely, redirecting to PIN setup");
                scooterHasPin = false;
                showPinSetupForLock(isLocking);
            }
        });
        dialog.show(getSupportFragmentManager(), "pin_entry");
    }

    private void showPinSetupForLock(boolean isLocking) {
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Log.e(TAG, "No session token for PIN setup");
            return;
        }

        PinSetupDialog dialog = PinSetupDialog.newInstance(scooterDbId, sessionToken, true);
        dialog.setPinSetupListener(new PinSetupDialog.PinSetupListener() {
            @Override
            public void onPinSet() {
                scooterHasPin = true;
                sendLockCommand(isLocking);
            }

            @Override
            public void onPinSkipped() {
                // Never lock without a PIN — locking without PIN gives false sense of security
                // since anyone connecting via BLE could unlock it
                Log.d(TAG, "PIN setup skipped — lock not allowed without PIN");
            }
        });
        dialog.show(getSupportFragmentManager(), "pin_setup");
    }

    /**
     * Actually send the BLE lock/unlock command and update the toggle.
     */
    private void sendLockCommand(boolean on) {
        int newFlags = on
                ? (lastControlFlags | 0x0100)
                : (lastControlFlags & ~0x0100);
        sendControlCommand(newFlags);
        // Update the toggle to reflect the new state
        runOnUiThread(() -> {
            updatingToggles.set(true);
            switchLock.setChecked(on);
            updatingToggles.set(false);
        });
    }

    private void sendControlCommand(int controlFlags) {
        if (connectionService == null || !connectionService.isConnected()) {
            Log.w(TAG, "Cannot send control command - not connected");
            Toast.makeText(this, "Not connected to scooter", Toast.LENGTH_SHORT).show();
            return;
        }

        BLEManager ble = connectionService.getBLEManager();
        if (ble == null) {
            Log.w(TAG, "BLE manager not ready");
            Toast.makeText(this, "Connection not ready — try again", Toast.LENGTH_SHORT).show();
            return;
        }

        byte[] packet = new byte[15];
        packet[0] = (byte) ble.getProtocolHeader();
        packet[1] = (byte) 0xC0;
        packet[2] = (byte) 0x0F; // length = 15

        packet[3] = (byte) ((controlFlags >> 8) & 0xFF); // controlState high
        packet[4] = (byte) (controlFlags & 0xFF);         // controlState low
        packet[5] = (byte) lastCruiseSpeed;
        packet[6] = (byte) lastMaxSpeed;
        // bytes 7-12 reserved (0x00 by default)

        int crc = ProtocolUtils.calculateCRC16(packet, 13);
        packet[13] = (byte) (crc & 0xFF);
        packet[14] = (byte) ((crc >> 8) & 0xFF);

        ble.sendCommand(packet);
        lastControlFlags = controlFlags; // Optimistic update
        Log.d(TAG, "Sent control command: flags=0x" + String.format("%04X", controlFlags));
    }

    // ==================================================================================
    // ConnectionListener CALLBACKS
    // ==================================================================================

    @Override
    public void onScanStarted() {
        Log.d(TAG, "Scan started");
    }

    @Override
    public void onDevicesFound(List<ScanResult> devices) {
        if (devices.isEmpty()) {
            runOnUiThread(() -> {
                tvConnectingStatus.setText("No scooters found. Try again.");
                handler.postDelayed(() -> {
                    if (currentState == State.CONNECTING) {
                        setState(State.DISCONNECTED);
                    }
                }, 2000);
            });
            return;
        }

        // Auto-connect: if enabled and we have a saved MAC, look for it in results
        if (!autoConnectAttempted && userSettings.isAutoConnectEnabled()) {
            autoConnectAttempted = true;
            String savedMac = userSettings.getLastConnectedMac();
            String savedName = userSettings.getLastConnectedName();
            if (savedMac != null) {
                for (ScanResult result : devices) {
                    if (savedMac.equals(result.getDevice().getAddress())) {
                        Log.d(TAG, "Auto-connecting to saved scooter: " + savedName);
                        runOnUiThread(() -> tvConnectingStatus.setText(
                                "Connecting to " + (savedName != null ? savedName : "scooter") + "..."));
                        connectionService.connectToDevice(result.getDevice());
                        return;
                    }
                }
                Log.d(TAG, "Saved scooter not found in scan results, showing picker");
            }
        }

        if (devices.size() == 1) {
            // Auto-connect to the only device found
            runOnUiThread(() -> tvConnectingStatus.setText("Connecting..."));
            connectionService.connectToDevice(devices.get(0).getDevice());
        } else {
            showDevicePicker(devices);
        }
    }

    @Override
    public void onScanFailed(String error) {
        Log.e(TAG, "Scan failed: " + error);
        setState(State.DISCONNECTED);
    }

    @Override
    public void onConnecting(String deviceName) {
        runOnUiThread(() -> tvConnectingStatus.setText("Connecting to " + deviceName + "..."));
    }

    @Override
    public void onConnected(String deviceName, String serialNumber) {
        Log.d(TAG, "Connected to: " + deviceName + " serial: " + serialNumber);
        connectedDeviceName = deviceName; // ZYD name used as DB key
        stopRecordCreated.set(false); // Reset for new connection
        runOnUiThread(() -> tvConnectionStatus.setText("Connected - " + deviceName));
        setState(State.CONNECTED);
        startTelemetryPolling();

        // Upload any queued offline telemetry from previous disconnects
        drainTelemetryQueue();

        // Upload any pending ride recording sessions
        ServiceFactory.getRideRecordingManager().uploadPendingSessions();

        // Save last connected scooter for auto-connect
        if (deviceName != null) {
            userSettings.setLastConnectedName(deviceName);
        }
        if (connectionService != null && connectionService.getBLEManager() != null
                && connectionService.getBLEManager().getBluetoothGatt() != null) {
            String mac = connectionService.getBLEManager().getBluetoothGatt().getDevice().getAddress();
            if (mac != null) {
                userSettings.setLastConnectedMac(mac);
            }
        }

        // Look up scooter DB ID and PIN status for lock functionality
        lookupScooterPinStatus(deviceName);
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                  String modelNumber, String manufacturer) {
        // Not needed for dashboard display
    }

    @Override
    public void onVersionReceived(VersionInfo version) {
        storedVersion = version;

        // Fire-and-forget: create telemetry record + update scooter record in DB
        if (version != null && connectedDeviceName != null) {
            createConnectionTelemetry(version);
        }
    }

    /**
     * Create a "start" telemetry record and update the scooter's static record on connection.
     * Also saves snapshot data for the later "stop" record at disconnect.
     * Fire-and-forget — does not block UI.
     */
    private void createConnectionTelemetry(VersionInfo version) {
        String distributorId = session.getDistributorId(); // null for normal users, that's fine
        String embeddedSerial = (version.embeddedSerialNumber != null && !version.embeddedSerialNumber.isEmpty())
                ? version.embeddedSerialNumber : null;

        // Save snapshots for stop telemetry at disconnect
        savedScooterSerial = connectedDeviceName;
        savedDistributorId = distributorId;
        savedVersion = version;
        savedRunningData = storedRunningData;
        savedBMSData = storedBMSData;
        savedEmbeddedSerial = embeddedSerial;

        SupabaseClient supabase = ServiceFactory.getSupabaseClient();
        supabase.createTelemetryRecord(connectedDeviceName, distributorId,
                version.controllerHwVersion, version.controllerSwVersion,
                storedRunningData, storedBMSData, embeddedSerial, "user_dashboard",
                version, null, "start",
                new SupabaseClient.Callback<String>() {
                    @Override
                    public void onSuccess(String recordId) {
                        Log.d(TAG, "Start telemetry record created: " + recordId);
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Failed to create start telemetry: " + error);
                    }
                });
    }

    @Override
    public void onRunningDataReceived(RunningDataInfo data) {
        if (data == null) return;
        storedRunningData = data;
        savedRunningData = data; // Keep snapshot current for stop telemetry

        lastControlFlags = data.controlFlags;
        lastCruiseSpeed = data.cruiseSpeed;
        lastMaxSpeed = data.maxSpeed;

        // Feed data to ride recorder
        ServiceFactory.getRideRecordingManager().onRunningDataReceived(data);

        // Always-on fault capture
        checkForFault(data);

        runOnUiThread(() -> {
            speedGauge.setSpeed(data.currentSpeed);
            if (data.maxSpeed > 0) {
                speedGauge.setMaxSpeed(data.maxSpeed);
            }
            tvOdometer.setText(data.totalDistance + " km");
            tvRange.setText(data.remainingRange + " km");

            // Update toggles without triggering listeners
            updatingToggles.set(true);
            switchHeadlight.setChecked(data.headlightsOn);
            switchCruise.setChecked(data.cruiseEnabled);
            switchLock.setChecked(data.deviceLocked);
            updatingToggles.set(false);
        });
    }

    @Override
    public void onBMSDataReceived(BMSDataInfo data) {
        if (data == null) return;
        storedBMSData = data;
        savedBMSData = data; // Keep snapshot current for stop telemetry

        // Feed BMS data to ride recorder
        ServiceFactory.getRideRecordingManager().onBmsDataReceived(data);

        runOnUiThread(() -> batteryGauge.setBatteryPercent(data.batteryPercent));
    }

    @Override
    public void onConfigReceived(ConfigInfo config) {
        // Not needed for dashboard display
    }

    @Override
    public void onStatusChanged(String status) {
        Log.d(TAG, "Status: " + status);
    }

    @Override
    public void onDisconnected(boolean wasExpected) {
        Log.d(TAG, "Disconnected (expected=" + wasExpected + ")");
        stopTelemetryPolling();

        // Auto-stop recording if active
        if (ServiceFactory.getRideRecordingManager().isRecording()) {
            stopRideRecording();
        }

        // For unexpected disconnects, create stop telemetry here
        // (for expected disconnects, it's already called in disconnectScooter() before release)
        if (!wasExpected) {
            createStopTelemetry();
        }

        // Reset diagnostic state and hide recording card
        diagnosticActive = false;
        diagnosticConfigJson = null;
        diagnosticRecordingCount = 0;
        diagnosticMaxRecordings = 1;
        runOnUiThread(() -> cardRecording.setVisibility(View.GONE));

        setState(State.DISCONNECTED);
    }

    @Override
    public void onConnectionFailed(String error) {
        Log.e(TAG, "Connection failed: " + error);
        setState(State.DISCONNECTED);
    }

    @Override
    public void onVersionRequestTimeout() {
        // Not critical for dashboard
    }

    @Override
    public void onRawDataReceived(byte[] data) {
        // Not needed for dashboard
    }

    @Override
    public void onCommandSent(boolean success, String message) {
        Log.d(TAG, "Command sent: success=" + success + " msg=" + message);
    }

    // ==================================================================================
    // STOP TELEMETRY & OFFLINE QUEUE
    // ==================================================================================

    /**
     * Create a "stop" telemetry record at disconnect.
     * Uses saved snapshot data (which is updated on every A0/A1 callback).
     * Guarded by stopRecordCreated to prevent duplicate records.
     * If offline, queues the record for later upload.
     */
    private void createStopTelemetry() {
        // Prevent duplicate stop records (both disconnectScooter and onDisconnected could fire)
        if (stopRecordCreated.getAndSet(true)) {
            Log.d(TAG, "Stop telemetry already created, skipping");
            return;
        }

        // Need at least a serial to create a meaningful record
        if (savedScooterSerial == null) {
            Log.w(TAG, "No saved scooter serial for stop telemetry");
            return;
        }

        Log.d(TAG, "Creating stop telemetry for: " + savedScooterSerial);

        // Check network availability
        if (!ServiceFactory.isNetworkAvailable()) {
            Log.d(TAG, "No network — queuing stop telemetry for later upload");
            queueStopTelemetry();
            return;
        }

        // Try direct upload
        String hwVersion = savedVersion != null ? savedVersion.controllerHwVersion : null;
        String swVersion = savedVersion != null ? savedVersion.controllerSwVersion : null;

        SupabaseClient supabase = ServiceFactory.getSupabaseClient();
        supabase.createTelemetryRecord(savedScooterSerial, savedDistributorId,
                hwVersion, swVersion,
                savedRunningData, savedBMSData, savedEmbeddedSerial, "user_dashboard",
                savedVersion, null, "stop",
                new SupabaseClient.Callback<String>() {
                    @Override
                    public void onSuccess(String recordId) {
                        Log.d(TAG, "Stop telemetry record created: " + recordId);
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Failed to create stop telemetry, queuing: " + error);
                        queueStopTelemetry();
                    }
                });
    }

    /**
     * Queue a stop telemetry record for later upload (offline scenario).
     * Builds a JsonObject with all telemetry fields from saved snapshots.
     */
    private void queueStopTelemetry() {
        try {
            JsonObject record = new JsonObject();
            record.addProperty("scooter_serial", savedScooterSerial);
            record.addProperty("record_type", "stop");
            record.addProperty("scan_type", "user_dashboard");
            record.addProperty("queued_at", new java.text.SimpleDateFormat(
                    "yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US).format(new java.util.Date()));

            if (savedDistributorId != null) record.addProperty("distributor_id", savedDistributorId);

            // Version info
            if (savedVersion != null) {
                if (savedVersion.controllerHwVersion != null) {
                    record.addProperty("hw_version", savedVersion.controllerHwVersion);
                    record.addProperty("controller_hw_version", savedVersion.controllerHwVersion);
                }
                if (savedVersion.controllerSwVersion != null) {
                    record.addProperty("sw_version", savedVersion.controllerSwVersion);
                    record.addProperty("controller_sw_version", savedVersion.controllerSwVersion);
                }
                if (savedVersion.meterHwVersion != null) record.addProperty("meter_hw_version", savedVersion.meterHwVersion);
                if (savedVersion.meterSwVersion != null) record.addProperty("meter_sw_version", savedVersion.meterSwVersion);
                if (savedVersion.bmsHwVersion != null) record.addProperty("bms_hw_version", savedVersion.bmsHwVersion);
                if (savedVersion.bmsSwVersion != null) record.addProperty("bms_sw_version", savedVersion.bmsSwVersion);
            }

            if (savedEmbeddedSerial != null) record.addProperty("embedded_serial", savedEmbeddedSerial);

            // BMS data (0xA1)
            if (savedBMSData != null) {
                record.addProperty("voltage", savedBMSData.batteryVoltage);
                record.addProperty("current", savedBMSData.batteryCurrent);
                record.addProperty("battery_soc", savedBMSData.batterySOC);
                record.addProperty("battery_health", savedBMSData.batteryHealth);
                record.addProperty("battery_charge_cycles", savedBMSData.chargeCycles);
                record.addProperty("battery_discharge_cycles", savedBMSData.dischargeCycles);
                record.addProperty("remaining_capacity_mah", savedBMSData.remainingCapacity);
                record.addProperty("full_capacity_mah", savedBMSData.fullCapacity);
                record.addProperty("battery_temp", savedBMSData.batteryTemperature);
            }

            // Running data (0xA0)
            if (savedRunningData != null) {
                record.addProperty("speed_kmh", savedRunningData.currentSpeed);
                record.addProperty("odometer_km", savedRunningData.totalDistance);
                record.addProperty("motor_temp", savedRunningData.motorTemp);
                record.addProperty("controller_temp", savedRunningData.controllerTemp);
                record.addProperty("fault_code", savedRunningData.faultCode);
                record.addProperty("gear_level", savedRunningData.gearLevel);
                record.addProperty("trip_distance_km", savedRunningData.tripDistance);
                record.addProperty("remaining_range_km", savedRunningData.remainingRange);
                record.addProperty("motor_rpm", savedRunningData.motorRPM);
                record.addProperty("current_limit", savedRunningData.currentLimit);
            }

            ServiceFactory.getTelemetryQueueManager().enqueue(record);
            Log.d(TAG, "Stop telemetry queued for later upload");

        } catch (Exception e) {
            Log.e(TAG, "Failed to queue stop telemetry: " + e.getMessage());
        }
    }

    /**
     * Upload any queued offline telemetry records from previous disconnects.
     * Called on new BLE connection (onConnected). Fire-and-forget.
     */
    private void drainTelemetryQueue() {
        TelemetryQueueManager queueManager = ServiceFactory.getTelemetryQueueManager();
        if (!queueManager.hasPending()) return;

        java.util.List<JsonObject> queued = queueManager.drainQueue();
        Log.d(TAG, "Drained " + queued.size() + " queued telemetry records");

        for (JsonObject record : queued) {
            ServiceFactory.telemetryRepo().uploadQueuedTelemetry(record);
        }
    }

    // ==================================================================================
    // DIAGNOSTIC CONSENT
    // ==================================================================================

    /**
     * Show a consent dialog when CS team has requested diagnostics for this scooter.
     * The user can Accept (stores consent locally for Phase 3) or Decline (clears flag in DB).
     */
    private void showDiagnosticConsentDialog(JsonObject config) {
        String reason = config.has("reason") && !config.get("reason").isJsonNull()
                ? config.get("reason").getAsString() : "Diagnostic data collection requested";

        int frequencySec = config.has("frequency_seconds") ? config.get("frequency_seconds").getAsInt() : 0;
        int maxDurationMin = config.has("max_duration_minutes") ? config.get("max_duration_minutes").getAsInt() : 0;

        StringBuilder message = new StringBuilder();
        message.append("Pure Electric support has requested diagnostic data from your scooter.\n\n");
        message.append("Reason: ").append(reason).append("\n");
        if (frequencySec > 0) {
            message.append("Data frequency: every ").append(frequencySec).append(" seconds\n");
        }
        if (maxDurationMin > 0) {
            message.append("Maximum duration: ").append(maxDurationMin).append(" minutes\n");
        }
        message.append("\nThis helps us improve your scooter's performance and safety.");
        message.append("\n\nDo you consent to this data collection?");

        new AlertDialog.Builder(this)
                .setTitle("Diagnostic Data Request")
                .setMessage(message.toString())
                .setPositiveButton("Accept", (dialog, which) -> {
                    Log.d(TAG, "User accepted diagnostic request");
                    diagnosticActive = true;
                    diagnosticConfigJson = config.toString();
                    diagnosticRecordingCount = 0;

                    // Parse max_recordings from config (default 1)
                    diagnosticMaxRecordings = 1;
                    if (config.has("max_recordings") && !config.get("max_recordings").isJsonNull()) {
                        int maxRec = config.get("max_recordings").getAsInt();
                        if (maxRec > 0) diagnosticMaxRecordings = maxRec;
                    }

                    // Show recording card so user can tap Go
                    cardRecording.setVisibility(View.VISIBLE);
                    layoutRecordIdle.setVisibility(View.VISIBLE);
                    layoutRecordActive.setVisibility(View.GONE);
                    tvRecordSubtitle.setText("Tap Go to start recording");
                    btnRecordGo.setEnabled(true);
                    btnRecordGo.setAlpha(1f);
                    btnRecordGo.setText("Go");
                    Toast.makeText(this, "Diagnostic ready — tap Go to start recording", Toast.LENGTH_SHORT).show();
                })
                .setNegativeButton("Decline", (dialog, which) -> {
                    Log.d(TAG, "User declined diagnostic request");
                    if (scooterDbId != null) {
                        ServiceFactory.scooterRepo().clearDiagnosticFlag(scooterDbId, true,
                                new SupabaseBaseRepository.Callback<Void>() {
                                    @Override
                                    public void onSuccess(Void result) {
                                        Log.d(TAG, "Diagnostic flag cleared (declined)");
                                    }

                                    @Override
                                    public void onError(String error) {
                                        Log.w(TAG, "Failed to clear diagnostic flag: " + error);
                                    }
                                });
                    }
                    Toast.makeText(this, "Diagnostic request declined", Toast.LENGTH_SHORT).show();
                })
                .setCancelable(false)
                .show();
    }

    // ==================================================================================
    // RIDE RECORDING
    // ==================================================================================

    /**
     * Called when user taps the "Go" button on the recording card.
     * Deletes any previous ride sessions for this scooter (local + remote) before starting.
     * This allows the user to re-record multiple times during a diagnostic, keeping only the latest.
     */
    private void onRecordGoTapped() {
        if (!diagnosticActive) {
            Log.w(TAG, "Go tapped but no diagnostic active");
            return;
        }

        // Reset UI state (in case re-recording after a completed session)
        tvRecordSubtitle.setText("Preparing to record...");
        btnRecordGo.setEnabled(false);
        btnRecordGo.setAlpha(0.5f);

        RideRecordingManager recorder = ServiceFactory.getRideRecordingManager();

        // Stop current recording if running (user tapping Go again)
        if (recorder.isRecording()) {
            recorder.stopRecording();
        }

        // Parse duration from diagnostic config
        int durationSec = DEFAULT_RECORDING_DURATION_SECONDS;
        if (diagnosticConfigJson != null) {
            try {
                JsonObject config = com.google.gson.JsonParser.parseString(diagnosticConfigJson).getAsJsonObject();
                if (config.has("max_duration_minutes") && !config.get("max_duration_minutes").isJsonNull()) {
                    int mins = config.get("max_duration_minutes").getAsInt();
                    if (mins > 0) durationSec = mins * 60;
                }
            } catch (Exception e) {
                Log.w(TAG, "Could not parse diagnostic config duration: " + e.getMessage());
            }
        }

        // Delete previous sessions for this scooter (local + remote), then start new recording
        final int finalDuration = durationSec;
        deletePreviousSessionsAndRecord(finalDuration);
    }

    /**
     * Delete all previous ride sessions for this scooter (both local Room DB and remote Supabase),
     * then start a new diagnostic recording.
     */
    private void deletePreviousSessionsAndRecord(int durationSec) {
        final String serial = connectedDeviceName;
        final String dbId = scooterDbId;

        RideRecordingManager recorder = ServiceFactory.getRideRecordingManager();

        // Delete local sessions in background, then start recording
        recorder.deleteSessionsForScooter(serial, () -> {
            // Local sessions deleted — now delete remote sessions (fire-and-forget)
            if (dbId != null) {
                deleteRemoteRideSessions(dbId);
            }

            // Start new recording
            runOnUiThread(() -> startRideRecording("diagnostic", durationSec, diagnosticConfigJson));
        });
    }

    /**
     * Delete all remote ride sessions for a scooter (fire-and-forget).
     */
    private void deleteRemoteRideSessions(String scooterDbId) {
        try {
            JsonObject body = new JsonObject();
            body.addProperty("action", "delete-ride-sessions");
            body.addProperty("scooter_id", scooterDbId);
            ServiceFactory.scooterRepo().callEdgeFunctionFireAndForget("update-scooter", body);
        } catch (Exception e) {
            Log.w(TAG, "Failed to delete remote ride sessions: " + e.getMessage());
        }
    }

    /**
     * Start a ride recording session.
     *
     * @param triggerType "manual" or "diagnostic"
     * @param durationSeconds maximum recording duration
     * @param diagnosticConfigJson JSON config if diagnostic (null for manual)
     */
    private void startRideRecording(String triggerType, int durationSeconds,
                                     String diagnosticConfigJson) {
        RideRecordingManager recorder = ServiceFactory.getRideRecordingManager();
        if (recorder.isRecording()) {
            Toast.makeText(this, "Already recording", Toast.LENGTH_SHORT).show();
            return;
        }

        String serial = connectedDeviceName;
        recorder.setListener(recordingListener);
        recorder.startRecording(triggerType, durationSeconds, serial, scooterDbId,
                diagnosticConfigJson);

        // Switch to fast polling (1Hz)
        currentPollInterval = RECORDING_POLL_INTERVAL_MS;
        restartTelemetryPolling();

        // Update UI
        runOnUiThread(() -> {
            // Reset Go button state (in case greyed from previous completion)
            btnRecordGo.setEnabled(true);
            btnRecordGo.setAlpha(1f);
            btnRecordGo.setText("Go");

            layoutRecordIdle.setVisibility(View.GONE);
            layoutRecordActive.setVisibility(View.VISIBLE);
            progressRecording.setMax(durationSeconds);
            progressRecording.setProgress(0);
            tvRecordingTimer.setText("Recording 0:00 / " + formatDuration(durationSeconds));
            tvSampleCount.setText("0 samples");
        });
    }

    /**
     * Stop the current ride recording.
     */
    private void stopRideRecording() {
        RideRecordingManager recorder = ServiceFactory.getRideRecordingManager();
        recorder.stopRecording();

        // Revert to normal polling (2Hz)
        currentPollInterval = TELEMETRY_POLL_INTERVAL_MS;
        restartTelemetryPolling();

        // Update UI
        runOnUiThread(() -> {
            layoutRecordIdle.setVisibility(View.VISIBLE);
            layoutRecordActive.setVisibility(View.GONE);
        });
    }

    private void restartTelemetryPolling() {
        if (pollingActive.get()) {
            handler.removeCallbacks(telemetryPoller);
            handler.post(telemetryPoller);
        }
    }

    private final RideRecordingManager.RecordingListener recordingListener =
            new RideRecordingManager.RecordingListener() {
                @Override
                public void onRecordingStarted(String sessionId) {
                    Log.d(TAG, "Recording started: " + sessionId);
                }

                @Override
                public void onRecordingTick(int elapsedSeconds, int maxSeconds, int sampleCount) {
                    runOnUiThread(() -> {
                        if (isDestroyed() || isFinishing()) return;
                        tvRecordingTimer.setText("Recording " + formatDuration(elapsedSeconds)
                                + " / " + formatDuration(maxSeconds));
                        tvSampleCount.setText(sampleCount + " samples");
                        progressRecording.setMax(maxSeconds);
                        progressRecording.setProgress(elapsedSeconds);
                    });
                }

                @Override
                public void onRecordingStopped(String sessionId, int totalSamples) {
                    diagnosticRecordingCount++;

                    runOnUiThread(() -> {
                        if (isDestroyed() || isFinishing()) return;
                        layoutRecordIdle.setVisibility(View.VISIBLE);
                        layoutRecordActive.setVisibility(View.GONE);

                        boolean limitReached = diagnosticRecordingCount >= diagnosticMaxRecordings;

                        // Show completion state
                        btnRecordGo.setEnabled(false);
                        btnRecordGo.setAlpha(0.5f);
                        btnRecordGo.setText("Done");

                        if (limitReached) {
                            // Limit reached — stay greyed out permanently
                            tvRecordSubtitle.setText("Complete — " + totalSamples + " samples captured");
                            Toast.makeText(UserDashboardActivity.this,
                                    "Recording complete: " + totalSamples + " samples",
                                    Toast.LENGTH_SHORT).show();
                        } else {
                            // Still have recordings left — re-enable after 3 seconds
                            int remaining = diagnosticMaxRecordings - diagnosticRecordingCount;
                            tvRecordSubtitle.setText("Complete — " + totalSamples + " samples captured");

                            handler.postDelayed(() -> {
                                if (isDestroyed() || isFinishing()) return;
                                btnRecordGo.setEnabled(true);
                                btnRecordGo.setAlpha(1f);
                                btnRecordGo.setText("Go");
                                tvRecordSubtitle.setText("Tap Go to re-record (" + remaining + " left)");
                            }, 3000);

                            Toast.makeText(UserDashboardActivity.this,
                                    "Recording complete — " + remaining + " recording(s) remaining",
                                    Toast.LENGTH_SHORT).show();
                        }
                    });

                    // Revert to normal polling
                    currentPollInterval = TELEMETRY_POLL_INTERVAL_MS;
                    restartTelemetryPolling();

                    // Auto-upload if online
                    ServiceFactory.getRideRecordingManager().uploadPendingSessions();
                }

                @Override
                public void onUploadComplete(String sessionId, boolean success) {
                    Log.d(TAG, "Ride session upload: " + sessionId + " success=" + success);
                }
            };

    private static String formatDuration(int totalSeconds) {
        int min = totalSeconds / 60;
        int sec = totalSeconds % 60;
        return String.format(java.util.Locale.US, "%d:%02d", min, sec);
    }

    // ==================================================================================
    // FAULT CAPTURE (always-on)
    // ==================================================================================

    /**
     * Check for non-zero fault codes and create a fault record.
     * Deduplicates: same fault code within 30 seconds is ignored.
     * Uses existing scooter_telemetry table (not ride_telemetry).
     */
    private void checkForFault(RunningDataInfo data) {
        if (data.faultCode == 0 || !faultCaptureEnabled) return;

        long now = System.currentTimeMillis();
        if (data.faultCode == lastReportedFaultCode
                && (now - lastFaultReportTimeMs) < FAULT_DEDUP_INTERVAL_MS) {
            return; // Deduplicate
        }

        lastReportedFaultCode = data.faultCode;
        lastFaultReportTimeMs = now;

        Log.w(TAG, "Fault detected: 0x" + String.format("%04X", data.faultCode));

        // Build fault record using existing telemetry fields
        JsonObject record = new JsonObject();
        record.addProperty("record_type", "fault");
        record.addProperty("scan_type", "user_dashboard");
        record.addProperty("fault_code", data.faultCode);
        record.addProperty("speed_kmh", data.currentSpeed);
        record.addProperty("motor_temp", data.motorTemp);
        record.addProperty("controller_temp", data.controllerTemp);
        record.addProperty("gear_level", data.gearLevel);
        record.addProperty("motor_rpm", data.motorRPM);
        record.addProperty("current_limit", data.currentLimit);
        record.addProperty("trip_distance_km", data.tripDistance);
        record.addProperty("odometer_km", data.totalDistance);
        record.addProperty("remaining_range_km", data.remainingRange);

        // Add BMS data if available
        BMSDataInfo bms = storedBMSData;
        if (bms != null) {
            record.addProperty("voltage", bms.batteryVoltage);
            record.addProperty("current", bms.batteryCurrent);
            record.addProperty("battery_soc", bms.batteryPercent);
            record.addProperty("battery_temp", bms.batteryTemperature);
        }

        if (connectedDeviceName != null) {
            record.addProperty("scooter_serial", connectedDeviceName);
        }

        // Upload or queue
        if (ServiceFactory.isNetworkAvailable()) {
            ServiceFactory.telemetryRepo().uploadQueuedTelemetry(record);
        } else {
            ServiceFactory.getTelemetryQueueManager().enqueue(record);
        }
    }
}
