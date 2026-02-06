package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.util.Patterns;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import android.bluetooth.le.ScanResult;

import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.JsonObject;

import java.util.List;

/**
 * User Registration - Connect to scooter and register
 * Captures scooter telemetry during registration
 */
public class RegisterUserActivity extends AppCompatActivity implements BLEListener {
    private static final String TAG = "RegisterUserActivity";

    private TextInputEditText etEmail, etPassword, etConfirmPassword;
    private TextInputEditText etFirstName, etLastName;
    private Spinner spinnerAgeRange, spinnerGender, spinnerScooterUse;
    private Button btnConnectScooter, btnRegister;
    private TextView tvScooterStatus, tvLogin;
    private ProgressBar progressBar;

    private BLEManager bleManager;
    private AuthClient authClient;

    private String connectedScooterSerial;
    private VersionInfo scooterVersion;
    private ConfigInfo scooterConfig;
    private boolean scooterConnected = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register_user);

        // Initialize BLE and Auth
        bleManager = new BLEManager(this, this);
        authClient = new AuthClient();

        // Initialize views
        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        etConfirmPassword = findViewById(R.id.etConfirmPassword);
        etFirstName = findViewById(R.id.etFirstName);
        etLastName = findViewById(R.id.etLastName);
        spinnerAgeRange = findViewById(R.id.spinnerAgeRange);
        spinnerGender = findViewById(R.id.spinnerGender);
        spinnerScooterUse = findViewById(R.id.spinnerScooterUse);
        btnConnectScooter = findViewById(R.id.btnConnectScooter);
        btnRegister = findViewById(R.id.btnRegister);
        tvScooterStatus = findViewById(R.id.tvScooterStatus);
        tvLogin = findViewById(R.id.tvLogin);
        progressBar = findViewById(R.id.progressBar);

        // Setup spinners
        setupSpinners();

        // Set up click listeners
        btnConnectScooter.setOnClickListener(v -> connectToScooter());
        btnRegister.setOnClickListener(v -> register());
        tvLogin.setOnClickListener(v -> finish());

        // Register button disabled until scooter connected
        btnRegister.setEnabled(false);
    }

    private void setupSpinners() {
        // Age Range
        String[] ageRanges = {"Select Age Range", "<18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"};
        ArrayAdapter<String> ageAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, ageRanges);
        ageAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAgeRange.setAdapter(ageAdapter);

        // Gender
        String[] genders = {"Select Gender", "Male", "Female", "Other", "Prefer not to say"};
        ArrayAdapter<String> genderAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, genders);
        genderAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerGender.setAdapter(genderAdapter);

        // Scooter Use
        String[] scooterUses = {"Select Use Type", "Business", "Pleasure", "Both"};
        ArrayAdapter<String> useAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, scooterUses);
        useAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerScooterUse.setAdapter(useAdapter);
    }

    private void connectToScooter() {
        tvScooterStatus.setText("Scanning for scooters...");
        btnConnectScooter.setEnabled(false);

        // Start BLE scan
        if (!bleManager.isBluetoothAvailable()) {
            Toast.makeText(this, "Please enable Bluetooth", Toast.LENGTH_SHORT).show();
            btnConnectScooter.setEnabled(true);
            return;
        }

        bleManager.startScanning();
    }

    private void register() {
        String email = etEmail.getText() != null ? etEmail.getText().toString().trim() : "";
        String password = etPassword.getText() != null ? etPassword.getText().toString() : "";
        String confirmPassword = etConfirmPassword.getText() != null ? etConfirmPassword.getText().toString() : "";

        // Validation
        if (!scooterConnected) {
            Toast.makeText(this, "Please connect to your scooter first", Toast.LENGTH_SHORT).show();
            return;
        }

        if (email.isEmpty()) {
            Toast.makeText(this, "Please enter your email", Toast.LENGTH_SHORT).show();
            return;
        }

        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            Toast.makeText(this, "Please enter a valid email address", Toast.LENGTH_SHORT).show();
            return;
        }

        if (password.isEmpty()) {
            Toast.makeText(this, "Please enter a password", Toast.LENGTH_SHORT).show();
            return;
        }

        if (password.length() < 8) {
            Toast.makeText(this, "Password must be at least 8 characters", Toast.LENGTH_SHORT).show();
            return;
        }

        if (!password.equals(confirmPassword)) {
            Toast.makeText(this, "Passwords do not match", Toast.LENGTH_SHORT).show();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);
        btnRegister.setEnabled(false);

        // Build registration data
        JsonObject registrationData = new JsonObject();
        registrationData.addProperty("email", email);
        registrationData.addProperty("password", password);

        // Optional profile fields
        String firstName = etFirstName.getText() != null ? etFirstName.getText().toString().trim() : "";
        String lastName = etLastName.getText() != null ? etLastName.getText().toString().trim() : "";
        if (!firstName.isEmpty()) registrationData.addProperty("first_name", firstName);
        if (!lastName.isEmpty()) registrationData.addProperty("last_name", lastName);

        // Optional dropdowns
        if (spinnerAgeRange.getSelectedItemPosition() > 0) {
            registrationData.addProperty("age_range", spinnerAgeRange.getSelectedItem().toString());
        }
        if (spinnerGender.getSelectedItemPosition() > 0) {
            registrationData.addProperty("gender", spinnerGender.getSelectedItem().toString());
        }
        if (spinnerScooterUse.getSelectedItemPosition() > 0) {
            registrationData.addProperty("scooter_use_type", spinnerScooterUse.getSelectedItem().toString());
        }

        // Scooter data
        registrationData.addProperty("scooter_serial", connectedScooterSerial);

        // Telemetry data
        JsonObject telemetry = new JsonObject();
        if (scooterVersion != null) {
            telemetry.addProperty("controller_hw_version", scooterVersion.controllerHwVersion);
            telemetry.addProperty("controller_sw_version", scooterVersion.controllerSwVersion);
            telemetry.addProperty("bms_hw_version", scooterVersion.bmsHwVersion);
            telemetry.addProperty("bms_sw_version", scooterVersion.bmsSwVersion);
        }
        if (scooterConfig != null) {
            // Add config data if available (0x01 packet)
            telemetry.addProperty("max_speed_sport", scooterConfig.maxSpeedSport);
            // Add more config fields as needed
        }
        registrationData.add("telemetry", telemetry);

        // Call registration endpoint
        authClient.registerUser(registrationData, new AuthClient.Callback<Void>() {
            @Override
            public void onSuccess(Void result) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnRegister.setEnabled(true);

                    new AlertDialog.Builder(RegisterUserActivity.this)
                            .setTitle("Registration Successful")
                            .setMessage("Please check your email to verify your account. " +
                                    "Click the verification link, then return to login.")
                            .setPositiveButton("OK", (dialog, which) -> {
                                // Go to login
                                Intent intent = new Intent(RegisterUserActivity.this, LoginActivity.class);
                                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                                startActivity(intent);
                                finish();
                            })
                            .setCancelable(false)
                            .show();
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnRegister.setEnabled(true);
                    Toast.makeText(RegisterUserActivity.this, error, Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    // BLE Callbacks
    @Override
    public void onScanStarted() {
        runOnUiThread(() -> {
            Log.d(TAG, "Scan started");
            tvScooterStatus.setText("Scanning for scooters...");
        });
    }

    @Override
    public void onScanCompleted(List<ScanResult> devices) {
        runOnUiThread(() -> {
            Log.d(TAG, "Scan completed, found " + devices.size() + " devices");
            if (devices.isEmpty()) {
                tvScooterStatus.setText("No scooters found. Please try again.");
                btnConnectScooter.setEnabled(true);
            } else {
                // Connect to first device
                ScanResult firstDevice = devices.get(0);
                tvScooterStatus.setText("Connecting to " + firstDevice.getDevice().getName() + "...");
                bleManager.connectToDevice(firstDevice.getDevice());
            }
        });
    }

    @Override
    public void onScanFailed(String error) {
        runOnUiThread(() -> {
            tvScooterStatus.setText("Scan failed: " + error);
            btnConnectScooter.setEnabled(true);
        });
    }

    @Override
    public void onDeviceConnected(String deviceName, String address, String serialNumber) {
        runOnUiThread(() -> {
            // Use serial number from Device Info Service if available, otherwise use device name
            connectedScooterSerial = !serialNumber.isEmpty() ? serialNumber : deviceName;
            tvScooterStatus.setText("✓ Connected to " + deviceName);
            tvScooterStatus.setTextColor(getResources().getColor(R.color.success, null));
            btnConnectScooter.setText("Connected");

            // Request version info
            bleManager.requestVersionInfo();
        });
    }

    @Override
    public void onDeviceDisconnected(boolean wasExpected) {
        runOnUiThread(() -> {
            if (!scooterConnected || !wasExpected) {
                tvScooterStatus.setText("Disconnected");
                btnConnectScooter.setEnabled(true);
                btnRegister.setEnabled(false);
            }
        });
    }

    @Override
    public void onConnectionFailed(String error) {
        runOnUiThread(() -> {
            tvScooterStatus.setText("Connection failed: " + error);
            tvScooterStatus.setTextColor(getResources().getColor(R.color.error, null));
            btnConnectScooter.setEnabled(true);
        });
    }

    @Override
    public void onDataReceived(byte[] data) {
        if (data == null || data.length < 2) return;

        int packetType = data[1] & 0xFF;

        // Parse version info (0xB0)
        if (packetType == 0xB0) {
            scooterVersion = VersionInfo.parseFromB0Packet(data);
            if (scooterVersion != null) {
                runOnUiThread(() -> {
                    scooterConnected = true;
                    btnRegister.setEnabled(true);
                    Log.d(TAG, "Version info received: " + scooterVersion);
                });
            }
        }

        // Parse config info (0x01) if available
        if (packetType == 0x01) {
            scooterConfig = ConfigInfo.parse(data);
            if (scooterConfig != null) {
                Log.d(TAG, "Config info received: " + scooterConfig);
            }
        }
    }

    @Override
    public void onConnectionStatusChanged(String status) {
        runOnUiThread(() -> {
            Log.d(TAG, "Connection status: " + status);
        });
    }

    @Override
    public void onSerialNumberRead(String serialNumber) {
        runOnUiThread(() -> {
            if (!serialNumber.isEmpty()) {
                connectedScooterSerial = serialNumber;
                Log.d(TAG, "Serial number read: " + serialNumber);
            }
        });
    }

    @Override
    public void onDeviceInfoRead(String hardwareRevision, String firmwareRevision,
                                 String modelNumber, String manufacturer) {
        runOnUiThread(() -> {
            Log.d(TAG, "Device info - HW: " + hardwareRevision + ", FW: " + firmwareRevision +
                    ", Model: " + modelNumber + ", Mfr: " + manufacturer);
        });
    }

    @Override
    public void onCommandSent(boolean success, String message) {
        // Not used for registration
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (bleManager != null) {
            bleManager.cleanup();
        }
        if (authClient != null) {
            authClient.shutdown();
        }
    }
}
