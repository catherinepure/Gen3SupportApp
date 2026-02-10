package com.pure.gen3firmwareupdater;

import android.bluetooth.le.ScanResult;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;

import com.pure.gen3firmwareupdater.services.ScooterConnectionService;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;

import java.util.ArrayList;
import java.util.List;

/**
 * Activity to show scooter details and update history.
 * Implements ConnectionListener to receive BLE disconnect events from the
 * shared connection service singleton.
 */
public class ScooterDetailsActivity extends AppCompatActivity
        implements ScooterConnectionService.ConnectionListener {

    private static final String TAG = "ScooterDetails";

    private TextView tvScooterSerial;
    private TextView tvCustomerInfo;
    private TextView tvCurrentFirmware;
    private TextView tvCurrentTelemetry;
    private TextView tvHistoryStatus;
    private RecyclerView rvHistory;
    private ProgressBar progressBar;
    private MaterialButton btnClose;
    private MaterialButton btnViewCustomer;
    private MaterialButton btnDisconnect;
    private MaterialButton btnCheckForUpdates;
    private MaterialButton btnUpdateFirmware;
    private TextView tvFirmwareStatus;

    private SupabaseClient supabase;
    private SessionManager session;
    private ScooterConnectionService connectionService;
    private Handler handler = new Handler(Looper.getMainLooper());
    private String scooterSerial;
    private UpdateHistoryAdapter historyAdapter;
    private List<TelemetryRecord> updateHistory;

    // Current connection data
    private boolean isConnectedMode;
    private boolean isRegistered;
    private String ownerName;
    private String ownerEmail;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scooter_details);

        // Get scooter serial from intent
        scooterSerial = getIntent().getStringExtra("scooter_serial");
        if (scooterSerial == null) {
            Toast.makeText(this, "Scooter serial not provided", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // Get data from intent
        isConnectedMode = getIntent().getBooleanExtra("connected_mode", false);
        isRegistered = getIntent().getBooleanExtra("is_registered", false);
        ownerName = getIntent().getStringExtra("owner_name");
        ownerEmail = getIntent().getStringExtra("owner_email");

        // Initialize views
        tvScooterSerial = findViewById(R.id.tvScooterSerial);
        tvCustomerInfo = findViewById(R.id.tvCustomerInfo);
        tvCurrentFirmware = findViewById(R.id.tvCurrentFirmware);
        tvCurrentTelemetry = findViewById(R.id.tvCurrentTelemetry);
        tvHistoryStatus = findViewById(R.id.tvHistoryStatus);
        rvHistory = findViewById(R.id.rvHistory);
        progressBar = findViewById(R.id.progressBar);
        btnClose = findViewById(R.id.btnClose);
        btnViewCustomer = findViewById(R.id.btnViewCustomer);
        btnDisconnect = findViewById(R.id.btnDisconnect);

        tvScooterSerial.setText("Scooter: " + scooterSerial);

        // Initialize RecyclerView
        updateHistory = new ArrayList<>();
        historyAdapter = new UpdateHistoryAdapter(updateHistory);
        historyAdapter.setOnRecordClickListener(record -> showRecordDetails(record));
        rvHistory.setLayoutManager(new LinearLayoutManager(this));
        rvHistory.setAdapter(historyAdapter);

        btnClose.setOnClickListener(v -> finish());

        // Customer button only visible if registered
        if (isRegistered && ownerName != null) {
            btnViewCustomer.setVisibility(View.VISIBLE);
            btnViewCustomer.setOnClickListener(v -> showCustomerDetails());
        } else {
            btnViewCustomer.setVisibility(View.GONE);
        }

        // Initialize Supabase client and session
        ServiceFactory.init(this);
        supabase = ServiceFactory.getSupabaseClient();
        session = ServiceFactory.getSessionManager();

        // Firmware buttons
        btnCheckForUpdates = findViewById(R.id.btnCheckForUpdates);
        btnUpdateFirmware = findViewById(R.id.btnUpdateFirmware);
        tvFirmwareStatus = findViewById(R.id.tvFirmwareStatus);

        setupFirmwareButtons();

        // Attach to shared BLE connection service
        setupBleConnection();

        // Load scooter details and history
        displayCurrentData();
        loadUpdateHistory();
    }

    // ==================================================================================
    // BLE CONNECTION MANAGEMENT
    // ==================================================================================

    private void setupBleConnection() {
        // Get the shared connection service (same singleton from ScanScooterActivity)
        connectionService = ServiceFactory.getConnectionService(this, handler);
        connectionService.setListener(this);

        // Show disconnect button if BLE is currently connected
        if (connectionService.isConnected()) {
            btnDisconnect.setVisibility(View.VISIBLE);
            btnDisconnect.setOnClickListener(v -> {
                Log.d(TAG, "User pressed Disconnect");
                ServiceFactory.releaseConnectionService();
            });
        } else {
            btnDisconnect.setVisibility(View.GONE);
        }
    }

    private void updateDisconnectButton(boolean connected) {
        runOnUiThread(() -> {
            btnDisconnect.setVisibility(connected ? View.VISIBLE : View.GONE);
        });
    }

    // ==================================================================================
    // ScooterConnectionService.ConnectionListener implementation
    // ==================================================================================

    @Override
    public void onScanStarted() { /* not used */ }

    @Override
    public void onDevicesFound(List<ScanResult> devices) { /* not used */ }

    @Override
    public void onScanFailed(String error) { /* not used */ }

    @Override
    public void onConnecting(String deviceName) { /* not used */ }

    @Override
    public void onConnected(String deviceName, String serialNumber) {
        Log.d(TAG, "BLE connected: " + deviceName);
        updateDisconnectButton(true);
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                  String modelNumber, String manufacturer) { /* not used */ }

    @Override
    public void onVersionReceived(VersionInfo version) { /* not used */ }

    @Override
    public void onRunningDataReceived(RunningDataInfo data) { /* not used */ }

    @Override
    public void onBMSDataReceived(BMSDataInfo data) { /* not used */ }

    @Override
    public void onConfigReceived(ConfigInfo config) { /* not used */ }

    @Override
    public void onStatusChanged(String status) {
        Log.d(TAG, "BLE status: " + status);
    }

    @Override
    public void onDisconnected(boolean wasExpected) {
        Log.d(TAG, "BLE disconnected (expected=" + wasExpected + ")");
        updateDisconnectButton(false);
        runOnUiThread(() -> {
            if (wasExpected) {
                Toast.makeText(this, "Scooter disconnected", Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(this, "Connection to scooter lost", Toast.LENGTH_SHORT).show();
            }
        });
    }

    @Override
    public void onConnectionFailed(String error) {
        Log.w(TAG, "BLE connection failed: " + error);
        updateDisconnectButton(false);
    }

    @Override
    public void onVersionRequestTimeout() { /* not used */ }

    @Override
    public void onRawDataReceived(byte[] data) { /* not used */ }

    @Override
    public void onCommandSent(boolean success, String message) { /* not used */ }

    // ==================================================================================
    // FIRMWARE CHECK / UPDATE
    // ==================================================================================

    private void setupFirmwareButtons() {
        if (session.isDistributor()) {
            // Distributors: show "Update Firmware" button
            btnUpdateFirmware.setVisibility(View.VISIBLE);
            btnCheckForUpdates.setVisibility(View.GONE);
            btnUpdateFirmware.setOnClickListener(v -> launchFirmwareUpdater());
        } else {
            // Normal users: show "Check for Updates" button
            btnCheckForUpdates.setVisibility(View.VISIBLE);
            btnUpdateFirmware.setVisibility(View.GONE);
            btnCheckForUpdates.setOnClickListener(v -> checkForUpdates());
        }
    }

    private void checkForUpdates() {
        String hwVersion = getIntent().getStringExtra("hw_version");
        String swVersion = getIntent().getStringExtra("sw_version");

        if (hwVersion == null || hwVersion.isEmpty()) {
            tvFirmwareStatus.setText("Cannot check: hardware version unknown");
            tvFirmwareStatus.setVisibility(View.VISIBLE);
            return;
        }

        btnCheckForUpdates.setEnabled(false);
        btnCheckForUpdates.setText("Checking...");
        tvFirmwareStatus.setVisibility(View.GONE);

        supabase.getLatestFirmware(hwVersion, new SupabaseClient.Callback<FirmwareVersion>() {
            @Override
            public void onSuccess(FirmwareVersion latest) {
                runOnUiThread(() -> {
                    btnCheckForUpdates.setEnabled(true);
                    btnCheckForUpdates.setText("Check for Updates");
                    tvFirmwareStatus.setVisibility(View.VISIBLE);

                    if (latest == null || !latest.is_active) {
                        tvFirmwareStatus.setText("No firmware updates available for this hardware.");
                        return;
                    }

                    // Compare versions
                    if (swVersion != null && swVersion.equals(latest.version_label)) {
                        tvFirmwareStatus.setText("Firmware is up to date (" + swVersion + ")");
                    } else {
                        StringBuilder sb = new StringBuilder();
                        sb.append("Update available: ").append(latest.version_label);
                        if (swVersion != null) {
                            sb.append("\nCurrent: ").append(swVersion);
                        }
                        if (latest.release_notes != null && !latest.release_notes.isEmpty()) {
                            sb.append("\n\nRelease notes: ").append(latest.release_notes);
                        }
                        tvFirmwareStatus.setText(sb.toString());
                    }
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    btnCheckForUpdates.setEnabled(true);
                    btnCheckForUpdates.setText("Check for Updates");
                    tvFirmwareStatus.setVisibility(View.VISIBLE);
                    tvFirmwareStatus.setText("Could not check for updates: " + error);
                });
            }
        });
    }

    private void launchFirmwareUpdater() {
        Intent intent = new Intent(this, FirmwareUpdaterActivity.class);
        intent.putExtra("target_scooter_serial", scooterSerial);

        // Pass MAC address so FirmwareUpdaterActivity can skip scanning
        // and connect directly to the already-known device
        if (connectionService != null && connectionService.isConnected()) {
            BLEManager ble = connectionService.getBLEManager();
            if (ble != null && ble.getBluetoothGatt() != null) {
                String mac = ble.getBluetoothGatt().getDevice().getAddress();
                intent.putExtra("device_mac_address", mac);
                Log.d(TAG, "Passing MAC " + mac + " to FirmwareUpdater for direct connect");
            }
            // Release the shared connection so the firmware updater can connect
            ServiceFactory.releaseConnectionService();
            connectionService = null;
        }

        startActivity(intent);
        finish(); // Connection released, no point staying on this screen
    }

    // ==================================================================================
    // DATA DISPLAY
    // ==================================================================================

    private void displayCurrentData() {
        // Display registration status
        if (isRegistered && ownerName != null) {
            tvCustomerInfo.setText("Registered to: " + ownerName + " (" + ownerEmail + ")");
        } else {
            tvCustomerInfo.setText("Not registered to any customer");
        }

        // Display current firmware from intent
        String hwVersion = getIntent().getStringExtra("hw_version");
        String swVersion = getIntent().getStringExtra("sw_version");
        if (swVersion != null) {
            String firmwareText = "Firmware: " + swVersion;
            if (hwVersion != null) {
                firmwareText += " (HW: " + hwVersion + ")";
            }
            tvCurrentFirmware.setText(firmwareText);
        } else {
            tvCurrentFirmware.setText("Firmware: Unknown");
        }

        // Display current telemetry if in connected mode
        if (isConnectedMode) {
            StringBuilder telemetry = new StringBuilder("CURRENT TELEMETRY:\n");

            // BMS data (from 0xA1 - voltage, current, battery metrics)
            Double voltage = getIntent().hasExtra("voltage") ? getIntent().getDoubleExtra("voltage", 0) : null;
            Double current = getIntent().hasExtra("current") ? getIntent().getDoubleExtra("current", 0) : null;
            Integer batteryPercent = getIntent().hasExtra("battery_percent") ? getIntent().getIntExtra("battery_percent", 0) : null;
            Integer batterySOC = getIntent().hasExtra("battery_soc") ? getIntent().getIntExtra("battery_soc", 0) : null;
            Integer batteryHealth = getIntent().hasExtra("battery_health") ? getIntent().getIntExtra("battery_health", 0) : null;
            Integer chargeCycles = getIntent().hasExtra("charge_cycles") ? getIntent().getIntExtra("charge_cycles", 0) : null;

            // Running data (from 0xA0 - speed, distances, temps)
            Integer odometer = getIntent().hasExtra("odometer") ? getIntent().getIntExtra("odometer", 0) : null;

            // Battery section
            if (voltage != null && voltage > 0) telemetry.append(String.format("Voltage: %.1f V\n", voltage));
            if (current != null && current != 0) telemetry.append(String.format("Current: %.1f A\n", current));
            if (batterySOC != null && batterySOC > 0) telemetry.append("Battery: " + batterySOC + "%\n");
            else if (batteryPercent != null && batteryPercent > 0) telemetry.append("Battery: " + batteryPercent + "%\n");
            if (batteryHealth != null && batteryHealth > 0) telemetry.append("Battery Health: " + batteryHealth + "%\n");
            if (chargeCycles != null && chargeCycles > 0) telemetry.append("Charge Cycles: " + chargeCycles + "\n");

            // Distance section
            if (odometer != null && odometer > 0) telemetry.append("Total Distance: " + odometer + " km\n");

            tvCurrentTelemetry.setText(telemetry.toString());
            tvCurrentTelemetry.setVisibility(View.VISIBLE);
        } else {
            tvCurrentTelemetry.setVisibility(View.GONE);
        }
    }

    private void showCustomerDetails() {
        if (!isRegistered || ownerName == null) return;

        StringBuilder details = new StringBuilder();
        details.append("CUSTOMER INFORMATION\n\n");
        details.append("Name: ").append(ownerName).append("\n");
        details.append("Email: ").append(ownerEmail).append("\n\n");

        String registeredDate = getIntent().getStringExtra("registered_date");
        if (registeredDate != null) {
            details.append("Registered: ").append(registeredDate).append("\n");
        }

        boolean isPrimary = getIntent().getBooleanExtra("is_primary", false);
        details.append("Primary Owner: ").append(isPrimary ? "Yes" : "No").append("\n");

        String nickname = getIntent().getStringExtra("nickname");
        if (nickname != null) {
            details.append("Nickname: ").append(nickname).append("\n");
        }

        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Customer Details")
                .setMessage(details.toString())
                .setPositiveButton("OK", null)
                .show();
    }

    private void loadUpdateHistory() {
        progressBar.setVisibility(View.VISIBLE);
        tvHistoryStatus.setText("Loading telemetry history...");

        supabase.getScooterTelemetry(scooterSerial, 50, 0,
            new SupabaseClient.Callback<List<TelemetryRecord>>() {
                @Override
                public void onSuccess(List<TelemetryRecord> telemetryRecords) {
                    runOnUiThread(() -> {
                        progressBar.setVisibility(View.GONE);
                        updateHistory.clear();
                        updateHistory.addAll(telemetryRecords);
                        historyAdapter.notifyDataSetChanged();

                        if (telemetryRecords.isEmpty()) {
                            tvHistoryStatus.setText("No previous scans found for this scooter");
                        } else {
                            tvHistoryStatus.setText("Telemetry History (" + telemetryRecords.size() + " records):");
                        }
                    });
                }

                @Override
                public void onError(String error) {
                    runOnUiThread(() -> {
                        progressBar.setVisibility(View.GONE);

                        if (error.contains("Scooter not found")) {
                            tvHistoryStatus.setText("No previous scans (scooter not in inventory)");
                            Log.d(TAG, "Scooter not in database yet: " + scooterSerial);
                        } else {
                            tvHistoryStatus.setText("Could not load telemetry history");
                            Toast.makeText(ScooterDetailsActivity.this,
                                    "Failed to load history: " + error,
                                    Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            });
    }

    private void showRecordDetails(TelemetryRecord record) {
        StringBuilder details = new StringBuilder();
        details.append("Record Details\n\n");

        String displayStatus = record.status != null ? record.status :
                               record.scanType != null ? record.getScanTypeDisplay() : "Unknown";
        details.append("Status: ").append(displayStatus.toUpperCase()).append("\n\n");
        details.append("Date/Time: ").append(record.getFormattedDate()).append("\n\n");

        // Version Information
        details.append("=== VERSION INFO ===\n");
        if (record.hwVersion != null && !record.hwVersion.equals("Unknown")) {
            details.append("Hardware Version: ").append(record.hwVersion).append("\n");
        }
        if (record.swVersion != null) {
            details.append("Software Version: ").append(record.swVersion).append("\n");
        }
        if (record.embeddedSerial != null && !record.embeddedSerial.isEmpty()) {
            details.append("Embedded Serial: ").append(record.embeddedSerial).append("\n");
        }
        if (record.newVersion != null && !"scanned".equals(record.status)) {
            details.append("Target Version: ").append(record.newVersion).append("\n");
        }

        // Battery Information
        if (record.batterySOC != null || record.voltage != null || record.batteryHealth != null) {
            details.append("\n=== BATTERY INFO ===\n");
            if (record.voltage != null) {
                details.append("Voltage: ").append(String.format("%.1f V", record.voltage)).append("\n");
            }
            if (record.current != null) {
                details.append("Current: ").append(String.format("%.2f A", record.current)).append("\n");
            }
            if (record.batterySOC != null) {
                details.append("Battery SOC: ").append(record.batterySOC).append("%\n");
            }
            if (record.batteryHealth != null) {
                details.append("Battery Health: ").append(record.batteryHealth).append("%\n");
            }
            if (record.batteryChargeCycles != null) {
                details.append("Charge Cycles: ").append(record.batteryChargeCycles).append("\n");
            }
            if (record.batteryDischargeCycles != null) {
                details.append("Discharge Cycles: ").append(record.batteryDischargeCycles).append("\n");
            }
            if (record.remainingCapacityMah != null && record.fullCapacityMah != null) {
                details.append("Capacity: ").append(record.remainingCapacityMah)
                        .append(" / ").append(record.fullCapacityMah).append(" mAh\n");
            }
        }

        // Telemetry Information (from 0xA0 Running Data)
        if (record.speedKmh != null || record.odometerKm != null || record.motorTemp != null
                || record.gearLevel != null || record.faultCode != null) {
            details.append("\n=== RUNNING DATA ===\n");
            if (record.speedKmh != null) {
                details.append("Speed: ").append(String.format("%.0f km/h", record.speedKmh)).append("\n");
            }
            if (record.gearLevel != null) {
                details.append("Gear: G").append(record.gearLevel).append("\n");
            }
            if (record.odometerKm != null) {
                details.append("Total Distance: ").append(record.odometerKm).append(" km\n");
            }
            if (record.tripDistanceKm != null && record.tripDistanceKm > 0) {
                details.append("Trip Distance: ").append(record.tripDistanceKm).append(" km\n");
            }
            if (record.remainingRangeKm != null && record.remainingRangeKm > 0) {
                details.append("Remaining Range: ").append(record.remainingRangeKm).append(" km\n");
            }
            if (record.motorTemp != null) {
                details.append("Motor Temp: ").append(record.motorTemp).append("\u00B0C\n");
            }
            if (record.controllerTemp != null) {
                details.append("Controller Temp: ").append(record.controllerTemp).append("\u00B0C\n");
            }
            if (record.batteryTemp != null) {
                details.append("Battery Temp: ").append(record.batteryTemp).append("\u00B0C\n");
            }
            if (record.motorRpm != null && record.motorRpm > 0) {
                details.append("Motor RPM: ").append(record.motorRpm).append("\n");
            }
            if (record.currentLimit != null && record.currentLimit > 0) {
                details.append("Current Limit: ").append(String.format("%.1f A", record.currentLimit)).append("\n");
            }
            if (record.faultCode != null && record.faultCode > 0) {
                details.append("Fault Code: 0x").append(String.format("%04X", record.faultCode)).append("\n");
            }
        }

        // Update Status
        if (record.completedAt != null) {
            details.append("\nCompleted: ").append(record.completedAt).append("\n");
        }

        if (record.errorMessage != null && !record.errorMessage.isEmpty()) {
            details.append("\nError: ").append(record.errorMessage).append("\n");
        }

        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Scan/Update Details")
                .setMessage(details.toString())
                .setPositiveButton("OK", null)
                .show();
    }

    // ==================================================================================
    // LIFECYCLE
    // ==================================================================================

    @Override
    protected void onDestroy() {
        super.onDestroy();
        // Detach listener only — keep the BLE connection alive.
        // Connection is only released when the user explicitly presses Disconnect
        // or when the app shuts down (ServiceFactory.shutdown()).
        if (connectionService != null) {
            connectionService.setListener(null);
        }
        handler.removeCallbacksAndMessages(null);
    }
}
