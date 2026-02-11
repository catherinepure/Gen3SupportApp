package com.pure.gen3firmwareupdater;

import android.bluetooth.BluetoothAdapter;
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
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;

import com.pure.gen3firmwareupdater.services.FirmwareUpdateOrchestrator;
import com.pure.gen3firmwareupdater.services.PacketRouter;
import com.pure.gen3firmwareupdater.services.PermissionHelper;
import com.pure.gen3firmwareupdater.services.ScooterConnectionService;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;

import io.intercom.android.sdk.Intercom;

import java.util.ArrayList;
import java.util.List;

/**
 * Single activity for the entire firmware updater app.
 * Implements a linear state machine with visibility-toggled UI groups.
 */
public class FirmwareUpdaterActivity extends AppCompatActivity
        implements ScooterConnectionService.ConnectionListener,
                   FirmwareUpdateOrchestrator.FirmwareUpdateListener {

    private static final String TAG = "FirmwareUpdater";
    private static final int PERMISSION_REQUEST_CODE = 100;

    // State machine
    private enum State {
        ACTIVATION, SCANNING, CONNECTING, VERIFYING, DOWNLOADING, UPLOADING, SUCCESS, ERROR
    }

    private State currentState = State.ACTIVATION;

    // Managers
    private ScooterConnectionService connectionService;
    private FirmwareUpdateOrchestrator updateOrchestrator;
    private BLEManager bleManager; // convenience reference for device info dialog
    private SupabaseClient supabase;
    private SessionManager session;
    private Handler handler = new Handler(Looper.getMainLooper());

    // Auto-load state for distributors
    private boolean shouldAutoLoadDistributor = false;
    private String pendingDistributorId = null;
    private String targetScooterSerial = null;  // Pre-selected scooter serial from intent
    private String directConnectMac = null;      // MAC address for direct connect (skip scan)

    // Data state
    private DistributorInfo distributor;
    private List<String> scooterSerials = new ArrayList<>();
    private String connectedSerial = "";
    private String connectedDeviceName = "";
    private VersionInfo scooterVersion;
    private ConfigInfo scooterConfig;  // Configuration data from 0x01 packet
    private RunningDataInfo scooterRunningData;  // Real-time telemetry from 0xA0 packet
    private BMSDataInfo scooterBMSData;  // Battery data from 0xA1 packet
    private String deviceHardwareRevision = "";  // e.g. "HW9073_V2.92"
    private List<String> receivedPacketLog = new ArrayList<>(); // All received BLE packets for debug

    // UI references
    private TextView tvDistributorName, tvStatus;
    private View groupActivation, groupScanning, groupVerifying, groupDownloading,
            groupUploading, groupSuccess, groupError;
    private TextInputEditText etActivationCode;
    private MaterialButton btnActivate, btnScanAgain, btnAbort, btnNextScooter,
            btnChangeCode, btnRetry, btnGoBack, btnDeviceInfo, btnErrorDeviceInfo,
            btnChooseFirmware, btnBackToMenu, btnLogout;
    private ProgressBar progressUploading, progressVerifying;
    private TextView tvScooterName, tvSerialNumber, tvHwVersion, tvSwVersion, tvCompatibility;
    private TextView tvDownloadStatus, tvUploadProgress, tvUploadLog;
    private TextView tvSuccessDetails, tvErrorMessage, tvVersion;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_firmware_updater);

        initViews();
        initManagers();

        // Check if user is already logged in as a distributor
        String distributorId = session.getDistributorId();

        // Check if a specific scooter was selected (from ScooterSelectionActivity)
        targetScooterSerial = getIntent().getStringExtra("target_scooter_serial");
        if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
            Log.d(TAG, "Target scooter selected: " + targetScooterSerial);
        }

        // Check if a MAC address was provided for direct connect (skip scan)
        directConnectMac = getIntent().getStringExtra("device_mac_address");
        if (directConnectMac != null && !directConnectMac.isEmpty()) {
            Log.d(TAG, "Direct connect MAC provided: " + directConnectMac);
        }

        if (session.isDistributor() && distributorId != null && !distributorId.isEmpty()) {
            // User is logged in as distributor - set flag to auto-load after permissions
            Log.d(TAG, "User logged in as distributor, will load distributor info after permissions");
            shouldAutoLoadDistributor = true;
            pendingDistributorId = distributorId;
            // Show the "Back to Menu" button for distributors
            btnBackToMenu.setVisibility(View.VISIBLE);
        } else {
            // Regular flow - show activation code screen
            // Restore last activation code
            String lastCode = session.getLastActivationCode();
            if (!lastCode.isEmpty()) {
                etActivationCode.setText(lastCode);
            }
        }

        // Show logout button if user is logged in (provides a way out)
        if (session.isLoggedIn()) {
            btnLogout.setVisibility(View.VISIBLE);
        }

        tvVersion.setText("v" + BuildConfig.VERSION_NAME);

        // Request permissions last so we can handle auto-load after permissions are granted
        checkPermissions();
    }

    private void initViews() {
        tvDistributorName = findViewById(R.id.tvDistributorName);
        tvStatus = findViewById(R.id.tvStatus);

        groupActivation = findViewById(R.id.groupActivation);
        groupScanning = findViewById(R.id.groupScanning);
        groupVerifying = findViewById(R.id.groupVerifying);
        groupDownloading = findViewById(R.id.groupDownloading);
        groupUploading = findViewById(R.id.groupUploading);
        groupSuccess = findViewById(R.id.groupSuccess);
        groupError = findViewById(R.id.groupError);

        etActivationCode = findViewById(R.id.etActivationCode);
        btnActivate = findViewById(R.id.btnActivate);
        btnScanAgain = findViewById(R.id.btnScanAgain);
        btnAbort = findViewById(R.id.btnAbort);
        btnNextScooter = findViewById(R.id.btnNextScooter);
        btnChangeCode = findViewById(R.id.btnChangeCode);
        btnRetry = findViewById(R.id.btnRetry);
        btnGoBack = findViewById(R.id.btnGoBack);
        btnDeviceInfo = findViewById(R.id.btnDeviceInfo);
        btnErrorDeviceInfo = findViewById(R.id.btnErrorDeviceInfo);
        btnChooseFirmware = findViewById(R.id.btnChooseFirmware);
        btnBackToMenu = findViewById(R.id.btnBackToMenu);
        btnLogout = findViewById(R.id.btnLogout);

        progressUploading = findViewById(R.id.progressUploading);
        progressVerifying = findViewById(R.id.progressVerifying);

        tvScooterName = findViewById(R.id.tvScooterName);
        tvSerialNumber = findViewById(R.id.tvSerialNumber);
        tvHwVersion = findViewById(R.id.tvHwVersion);
        tvSwVersion = findViewById(R.id.tvSwVersion);
        tvCompatibility = findViewById(R.id.tvCompatibility);
        tvDownloadStatus = findViewById(R.id.tvDownloadStatus);
        tvUploadProgress = findViewById(R.id.tvUploadProgress);
        tvUploadLog = findViewById(R.id.tvUploadLog);
        tvSuccessDetails = findViewById(R.id.tvSuccessDetails);
        tvErrorMessage = findViewById(R.id.tvErrorMessage);
        tvVersion = findViewById(R.id.tvVersion);

        // Button listeners
        btnActivate.setOnClickListener(v -> onActivateClicked());
        btnScanAgain.setOnClickListener(v -> startBleScan());
        btnAbort.setOnClickListener(v -> onAbortClicked());
        btnNextScooter.setOnClickListener(v -> resetForNextScooter());
        btnChangeCode.setOnClickListener(v -> resetToActivation());
        btnRetry.setOnClickListener(v -> onRetryClicked());
        btnGoBack.setOnClickListener(v -> resetForNextScooter());
        btnDeviceInfo.setOnClickListener(v -> showDeviceInfoDialog());
        btnErrorDeviceInfo.setOnClickListener(v -> showDeviceInfoDialog());
        btnBackToMenu.setOnClickListener(v -> returnToDistributorMenu());
        btnLogout.setOnClickListener(v -> logout());
        btnChooseFirmware.setOnClickListener(v -> {
            // If firmware is already selected, show option to proceed or change
            FirmwareVersion targetFw = updateOrchestrator.getTargetFirmware();
            if (targetFw != null) {
                new AlertDialog.Builder(FirmwareUpdaterActivity.this)
                        .setTitle("Firmware Installation")
                        .setMessage("Install " + targetFw.version_label + "?")
                        .setPositiveButton("Install Now", (dialog, which) -> updateOrchestrator.downloadAndInstall())
                        .setNeutralButton("Choose Different Version", (dialog, which) -> showFirmwareSelectionDialog())
                        .setNegativeButton("Cancel", null)
                        .show();
            } else {
                showFirmwareSelectionDialog();
            }
        });
    }

    private void initManagers() {
        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        supabase = ServiceFactory.getSupabaseClient();
        bleManager = new BLEManager(this, null);
        connectionService = new ScooterConnectionService(bleManager, handler);
        connectionService.setListener(this);
        bleManager.setListener(connectionService);
        updateOrchestrator = new FirmwareUpdateOrchestrator(supabase, bleManager);
        updateOrchestrator.setListener(this);
    }

    // ==================================================================================
    // STATE MANAGEMENT
    // ==================================================================================

    private void setState(State state) {
        currentState = state;
        runOnUiThread(() -> {
            // Hide all groups
            groupActivation.setVisibility(View.GONE);
            groupScanning.setVisibility(View.GONE);
            groupVerifying.setVisibility(View.GONE);
            groupDownloading.setVisibility(View.GONE);
            groupUploading.setVisibility(View.GONE);
            groupSuccess.setVisibility(View.GONE);
            groupError.setVisibility(View.GONE);

            // Show the active group
            switch (state) {
                case ACTIVATION:
                    groupActivation.setVisibility(View.VISIBLE);
                    tvStatus.setText("Enter activation code to begin");
                    break;
                case SCANNING:
                    groupScanning.setVisibility(View.VISIBLE);
                    if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
                        tvStatus.setText("Scanning for scooter: " + targetScooterSerial + "...");
                    } else {
                        tvStatus.setText("Scanning for scooters...");
                    }
                    break;
                case CONNECTING:
                    groupVerifying.setVisibility(View.VISIBLE);
                    tvStatus.setText("Connecting to scooter...");
                    break;
                case VERIFYING:
                    groupVerifying.setVisibility(View.VISIBLE);
                    tvStatus.setText("Verifying scooter...");
                    break;
                case DOWNLOADING:
                    groupDownloading.setVisibility(View.VISIBLE);
                    tvStatus.setText("Downloading firmware...");
                    break;
                case UPLOADING:
                    groupUploading.setVisibility(View.VISIBLE);
                    tvStatus.setText("Uploading firmware - DO NOT DISCONNECT");
                    break;
                case SUCCESS:
                    groupSuccess.setVisibility(View.VISIBLE);
                    tvStatus.setText("Update complete");
                    break;
                case ERROR:
                    groupError.setVisibility(View.VISIBLE);
                    tvStatus.setText("Error occurred");
                    break;
            }
        });
    }

    private void showError(String message) {
        runOnUiThread(() -> {
            tvErrorMessage.setText(message);
            setState(State.ERROR);
        });
    }

    // ==================================================================================
    // ACTIVATION CODE
    // ==================================================================================

    private void autoLoadDistributorInfo(String distributorId) {
        tvStatus.setText("Loading distributor information...");

        supabase.getDistributorById(distributorId, new SupabaseClient.Callback<DistributorInfo>() {
            @Override
            public void onSuccess(DistributorInfo result) {
                distributor = result;
                Log.d(TAG, "Distributor auto-loaded: " + result.name);

                tvDistributorName.setText("Distributor: " + result.name);
                tvDistributorName.setVisibility(View.VISIBLE);

                // If a target scooter was selected, go directly to scanning (or direct connect)
                if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
                    // Add the target scooter to the list so it can be matched
                    scooterSerials.clear();
                    scooterSerials.add(targetScooterSerial);

                    if (directConnectMac != null && !directConnectMac.isEmpty()) {
                        // Direct connect — skip scan, connect via saved MAC address
                        Log.d(TAG, "Direct connecting to " + targetScooterSerial + " via MAC " + directConnectMac);
                        directConnectToDevice();
                    } else {
                        // No MAC — scan for the target scooter
                        Log.d(TAG, "Target scooter specified, starting scan immediately");
                        setState(State.SCANNING);
                        startBleScan();
                    }
                } else {
                    // Fetch scooter list and proceed to scanning
                    fetchScooterList();
                }
            }

            @Override
            public void onError(String error) {
                // If auto-load fails, fall back to activation code screen
                Log.e(TAG, "Failed to auto-load distributor info: " + error);
                tvStatus.setText("Enter activation code to begin");
                Toast.makeText(FirmwareUpdaterActivity.this,
                        "Could not load distributor info. Please enter activation code.",
                        Toast.LENGTH_LONG).show();
            }
        });
    }

    private void onActivateClicked() {
        String code = etActivationCode.getText() != null
                ? etActivationCode.getText().toString().trim().toUpperCase() : "";
        if (code.isEmpty()) {
            Toast.makeText(this, "Enter an activation code", Toast.LENGTH_SHORT).show();
            return;
        }

        btnActivate.setEnabled(false);
        tvStatus.setText("Validating activation code...");

        supabase.validateActivationCode(code, new SupabaseClient.Callback<DistributorInfo>() {
            @Override
            public void onSuccess(DistributorInfo result) {
                distributor = result;
                Log.d(TAG, "Distributor validated: " + result.name);

                // Save code for next launch
                session.setLastActivationCode(code);

                tvDistributorName.setText("Distributor: " + result.name);
                tvDistributorName.setVisibility(View.VISIBLE);

                // Fetch scooter list
                fetchScooterList();
            }

            @Override
            public void onError(String error) {
                btnActivate.setEnabled(true);
                if (error.contains("Network error") || error.contains("resolve host")
                        || error.contains("Unable to resolve") || error.contains("Server error")) {
                    Toast.makeText(FirmwareUpdaterActivity.this,
                            "No internet connection. Please check WiFi/mobile data.",
                            Toast.LENGTH_LONG).show();
                    tvStatus.setText("No internet — check connection and retry");
                } else {
                    Toast.makeText(FirmwareUpdaterActivity.this,
                            "Invalid activation code", Toast.LENGTH_LONG).show();
                    tvStatus.setText("Enter activation code to begin");
                }
            }
        });
    }

    private void fetchScooterList() {
        supabase.getDistributorScooters(distributor.id, new SupabaseClient.Callback<List<String>>() {
            @Override
            public void onSuccess(List<String> result) {
                scooterSerials = result;
                Log.d(TAG, "Scooter serials loaded: " + result.size());
                btnActivate.setEnabled(true);
                startBleScan();
            }

            @Override
            public void onError(String error) {
                btnActivate.setEnabled(true);
                showError("Failed to load scooter list: " + error);
            }
        });
    }

    // ==================================================================================
    // BLE SCANNING
    // ==================================================================================

    private void startBleScan() {
        if (!connectionService.isBluetoothAvailable()) {
            showError("Bluetooth is not enabled. Please enable Bluetooth and try again.");
            return;
        }

        // Reset connection state
        connectedSerial = "";
        scooterVersion = null;
        scooterConfig = null;
        updateOrchestrator.reset();
        btnChooseFirmware.setVisibility(View.GONE);

        setState(State.SCANNING);
        connectionService.startScan();
    }

    /**
     * Connect directly to a device using its MAC address, skipping BLE scan.
     * Used when launching from ScooterDetailsActivity where we already know the device.
     */
    private void directConnectToDevice() {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            showError("Bluetooth is not enabled. Please enable Bluetooth and try again.");
            return;
        }

        try {
            BluetoothDevice device = adapter.getRemoteDevice(directConnectMac);
            connectToScooter(device);
        } catch (IllegalArgumentException e) {
            Log.e(TAG, "Invalid MAC address: " + directConnectMac, e);
            showError("Invalid device address. Please try scanning again.");
        }
    }

    // ==================================================================================
    // ScooterConnectionService.ConnectionListener IMPLEMENTATION
    // ==================================================================================

    @Override
    public void onScanStarted() {
        Log.d(TAG, "Scan started");
    }

    @Override
    public void onDevicesFound(List<ScanResult> devices) {
        Log.d(TAG, "Scan completed, found " + devices.size() + " devices");

        if (devices.isEmpty()) {
            showError("No ZYD scooters found nearby. Make sure the scooter is powered on and in range.");
            return;
        }

        // If a target scooter was specified, try to connect to it automatically
        if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
            Log.d(TAG, "Looking for target scooter: " + targetScooterSerial);
            for (ScanResult result : devices) {
                BluetoothDevice device = result.getDevice();
                String deviceName = device.getName();
                if (deviceName != null && deviceName.equals(targetScooterSerial)) {
                    Log.d(TAG, "Found target scooter, connecting automatically");
                    connectToScooter(device);
                    return;
                }
            }
            Log.w(TAG, "Target scooter " + targetScooterSerial + " not found in scan results");
            showError("Scooter " + targetScooterSerial + " not found nearby. Make sure it is powered on and in range.");
            return;
        }

        // No target scooter specified - show picker so user can select
        showDevicePicker(devices);
    }

    @Override
    public void onScanFailed(String error) {
        showError("Scan failed: " + error);
    }

    private void showDevicePicker(List<ScanResult> devices) {
        if (isFinishing() || isDestroyed()) return;
        String[] names = new String[devices.size()];
        for (int i = 0; i < devices.size(); i++) {
            BluetoothDevice d = devices.get(i).getDevice();
            String name = d.getName() != null ? d.getName() : "Unknown";
            names[i] = name + " (RSSI: " + devices.get(i).getRssi() + ")";
        }

        new AlertDialog.Builder(this)
                .setTitle("Select Scooter")
                .setItems(names, (dialog, which) -> {
                    connectToScooter(devices.get(which).getDevice());
                })
                .setNegativeButton("Cancel", (dialog, which) -> setState(State.SCANNING))
                .show();
    }

    private void connectToScooter(BluetoothDevice device) {
        connectedDeviceName = device.getName() != null ? device.getName() : "ZYD Device";
        setState(State.CONNECTING);
        runOnUiThread(() -> {
            tvScooterName.setText("Device: " + connectedDeviceName);
            tvSerialNumber.setText("Reading serial number...");
            tvHwVersion.setText("");
            tvSwVersion.setText("");
            tvCompatibility.setText("");
            progressVerifying.setVisibility(View.VISIBLE);
        });
        connectionService.connectToDevice(device);
    }

    @Override
    public void onConnecting(String deviceName) {
        // Already handled in connectToScooter()
    }

    @Override
    public void onConnected(String deviceName, String serialNumber) {
        Log.d(TAG, "Connected: " + deviceName + " serial: " + serialNumber);
        connectedDeviceName = deviceName;
        connectedSerial = serialNumber;
        runOnUiThread(() -> {
            tvScooterName.setText("Device: " + deviceName);
            tvSerialNumber.setText("ZYD: " + connectedDeviceName + "  (SN: " + serialNumber + ")");
        });
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                 String modelNumber, String manufacturer) {
        Log.d(TAG, "Device Info: hwRev='" + hardwareRevision + "' fwRev='" + firmwareRevision
                + "' model='" + modelNumber + "' mfr='" + manufacturer + "'");
        deviceHardwareRevision = hardwareRevision != null ? hardwareRevision : "";
    }

    @Override
    public void onVersionReceived(VersionInfo version) {
        Log.d(TAG, "Version info parsed: " + version);
        scooterVersion = version;
        runOnUiThread(() -> onVersionDataReady());
    }

    @Override
    public void onRunningDataReceived(RunningDataInfo data) {
        scooterRunningData = data;
    }

    @Override
    public void onBMSDataReceived(BMSDataInfo data) {
        scooterBMSData = data;
    }

    @Override
    public void onConfigReceived(ConfigInfo config) {
        scooterConfig = config;
    }

    @Override
    public void onStatusChanged(String status) {
        Log.d(TAG, "Connection status: " + status);
        runOnUiThread(() -> tvStatus.setText(status));
    }

    @Override
    public void onDisconnected(boolean wasExpected) {
        Log.d(TAG, "Disconnected (expected=" + wasExpected + ")");
        if (currentState == State.UPLOADING) {
            showError("Connection lost during firmware upload! The scooter may need recovery.");
        } else if (currentState != State.SUCCESS && currentState != State.ERROR
                && currentState != State.ACTIVATION) {
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
        logPacket(data);
    }

    @Override
    public void onCommandSent(boolean success, String message) {
        // No-op for general commands
    }

    /**
     * Log a raw BLE packet for the device info debug dialog.
     * Stores packet name, hex dump, and byte-by-byte breakdown.
     */
    private void logPacket(byte[] data) {
        int packetType = data[1] & 0xFF;
        String hex = ProtocolUtils.bytesToHex(data);
        String packetName = PacketRouter.getPacketName(packetType);

        Log.d(TAG, "onDataReceived: " + data.length + " bytes, cmd=0x"
                + String.format("%02X", packetType) + " raw=" + hex);

        StringBuilder entry = new StringBuilder();
        entry.append(packetName).append(" [").append(data.length).append(" bytes]\n");
        entry.append("HEX: ").append(hex).append("\n");

        for (int i = 0; i < data.length; i++) {
            int b = data[i] & 0xFF;
            char ch = (b >= 0x20 && b <= 0x7E) ? (char) b : '.';
            entry.append(String.format("  [%2d] 0x%02X = %3d  '%c'", i, b, b, ch));
            if (packetType == 0xB0 && i >= 5 && i <= 10) {
                entry.append(String.format("  nibble=V%d.%d", (b >> 4) & 0x0F, b & 0x0F));
            }
            entry.append("\n");
        }
        receivedPacketLog.add(entry.toString());
    }

    // ==================================================================================
    // VERIFICATION (delegates to FirmwareUpdateOrchestrator)
    // ==================================================================================

    private void onVersionDataReady() {
        setState(State.VERIFYING);

        // Update UI with version info
        String hwVersionForMatch = scooterVersion.controllerHwVersion;
        tvHwVersion.setText("Controller HW: " + hwVersionForMatch
                + (deviceHardwareRevision.isEmpty() ? ""
                   : "  (2A27: " + deviceHardwareRevision + ")"));
        tvSwVersion.setText("Controller SW: " + scooterVersion.controllerSwVersion);
        tvCompatibility.setText("Checking...");
        progressVerifying.setVisibility(View.VISIBLE);

        // Pass connection data to orchestrator and start verification
        updateOrchestrator.setDistributor(distributor);
        updateOrchestrator.setConnectionData(connectedDeviceName, connectedSerial,
                scooterVersion, scooterRunningData, scooterBMSData, deviceHardwareRevision);

        updateOrchestrator.verifyAndMatchScooter(scooterSerials, session.getDistributorId());
    }

    // ==================================================================================
    // FirmwareUpdateOrchestrator.FirmwareUpdateListener IMPLEMENTATION
    // ==================================================================================

    @Override
    public void onScooterVerified(String scooterId) {
        runOnUiThread(() -> tvCompatibility.setText("Scooter verified. Checking firmware..."));
    }

    @Override
    public void onFirmwareOptionsLoaded(List<FirmwareVersion> firmwareList, FirmwareVersion recommended) {
        runOnUiThread(() -> {
            progressVerifying.setVisibility(View.GONE);
            tvCompatibility.setText("Latest firmware: "
                    + recommended.version_label + " (tap below to change)");
            tvCompatibility.setTextColor(
                    ContextCompat.getColor(FirmwareUpdaterActivity.this, R.color.success));

            // Show firmware selection button
            btnChooseFirmware.setVisibility(View.VISIBLE);
            btnChooseFirmware.setText("Install " + recommended.version_label);
        });
    }

    @Override
    public void onFirmwareDownloadStarted(String versionLabel) {
        runOnUiThread(() -> {
            setState(State.DOWNLOADING);
            tvDownloadStatus.setText("Downloading " + versionLabel + "...");
        });
    }

    @Override
    public void onFirmwareDownloaded(int byteCount) {
        Log.d(TAG, "Firmware downloaded: " + byteCount + " bytes");
        runOnUiThread(() -> {
            setState(State.UPLOADING);
            progressUploading.setProgress(0);
            tvUploadProgress.setText("Preparing upload...");
            tvUploadLog.setText("");
        });
    }

    @Override
    public void onUploadStarted() {
        Log.d(TAG, "Upload started");
    }

    @Override
    public void onUploadProgress(int current, int total, int percentage) {
        runOnUiThread(() -> {
            progressUploading.setProgress(percentage);
            tvUploadProgress.setText(current + " / " + total + " packets (" + percentage + "%)");
        });
    }

    @Override
    public void onUploadLog(String message, String level) {
        runOnUiThread(() -> tvUploadLog.setText(message));
    }

    @Override
    public void onUploadCompleted(String scooterName, String newVersion, String oldVersion) {
        runOnUiThread(() -> {
            tvSuccessDetails.setText("Scooter: " + scooterName
                    + "\nFirmware: " + newVersion
                    + "\nPrevious: " + oldVersion);
            setState(State.SUCCESS);
        });
    }

    @Override
    public void onUploadFailed(String error) {
        showError(error);
    }

    @Override
    public void onWarning(String message) {
        Log.w(TAG, "Orchestrator warning: " + message);
    }

    @Override
    public void onError(String error) {
        runOnUiThread(() -> {
            progressVerifying.setVisibility(View.GONE);
            showError(error);
        });
    }

    private void onAbortClicked() {
        updateOrchestrator.abortUpload();
    }

    // ==================================================================================
    // DEVICE INFO DIALOG
    // ==================================================================================

    private void showFirmwareSelectionDialog() {
        if (isFinishing() || isDestroyed()) return;
        if (scooterVersion == null) {
            Toast.makeText(this, "No version info available", Toast.LENGTH_SHORT).show();
            return;
        }

        // Get the hardware version to match against
        String hwVersionForMatch = deviceHardwareRevision.isEmpty()
                ? scooterVersion.controllerHwVersion
                : deviceHardwareRevision;

        Log.d(TAG, "Fetching all firmware versions for HW: " + hwVersionForMatch);

        // Show progress
        progressVerifying.setVisibility(View.VISIBLE);
        tvCompatibility.setText("Loading firmware options...");

        // Fetch all available firmware versions for this hardware
        supabase.getAllFirmwareForHardware(hwVersionForMatch,
                new SupabaseClient.Callback<List<FirmwareVersion>>() {
            @Override
            public void onSuccess(List<FirmwareVersion> firmwareList) {
                runOnUiThread(() -> {
                    progressVerifying.setVisibility(View.GONE);

                    if (firmwareList.isEmpty()) {
                        Toast.makeText(FirmwareUpdaterActivity.this,
                                "No firmware available for this hardware version",
                                Toast.LENGTH_SHORT).show();
                        return;
                    }

                    // Build firmware selection dialog
                    String[] firmwareLabels = new String[firmwareList.size()];
                    for (int i = 0; i < firmwareList.size(); i++) {
                        FirmwareVersion fw = firmwareList.get(i);
                        String label = fw.version_label;
                        if (fw.release_notes != null && !fw.release_notes.isEmpty()) {
                            label += " - " + fw.release_notes;
                        }
                        firmwareLabels[i] = label;
                    }

                    new AlertDialog.Builder(FirmwareUpdaterActivity.this)
                            .setTitle("Select Firmware Version")
                            .setItems(firmwareLabels, (dialog, which) -> {
                                // User selected a firmware
                                FirmwareVersion selectedFw = firmwareList.get(which);
                                updateOrchestrator.setTargetFirmware(selectedFw);

                                // Update UI
                                tvCompatibility.setText("Selected: " + selectedFw.version_label);
                                btnChooseFirmware.setText("Install " + selectedFw.version_label);

                                // Start download
                                handler.postDelayed(() -> updateOrchestrator.downloadAndInstall(), 500);
                            })
                            .setNegativeButton("Cancel", null)
                            .show();
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    progressVerifying.setVisibility(View.GONE);
                    Toast.makeText(FirmwareUpdaterActivity.this,
                            "Failed to load firmware: " + error,
                            Toast.LENGTH_LONG).show();
                    Log.e(TAG, "Firmware fetch error: " + error);
                });
            }
        });
    }

    private void showDeviceInfoDialog() {
        if (isFinishing() || isDestroyed()) return;
        StringBuilder sb = new StringBuilder();

        // Section 1: BLE Scan Info
        sb.append("═══ BLE SCAN INFO ═══\n");
        sb.append("Source: BLE advertising data\n\n");
        sb.append("Device Name: ").append(connectedDeviceName).append("\n");
        if (bleManager.getBluetoothGatt() != null && bleManager.getBluetoothGatt().getDevice() != null) {
            sb.append("MAC Address: ").append(bleManager.getBluetoothGatt().getDevice().getAddress()).append("\n");
        }
        sb.append("\n");

        // Section 2: Device Information Service (0x180A)
        sb.append("═══ DEVICE INFO SERVICE (0x180A) ═══\n");
        sb.append("Source: BLE GATT standard characteristics\n\n");
        sb.append("Serial Number (2A25): '").append(bleManager.getDeviceSerialNumber()).append("'\n");
        sb.append("Model Number (2A24): '").append(bleManager.getDeviceModelNumber()).append("'\n");
        sb.append("Hardware Rev (2A27): '").append(bleManager.getDeviceHardwareRevision()).append("'\n");
        sb.append("Firmware Rev (2A26): '").append(bleManager.getDeviceFirmwareRevision()).append("'\n");
        sb.append("Software Rev (2A28): '").append(bleManager.getDeviceSoftwareRevision()).append("'\n");
        sb.append("Manufacturer (2A29): '").append(bleManager.getDeviceManufacturer()).append("'\n");
        sb.append("\n");

        // Section 3: B0 Version Packet
        sb.append("═══ B0 VERSION PACKET ═══\n");
        sb.append("Source: 0xB0 command response via FFF2 notify\n\n");
        if (scooterVersion != null) {
            sb.append("Packet length: ").append(scooterVersion.packetLength).append(" bytes\n");
            sb.append("Model code: 0x").append(String.format("%04X", scooterVersion.model))
                    .append(" (").append(scooterVersion.model).append(")\n");
            if (scooterVersion.embeddedSerialNumber != null && !scooterVersion.embeddedSerialNumber.isEmpty()) {
                sb.append("Embedded SN: '").append(scooterVersion.embeddedSerialNumber).append("'\n");
            }
            sb.append("\n");
            sb.append("Controller HW: ").append(scooterVersion.controllerHwVersion).append("\n");
            sb.append("Controller SW: ").append(scooterVersion.controllerSwVersion).append("\n");
            sb.append("Meter HW: ").append(scooterVersion.meterHwVersion).append("\n");
            sb.append("Meter SW: ").append(scooterVersion.meterSwVersion).append("\n");
            sb.append("BMS HW: ").append(scooterVersion.bmsHwVersion).append("\n");
            sb.append("BMS SW: ").append(scooterVersion.bmsSwVersion).append("\n");
            sb.append("\nRaw B0 hex:\n").append(scooterVersion.rawHex).append("\n");
        } else {
            sb.append("(not received yet)\n");
        }
        sb.append("\n");

        // Section 4: 0x01 Configuration Packet
        sb.append("═══ 0x01 CONFIGURATION/SETTINGS ═══\n");
        sb.append("Source: 0x01 packet auto-uploaded by meter\n\n");
        if (scooterConfig != null) {
            sb.append("Software Version: ").append(scooterConfig.softwareVersion).append("\n\n");

            sb.append("Speed Limits (").append(scooterConfig.getSpeedUnit()).append("):\n");
            sb.append("  Cruise Min: ").append(scooterConfig.minCruiseSpeed).append("\n");
            sb.append("  Eco Mode: ").append(scooterConfig.maxSpeedEco).append("\n");
            sb.append("  Comfort Mode: ").append(scooterConfig.maxSpeedComfort).append("\n");
            sb.append("  Sport Mode: ").append(scooterConfig.maxSpeedSport).append("\n\n");

            sb.append("Fault Status:\n");
            sb.append("  ").append(scooterConfig.getActiveFaults().replace("\n", "\n  ")).append("\n\n");

            sb.append("Enabled Panels: ").append(scooterConfig.getEnabledPanels()).append("\n");
            sb.append("Speed Unit: ").append(scooterConfig.getSpeedUnit()).append("\n");

            sb.append("\nRaw 0x01 hex:\n").append(scooterConfig.rawHex).append("\n");
        } else {
            sb.append("(not received yet)\n");
        }
        sb.append("\n");

        // Section 5: Protocol Info
        sb.append("═══ PROTOCOL INFO ═══\n");
        sb.append("Header byte: 0x").append(String.format("%02X", bleManager.getProtocolHeader())).append("\n");
        sb.append("\n");

        // Section 6: All received packets
        sb.append("═══ ALL RECEIVED PACKETS ═══\n");
        sb.append("Source: FFF2 notify characteristic\n\n");
        if (receivedPacketLog.isEmpty()) {
            sb.append("(no packets received yet)\n");
        } else {
            for (int i = 0; i < receivedPacketLog.size(); i++) {
                sb.append("--- Packet #").append(i + 1).append(" ---\n");
                sb.append(receivedPacketLog.get(i)).append("\n");
            }
        }

        // Show in a scrollable dialog
        android.widget.ScrollView scrollView = new android.widget.ScrollView(this);
        TextView tv = new TextView(this);
        tv.setText(sb.toString());
        tv.setTextSize(11);
        tv.setTypeface(android.graphics.Typeface.MONOSPACE);
        tv.setPadding(32, 24, 32, 24);
        tv.setTextIsSelectable(true);
        scrollView.addView(tv);

        new AlertDialog.Builder(this)
                .setTitle("All Scooter Data")
                .setView(scrollView)
                .setPositiveButton("Close", null)
                .show();
    }

    // ==================================================================================
    // NAVIGATION HELPERS
    // ==================================================================================

    private void resetForNextScooter() {
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.disconnect();
        }
        connectedSerial = "";
        deviceHardwareRevision = "";
        receivedPacketLog.clear();
        scooterVersion = null;
        scooterConfig = null;
        updateOrchestrator.reset();
        btnChooseFirmware.setVisibility(View.GONE);

        handler.postDelayed(this::startBleScan, 500);
    }

    private void resetToActivation() {
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.disconnect();
        }
        distributor = null;
        scooterSerials.clear();
        connectedSerial = "";
        deviceHardwareRevision = "";
        receivedPacketLog.clear();
        scooterVersion = null;
        scooterConfig = null;
        updateOrchestrator.reset();
        btnChooseFirmware.setVisibility(View.GONE);

        tvDistributorName.setVisibility(View.GONE);
        setState(State.ACTIVATION);
    }

    private void returnToDistributorMenu() {
        // Disconnect if connected
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.disconnect();
        }

        // Go back to distributor menu
        Intent intent = new Intent(FirmwareUpdaterActivity.this, DistributorMenuActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        startActivity(intent);
        finish();
    }

    private void logout() {
        // Disconnect BLE if connected
        if (connectionService != null && connectionService.isConnected()) {
            connectionService.disconnect();
        }

        // Clear session and go to registration choice
        session.clearSession();
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
            Intercom.client().logout();
        }
        Intent intent = new Intent(FirmwareUpdaterActivity.this, RegistrationChoiceActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void onRetryClicked() {
        // Retry from scanning if we have a valid distributor, otherwise from activation
        if (distributor != null && !scooterSerials.isEmpty()) {
            startBleScan();
        } else {
            resetToActivation();
        }
    }

    // ==================================================================================
    // PERMISSIONS
    // ==================================================================================

    private void checkPermissions() {
        List<String> needed = PermissionHelper.getNeededBLEPermissions(this);

        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this,
                    needed.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        } else {
            // Permissions already granted - check if we need to auto-load distributor info
            if (shouldAutoLoadDistributor && pendingDistributorId != null) {
                Log.d(TAG, "Permissions already granted, auto-loading distributor info for ID: " + pendingDistributorId);
                autoLoadDistributorInfo(pendingDistributorId);
                shouldAutoLoadDistributor = false;
                pendingDistributorId = null;
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            for (int result : grantResults) {
                if (result != PackageManager.PERMISSION_GRANTED) {
                    Toast.makeText(this,
                            "Bluetooth and location permissions are required",
                            Toast.LENGTH_LONG).show();
                    return;
                }
            }

            // Permissions granted - check if we need to auto-load distributor info
            if (shouldAutoLoadDistributor && pendingDistributorId != null) {
                Log.d(TAG, "Permissions granted, auto-loading distributor info for ID: " + pendingDistributorId);
                autoLoadDistributorInfo(pendingDistributorId);
                shouldAutoLoadDistributor = false;
                pendingDistributorId = null;
            }
        }
    }

    // ==================================================================================
    // LIFECYCLE
    // ==================================================================================

    @Override
    protected void onPause() {
        super.onPause();
        // Disconnect BLE when app goes to background to avoid holding the connection
        if (isFinishing() && connectionService != null) {
            connectionService.cleanup();
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        // Ensure BLE is disconnected when activity is no longer visible
        if (connectionService != null && connectionService.isConnected()) {
            handler.removeCallbacksAndMessages(null);
            connectionService.disconnect();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        handler.removeCallbacksAndMessages(null);
        if (connectionService != null) {
            connectionService.cleanup();
        }
        // Note: supabase is managed by ServiceFactory (shared singleton), don't shutdown here
    }

    @Override
    public void onBackPressed() {
        if (currentState == State.UPLOADING) {
            // Prevent back during upload
            Toast.makeText(this, "Cannot go back during firmware upload",
                    Toast.LENGTH_SHORT).show();
            return;
        }

        // Check if user is a distributor - they should go back to menu
        if (session.isDistributor()) {
            returnToDistributorMenu();
            return;
        }

        if (currentState != State.ACTIVATION) {
            if (connectionService != null && connectionService.isConnected()) {
                connectionService.disconnect();
            }
            if (distributor != null) {
                startBleScan();
            } else {
                resetToActivation();
            }
        } else {
            super.onBackPressed();
        }
    }
}
