package com.pure.gen3firmwareupdater;

import android.bluetooth.BluetoothDevice;
import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;

import com.google.android.material.button.MaterialButton;

import com.pure.gen3firmwareupdater.services.PermissionHelper;
import com.pure.gen3firmwareupdater.services.ScooterConnectionService;
import com.pure.gen3firmwareupdater.services.ServiceFactory;

import java.util.List;

/**
 * Activity to scan for nearby scooters and connect to them.
 * This is the primary action for distributors servicing walk-in customers.
 */
public class ScanScooterActivity extends AppCompatActivity implements ScooterConnectionService.ConnectionListener {

    private static final String TAG = "ScanScooter";
    private static final int PERMISSION_REQUEST_CODE = 100;

    private enum State {
        IDLE, SCANNING, CONNECTING, CONNECTED
    }

    private State currentState = State.IDLE;
    private ScooterConnectionService connectionService;
    private SupabaseClient supabase;
    private Handler handler = new Handler(Looper.getMainLooper());

    // UI
    private TextView tvStatus;
    private ProgressBar progressBar;
    private MaterialButton btnScan;
    private MaterialButton btnCancel;
    private View layoutIdle;
    private View layoutScanning;
    private View layoutConnecting;

    // Data
    private String distributorId;  // null for regular users
    private boolean userMode = false;
    private String connectedSerial;
    private VersionInfo scooterVersion;
    private RunningDataInfo scooterRunningData;
    private BMSDataInfo scooterBMSData;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scan_scooter);

        initViews();
        initManagers();

        // Check if launched in user mode (regular user, no distributor ID required)
        userMode = getIntent().getBooleanExtra("user_mode", false);
        distributorId = ServiceFactory.getSessionManager().getDistributorId();

        if (distributorId == null && !userMode) {
            Toast.makeText(this, "Distributor ID not found", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        checkPermissions();
    }

    private void initViews() {
        tvStatus = findViewById(R.id.tvStatus);
        progressBar = findViewById(R.id.progressBar);
        btnScan = findViewById(R.id.btnScan);
        btnCancel = findViewById(R.id.btnCancel);
        layoutIdle = findViewById(R.id.layoutIdle);
        layoutScanning = findViewById(R.id.layoutScanning);
        layoutConnecting = findViewById(R.id.layoutConnecting);

        btnScan.setOnClickListener(v -> startScanning());
        btnCancel.setOnClickListener(v -> {
            if (currentState == State.SCANNING && connectionService != null) {
                connectionService.cleanup();
            }
            finish();
        });
    }

    private void initManagers() {
        ServiceFactory.init(this);
        BLEManager bleManager = new BLEManager(this, null);
        connectionService = new ScooterConnectionService(bleManager, handler);
        connectionService.setListener(this);
        bleManager.setListener(connectionService);
        supabase = ServiceFactory.getSupabaseClient();
    }

    private void setState(State state) {
        currentState = state;
        runOnUiThread(() -> {
            layoutIdle.setVisibility(View.GONE);
            layoutScanning.setVisibility(View.GONE);
            layoutConnecting.setVisibility(View.GONE);

            switch (state) {
                case IDLE:
                    layoutIdle.setVisibility(View.VISIBLE);
                    tvStatus.setText("Ready to scan for nearby scooters");
                    break;
                case SCANNING:
                    layoutScanning.setVisibility(View.VISIBLE);
                    tvStatus.setText("Scanning for nearby scooters...");
                    progressBar.setVisibility(View.VISIBLE);
                    break;
                case CONNECTING:
                    layoutConnecting.setVisibility(View.VISIBLE);
                    tvStatus.setText("Connecting to scooter...");
                    progressBar.setVisibility(View.VISIBLE);
                    break;
                case CONNECTED:
                    layoutConnecting.setVisibility(View.VISIBLE);
                    tvStatus.setText("Reading scooter information...");
                    progressBar.setVisibility(View.VISIBLE);
                    break;
            }
        });
    }

    private void checkPermissions() {
        List<String> needed = PermissionHelper.getNeededBLEPermissions(this);

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    private void startScanning() {
        if (connectionService == null) {
            Toast.makeText(this, "Bluetooth not available", Toast.LENGTH_SHORT).show();
            return;
        }

        setState(State.SCANNING);
        connectionService.startScan();
    }

    // ==================================================================================
    // ScooterConnectionService.ConnectionListener implementation
    // ==================================================================================

    @Override
    public void onScanStarted() {
        Log.d(TAG, "Scan started");
    }

    @Override
    public void onDevicesFound(List<ScanResult> devices) {
        Log.d(TAG, "Scan completed, found " + devices.size() + " devices");

        if (devices.isEmpty()) {
            runOnUiThread(() -> {
                new AlertDialog.Builder(this)
                        .setTitle("No Scooters Found")
                        .setMessage("No ZYD scooters found nearby. Make sure the scooter is powered on and in range.")
                        .setPositiveButton("Scan Again", (d, w) -> startScanning())
                        .setNegativeButton("Cancel", (d, w) -> finish())
                        .show();
            });
            return;
        }

        // Show device picker
        showDevicePicker(devices);
    }

    @Override
    public void onScanFailed(String error) {
        runOnUiThread(() -> {
            Toast.makeText(this, "Scan failed: " + error, Toast.LENGTH_LONG).show();
            setState(State.IDLE);
        });
    }

    @Override
    public void onConnecting(String deviceName) {
        Log.d(TAG, "Connecting to: " + deviceName);
    }

    @Override
    public void onConnected(String deviceName, String serialNumber) {
        Log.d(TAG, "Connected to: " + deviceName);
        setState(State.CONNECTED);
        connectedSerial = (serialNumber != null && !serialNumber.isEmpty()) ? serialNumber : deviceName;
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                  String modelNumber, String manufacturer) {
        // Not used in scan flow
    }

    @Override
    public void onVersionReceived(VersionInfo version) {
        Log.d(TAG, "Version info received: " + version);
        scooterVersion = version;
        onVersionDataReady();
    }

    @Override
    public void onRunningDataReceived(RunningDataInfo data) {
        Log.d(TAG, "Running data received");
        scooterRunningData = data;
    }

    @Override
    public void onBMSDataReceived(BMSDataInfo data) {
        Log.d(TAG, "BMS data received");
        scooterBMSData = data;
    }

    @Override
    public void onConfigReceived(ConfigInfo config) {
        // Not used in scan flow
        Log.d(TAG, "Config info received (not used in scan flow)");
    }

    @Override
    public void onStatusChanged(String status) {
        Log.d(TAG, "Connection status: " + status);
    }

    @Override
    public void onDisconnected(boolean wasExpected) {
        if (!wasExpected) {
            showError("Connection to scooter lost.");
        }
    }

    @Override
    public void onConnectionFailed(String error) {
        showError("Connection failed: " + error);
    }

    @Override
    public void onVersionRequestTimeout() {
        showError("Could not read scooter version info. Try reconnecting.");
    }

    @Override
    public void onRawDataReceived(byte[] data) {
        // Not used in scan flow
    }

    @Override
    public void onCommandSent(boolean success, String message) {
        // Not used in scan flow
    }

    // ==================================================================================
    // DEVICE PICKER AND CONNECTION
    // ==================================================================================

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
                        connectToScooter(devices.get(which).getDevice());
                    })
                    .setNegativeButton("Cancel", (dialog, which) -> setState(State.IDLE))
                    .show();
        });
    }

    private void connectToScooter(BluetoothDevice device) {
        connectedSerial = device.getName() != null ? device.getName() : "Unknown";
        setState(State.CONNECTING);
        connectionService.connectToDevice(device);
    }

    // ==================================================================================
    // VERSION + TELEMETRY HANDLING
    // ==================================================================================

    private void onVersionDataReady() {
        Log.d(TAG, "Version received: " + scooterVersion);

        // Create telemetry record (new approach - separate from firmware uploads)
        String embeddedSerial = (scooterVersion.embeddedSerialNumber != null && !scooterVersion.embeddedSerialNumber.isEmpty())
                ? scooterVersion.embeddedSerialNumber : null;

        String scanSource = userMode ? "user_scan" : "distributor_scan";
        supabase.createTelemetryRecord(connectedSerial, distributorId,
                scooterVersion.controllerHwVersion, scooterVersion.controllerSwVersion,
                scooterRunningData, scooterBMSData, embeddedSerial, scanSource,
                new SupabaseClient.Callback<String>() {
                    @Override
                    public void onSuccess(String recordId) {
                        Log.d(TAG, "Telemetry record created: " + recordId);
                        // Now check registration status and show scooter details
                        checkRegistrationAndShowDetails();
                    }

                    @Override
                    public void onError(String error) {
                        Log.w(TAG, "Failed to create telemetry record: " + error);
                        // Still show details even if telemetry record fails
                        checkRegistrationAndShowDetails();
                    }
                });
    }

    private void checkRegistrationAndShowDetails() {
        // Query for registration status
        supabase.getScooterRegistrationStatus(connectedSerial, new SupabaseClient.Callback<ScooterRegistrationInfo>() {
            @Override
            public void onSuccess(ScooterRegistrationInfo registrationInfo) {
                showScooterDetails(registrationInfo);
            }

            @Override
            public void onError(String error) {
                Log.w(TAG, "Could not check registration status: " + error);
                // Show details without registration info
                showScooterDetails(null);
            }
        });
    }

    private void showScooterDetails(ScooterRegistrationInfo registrationInfo) {
        // Check if activity is still valid
        if (isFinishing() || isDestroyed()) {
            Log.w(TAG, "Activity is finishing/destroyed, cannot show details");
            return;
        }

        // Check if PIN setup is needed (distributor mode, scooter has no PIN)
        if (!userMode && registrationInfo != null
                && registrationInfo.scooterId != null && !registrationInfo.hasPinSet) {
            String sessionToken = ServiceFactory.getSessionManager().getSessionToken();
            if (sessionToken != null) {
                runOnUiThread(() -> showPinSetupDialog(registrationInfo, sessionToken));
                return;
            }
        }

        navigateToScooterDetails(registrationInfo);
    }

    private void showPinSetupDialog(ScooterRegistrationInfo registrationInfo, String sessionToken) {
        PinSetupDialog dialog = PinSetupDialog.newInstance(registrationInfo.scooterId, sessionToken);
        dialog.setPinSetupListener(new PinSetupDialog.PinSetupListener() {
            @Override
            public void onPinSet() {
                Toast.makeText(ScanScooterActivity.this, "PIN set successfully", Toast.LENGTH_SHORT).show();
                navigateToScooterDetails(registrationInfo);
            }

            @Override
            public void onPinSkipped() {
                navigateToScooterDetails(registrationInfo);
            }
        });
        dialog.show(getSupportFragmentManager(), "pin_setup");
    }

    private void navigateToScooterDetails(ScooterRegistrationInfo registrationInfo) {
        if (isFinishing() || isDestroyed()) return;

        Intent intent = new Intent(this, ScooterDetailsActivity.class);
        intent.putExtra("scooter_serial", connectedSerial);
        intent.putExtra("connected_mode", true);
        intent.putExtra("hw_version", scooterVersion.controllerHwVersion);
        intent.putExtra("sw_version", scooterVersion.controllerSwVersion);

        // BMS data (0xA1) - voltage, current, battery metrics (primary source)
        if (scooterBMSData != null) {
            intent.putExtra("voltage", scooterBMSData.batteryVoltage);
            intent.putExtra("current", scooterBMSData.batteryCurrent);
            intent.putExtra("battery_percent", scooterBMSData.batteryPercent);
            intent.putExtra("battery_soc", scooterBMSData.batterySOC);
            intent.putExtra("battery_health", scooterBMSData.batteryHealth);
            intent.putExtra("charge_cycles", scooterBMSData.chargeCycles);
        }

        // Running data (0xA0) - speed, distances, temps
        if (scooterRunningData != null) {
            intent.putExtra("odometer", scooterRunningData.totalDistance);
        }

        if (registrationInfo != null) {
            intent.putExtra("is_registered", true);
            intent.putExtra("owner_name", registrationInfo.ownerName);
            intent.putExtra("owner_email", registrationInfo.ownerEmail);
            intent.putExtra("registered_date", registrationInfo.registeredDate);
            intent.putExtra("is_primary", registrationInfo.isPrimary);
            intent.putExtra("nickname", registrationInfo.nickname);
        } else {
            intent.putExtra("is_registered", false);
        }

        runOnUiThread(() -> {
            startActivity(intent);
            finish();
        });
    }

    private void showError(String message) {
        runOnUiThread(() -> {
            // Check if activity is still valid before showing dialog
            if (isFinishing() || isDestroyed()) {
                Log.w(TAG, "Activity is finishing/destroyed, cannot show error dialog");
                return;
            }

            new AlertDialog.Builder(this)
                    .setTitle("Error")
                    .setMessage(message)
                    .setPositiveButton("Try Again", (d, w) -> {
                        setState(State.IDLE);
                        startScanning();
                    })
                    .setNegativeButton("Cancel", (d, w) -> finish())
                    .show();
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (connectionService != null) {
            connectionService.cleanup();
        }
        // Note: supabase is managed by ServiceFactory (shared singleton), don't shutdown here
        handler.removeCallbacksAndMessages(null);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    Toast.makeText(this, "Bluetooth permissions are required", Toast.LENGTH_LONG).show();
                    finish();
                    return;
                }
            }
        }
    }
}
