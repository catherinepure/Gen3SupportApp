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
import android.widget.ImageView;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;

import android.widget.Toast;

import com.pure.gen3firmwareupdater.services.PermissionHelper;
import com.pure.gen3firmwareupdater.services.ScooterConnectionService;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.SupabaseBaseRepository;
import com.pure.gen3firmwareupdater.services.TermsManager;
import com.pure.gen3firmwareupdater.views.BatteryGaugeView;
import com.pure.gen3firmwareupdater.views.SpeedGaugeView;

import java.util.List;

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
    private static final int REQUEST_CODE_TERMS = 1002;
    private static final long TELEMETRY_POLL_INTERVAL_MS = 2000;

    private enum State { DISCONNECTED, CONNECTING, CONNECTED }

    // Services
    private ScooterConnectionService connectionService;
    private SessionManager session;
    private TermsManager termsManager;
    private final Handler handler = new Handler(Looper.getMainLooper());

    // State
    private State currentState = State.DISCONNECTED;
    private int lastControlFlags = 0;
    private int lastCruiseSpeed = 0;
    private int lastMaxSpeed = 25;
    private boolean pollingActive = false;
    private boolean updatingToggles = false; // Prevents toggle listener feedback loop

    // Stored BLE data for passing to ScooterDetailsActivity
    private String connectedDeviceName; // ZYD serial (BLE device name) — used as DB key
    private VersionInfo storedVersion;
    private RunningDataInfo storedRunningData;
    private BMSDataInfo storedBMSData;

    // PIN / Lock state
    private String scooterDbId;         // UUID from scooters table (looked up on connect)
    private boolean scooterHasPin;      // Whether this scooter has a PIN set

    // UI - Header
    private View statusDot;
    private TextView tvConnectionStatus;
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
            if (pollingActive) {
                handler.postDelayed(this, TELEMETRY_POLL_INTERVAL_MS);
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
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Re-attach as BLE listener when returning from ScooterDetailsActivity
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.setListener(this);
            if (!pollingActive) {
                startTelemetryPolling();
            }
        } else if (connectionService != null && !connectionService.isConnected()) {
            // Connection was lost or released while away
            setState(State.DISCONNECTED);
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
    }

    private void setupListeners() {
        btnConnect.setOnClickListener(v -> startScanAndConnect());
        btnScooterDetails.setOnClickListener(v -> openScooterDetails());
        btnDisconnect.setOnClickListener(v -> disconnectScooter());
        btnLogout.setOnClickListener(v -> logout());

        switchHeadlight.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles) {
                toggleHeadlight(isChecked);
            }
        });
        switchCruise.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles) {
                toggleCruise(isChecked);
            }
        });
        switchLock.setOnCheckedChangeListener((buttonView, isChecked) -> {
            if (!updatingToggles) {
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
        stopTelemetryPolling();
        ServiceFactory.releaseConnectionService();
        connectionService = null;
        scooterDbId = null;
        scooterHasPin = false;
        setState(State.DISCONNECTED);

        // Reset gauges
        speedGauge.setSpeed(0);
        batteryGauge.setBatteryPercent(0);
        tvOdometer.setText("0 km");
        tvRange.setText("0 km");
        updatingToggles = true;
        switchHeadlight.setChecked(false);
        switchCruise.setChecked(false);
        switchLock.setChecked(false);
        updatingToggles = false;
    }

    private void logout() {
        stopTelemetryPolling();
        if (connectionService != null) {
            ServiceFactory.releaseConnectionService();
            connectionService = null;
        }
        session.clearSession();

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
        if (pollingActive) return;
        pollingActive = true;
        handler.post(telemetryPoller);
        Log.d(TAG, "Telemetry polling started");
    }

    private void stopTelemetryPolling() {
        pollingActive = false;
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
                        Log.d(TAG, "Scooter DB lookup: id=" + scooterDbId
                                + " hasPin=" + scooterHasPin);
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
        updatingToggles = true;
        switchLock.setChecked(!on);
        updatingToggles = false;

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
                // User chose not to set a PIN — don't send lock command
                Log.d(TAG, "PIN setup skipped — lock cancelled");
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
            updatingToggles = true;
            switchLock.setChecked(on);
            updatingToggles = false;
        });
    }

    private void sendControlCommand(int controlFlags) {
        if (connectionService == null || !connectionService.isConnected()) {
            Log.w(TAG, "Cannot send control command - not connected");
            return;
        }

        BLEManager ble = connectionService.getBLEManager();
        if (ble == null) return;

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
        runOnUiThread(() -> tvConnectionStatus.setText("Connected - " + deviceName));
        setState(State.CONNECTED);
        startTelemetryPolling();

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
     * Create a telemetry record and update the scooter's static record on connection.
     * This ensures firmware versions and last_connected_at are updated in the DB.
     * Fire-and-forget — does not block UI.
     */
    private void createConnectionTelemetry(VersionInfo version) {
        String distributorId = session.getDistributorId(); // null for normal users, that's fine
        String embeddedSerial = (version.embeddedSerialNumber != null && !version.embeddedSerialNumber.isEmpty())
                ? version.embeddedSerialNumber : null;

        SupabaseClient supabase = ServiceFactory.getSupabaseClient();
        supabase.createTelemetryRecord(connectedDeviceName, distributorId,
                version.controllerHwVersion, version.controllerSwVersion,
                storedRunningData, storedBMSData, embeddedSerial, "user_dashboard",
                version, null,
                new SupabaseClient.Callback<String>() {
                    @Override
                    public void onSuccess(String recordId) {
                        Log.d(TAG, "Dashboard telemetry record created: " + recordId);
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Failed to create dashboard telemetry: " + error);
                    }
                });
    }

    @Override
    public void onRunningDataReceived(RunningDataInfo data) {
        if (data == null) return;
        storedRunningData = data;

        lastControlFlags = data.controlFlags;
        lastCruiseSpeed = data.cruiseSpeed;
        lastMaxSpeed = data.maxSpeed;

        runOnUiThread(() -> {
            speedGauge.setSpeed(data.currentSpeed);
            if (data.maxSpeed > 0) {
                speedGauge.setMaxSpeed(data.maxSpeed);
            }
            tvOdometer.setText(data.totalDistance + " km");
            tvRange.setText(data.remainingRange + " km");

            // Update toggles without triggering listeners
            updatingToggles = true;
            switchHeadlight.setChecked(data.headlightsOn);
            switchCruise.setChecked(data.cruiseEnabled);
            switchLock.setChecked(data.deviceLocked);
            updatingToggles = false;
        });
    }

    @Override
    public void onBMSDataReceived(BMSDataInfo data) {
        if (data == null) return;
        storedBMSData = data;

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
}
