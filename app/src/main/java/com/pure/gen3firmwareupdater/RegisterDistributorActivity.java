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

import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.JsonObject;

/**
 * Distributor Registration - Register with activation code
 * No scooter connection required
 */
public class RegisterDistributorActivity extends AppCompatActivity {
    private static final String TAG = "RegisterDistributorActivity";

    private TextInputEditText etEmail, etPassword, etConfirmPassword;
    private TextInputEditText etActivationCode;
    private TextInputEditText etFirstName, etLastName;
    private Spinner spinnerAgeRange, spinnerGender;
    private Button btnRegister;
    private TextView tvLogin;
    private ProgressBar progressBar;

    private AuthClient authClient;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register_distributor);

        authClient = new AuthClient();

        // Initialize views
        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        etConfirmPassword = findViewById(R.id.etConfirmPassword);
        etActivationCode = findViewById(R.id.etActivationCode);
        etFirstName = findViewById(R.id.etFirstName);
        etLastName = findViewById(R.id.etLastName);
        spinnerAgeRange = findViewById(R.id.spinnerAgeRange);
        spinnerGender = findViewById(R.id.spinnerGender);
        btnRegister = findViewById(R.id.btnRegister);
        tvLogin = findViewById(R.id.tvLogin);
        progressBar = findViewById(R.id.progressBar);

        // Setup spinners
        setupSpinners();

        // Set up click listeners
        btnRegister.setOnClickListener(v -> register());
        tvLogin.setOnClickListener(v -> finish());
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
    }

    private void register() {
        String email = etEmail.getText() != null ? etEmail.getText().toString().trim() : "";
        String password = etPassword.getText() != null ? etPassword.getText().toString() : "";
        String confirmPassword = etConfirmPassword.getText() != null ? etConfirmPassword.getText().toString() : "";
        String activationCode = etActivationCode.getText() != null ? etActivationCode.getText().toString().trim().toUpperCase() : "";

        // Validation
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

        if (activationCode.isEmpty()) {
            Toast.makeText(this, "Please enter your activation code", Toast.LENGTH_SHORT).show();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);
        btnRegister.setEnabled(false);

        // Build registration data
        JsonObject registrationData = new JsonObject();
        registrationData.addProperty("email", email);
        registrationData.addProperty("password", password);
        registrationData.addProperty("activation_code", activationCode);

        Log.d(TAG, "Starting distributor registration for: " + email);
        Log.d(TAG, "Activation code: " + activationCode);
        Log.d(TAG, "Request data: " + registrationData.toString());

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

        // Call registration endpoint
        authClient.registerDistributor(registrationData, new AuthClient.Callback<AuthClient.DistributorRegistrationResponse>() {
            @Override
            public void onSuccess(AuthClient.DistributorRegistrationResponse result) {
                Log.d(TAG, "Registration successful! Distributor: " + result.distributorName);
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnRegister.setEnabled(true);

                    new AlertDialog.Builder(RegisterDistributorActivity.this)
                            .setTitle("Registration Successful")
                            .setMessage("You have been registered as a distributor for " +
                                    result.distributorName + ".\n\n" +
                                    "Please check your email to verify your account. " +
                                    "Click the verification link, then return to login.")
                            .setPositiveButton("OK", (dialog, which) -> {
                                // Go to login
                                Intent intent = new Intent(RegisterDistributorActivity.this, LoginActivity.class);
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
                Log.e(TAG, "Registration failed: " + error);
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnRegister.setEnabled(true);

                    String displayError = error;
                    if (error.contains("Invalid activation code")) {
                        displayError = "Invalid activation code. Please check with your distributor.";
                    }

                    Toast.makeText(RegisterDistributorActivity.this, displayError, Toast.LENGTH_LONG).show();
                    Log.e(TAG, "Showing error to user: " + displayError);
                });
            }
        });
    }
}
