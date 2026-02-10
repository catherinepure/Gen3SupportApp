package com.pure.gen3firmwareupdater;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.util.Log;
import android.util.Patterns;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.AutoCompleteTextView;
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
import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.services.LocationCaptureManager;

/**
 * User Registration — account creation only (no scooter required).
 * After registration, user verifies email, logs in, then connects scooter from the user hub.
 */
public class RegisterUserActivity extends AppCompatActivity {
    private static final String TAG = "RegisterUserActivity";
    private static final int REQUEST_LOCATION_PERMISSION = 2001;

    private TextInputEditText etEmail, etPassword, etConfirmPassword;
    private TextInputEditText etFirstName, etLastName;
    private AutoCompleteTextView spinnerAgeRange, spinnerGender, spinnerScooterUse;
    private MaterialButton btnRegister;
    private TextView tvLogin;
    private ProgressBar progressBar;

    private AuthClient authClient;
    private LocationCaptureManager locationManager;
    private LocationCaptureManager.LocationData capturedLocation;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register_user);

        authClient = new AuthClient();
        locationManager = new LocationCaptureManager(this);

        // Initialize views
        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        etConfirmPassword = findViewById(R.id.etConfirmPassword);
        etFirstName = findViewById(R.id.etFirstName);
        etLastName = findViewById(R.id.etLastName);
        spinnerAgeRange = findViewById(R.id.spinnerAgeRange);
        spinnerGender = findViewById(R.id.spinnerGender);
        spinnerScooterUse = findViewById(R.id.spinnerScooterUse);
        btnRegister = findViewById(R.id.btnRegister);
        tvLogin = findViewById(R.id.tvLogin);
        progressBar = findViewById(R.id.progressBar);

        setupDropdowns();

        btnRegister.setOnClickListener(v -> register());
        tvLogin.setOnClickListener(v -> finish());

        // Request location permission and start capture
        requestLocationAndCapture();
    }

    private void requestLocationAndCapture() {
        if (locationManager.hasPermission()) {
            startLocationCapture();
        } else {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                    REQUEST_LOCATION_PERMISSION);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_LOCATION_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startLocationCapture();
            } else {
                Log.d(TAG, "Location permission denied — registration will proceed without location");
            }
        }
    }

    private void startLocationCapture() {
        locationManager.captureLocation(new LocationCaptureManager.LocationCallback2() {
            @Override
            public void onLocationCaptured(LocationCaptureManager.LocationData data) {
                capturedLocation = data;
                Log.d(TAG, "Location captured: " + data);
            }

            @Override
            public void onLocationFailed(String reason) {
                Log.w(TAG, "Location capture failed: " + reason);
            }
        });
    }

    private void setupDropdowns() {
        String[] ageRanges = {"Under 18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"};
        spinnerAgeRange.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_dropdown_item_1line, ageRanges));

        String[] genders = {"Male", "Female", "Other", "Prefer not to say"};
        spinnerGender.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_dropdown_item_1line, genders));

        String[] scooterUses = {"Business", "Pleasure", "Both"};
        spinnerScooterUse.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_dropdown_item_1line, scooterUses));
    }

    private void register() {
        String email = getText(etEmail);
        String password = getText(etPassword);
        String confirmPassword = getText(etConfirmPassword);

        // Validation
        if (email.isEmpty()) {
            etEmail.setError("Email is required");
            etEmail.requestFocus();
            return;
        }
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            etEmail.setError("Enter a valid email address");
            etEmail.requestFocus();
            return;
        }
        if (password.isEmpty()) {
            etPassword.setError("Password is required");
            etPassword.requestFocus();
            return;
        }
        if (password.length() < 8) {
            etPassword.setError("Minimum 8 characters");
            etPassword.requestFocus();
            return;
        }
        if (!password.equals(confirmPassword)) {
            etConfirmPassword.setError("Passwords do not match");
            etConfirmPassword.requestFocus();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);
        btnRegister.setEnabled(false);

        // Build registration payload
        JsonObject data = new JsonObject();
        data.addProperty("email", email);
        data.addProperty("password", password);

        // Optional profile fields
        String firstName = getText(etFirstName);
        String lastName = getText(etLastName);
        if (!firstName.isEmpty()) data.addProperty("first_name", firstName);
        if (!lastName.isEmpty()) data.addProperty("last_name", lastName);

        String ageRange = spinnerAgeRange.getText().toString().trim();
        String gender = spinnerGender.getText().toString().trim();
        String scooterUse = spinnerScooterUse.getText().toString().trim();
        if (!ageRange.isEmpty()) data.addProperty("age_range", ageRange);
        if (!gender.isEmpty()) data.addProperty("gender", gender);
        if (!scooterUse.isEmpty()) data.addProperty("scooter_use_type", scooterUse);

        // Location data (if captured)
        if (capturedLocation != null) {
            data.addProperty("registration_latitude", capturedLocation.latitude);
            data.addProperty("registration_longitude", capturedLocation.longitude);
            data.addProperty("registration_accuracy", capturedLocation.accuracy);
            if (capturedLocation.method != null) data.addProperty("registration_location_method", capturedLocation.method);
            if (capturedLocation.country != null) {
                data.addProperty("registration_country", capturedLocation.country);
                data.addProperty("current_country", capturedLocation.country);
            }
            if (capturedLocation.region != null) data.addProperty("registration_region", capturedLocation.region);
            if (capturedLocation.city != null) data.addProperty("registration_city", capturedLocation.city);
        }

        Log.d(TAG, "Registering user: " + email);

        authClient.register(data, new AuthClient.Callback<Void>() {
            @Override
            public void onSuccess(Void result) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnRegister.setEnabled(true);

                    new AlertDialog.Builder(RegisterUserActivity.this)
                            .setTitle("Registration Successful")
                            .setMessage("We've sent a verification link to " + email +
                                    ". Please check your email and click the link to activate your account.")
                            .setPositiveButton("Go to Login", (dialog, which) -> {
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

    private String getText(TextInputEditText field) {
        return field.getText() != null ? field.getText().toString().trim() : "";
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (locationManager != null) {
            locationManager.stop();
        }
        if (authClient != null) {
            authClient.shutdown();
        }
    }
}
