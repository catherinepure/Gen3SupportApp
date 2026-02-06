package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.textfield.TextInputEditText;

public class LoginActivity extends AppCompatActivity {
    private static final String TAG = "LoginActivity";

    private TextInputEditText etEmail, etPassword;
    private Button btnLogin;
    private TextView tvRegister, tvForgotPassword, tvResendVerification;
    private ProgressBar progressBar;
    private AuthClient authClient;
    private com.pure.gen3firmwareupdater.services.SessionManager session;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        // Initialize services
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        session = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager();
        authClient = new AuthClient();

        // Initialize views
        etEmail = findViewById(R.id.etEmail);
        etPassword = findViewById(R.id.etPassword);
        btnLogin = findViewById(R.id.btnLogin);
        tvRegister = findViewById(R.id.tvRegister);
        tvResendVerification = findViewById(R.id.tvResendVerification);
        progressBar = findViewById(R.id.progressBar);

        // Check if already logged in
        String sessionToken = session.getSessionToken();
        if (sessionToken != null) {
            validateSessionAndProceed(sessionToken);
            return;
        }

        // Set up click listeners
        btnLogin.setOnClickListener(v -> login());
        tvRegister.setOnClickListener(v -> {
            startActivity(new Intent(LoginActivity.this, RegisterActivity.class));
        });
        tvResendVerification.setOnClickListener(v -> resendVerification());
    }

    private void validateSessionAndProceed(String sessionToken) {
        progressBar.setVisibility(View.VISIBLE);
        btnLogin.setEnabled(false);

        authClient.validateSession(sessionToken, new AuthClient.Callback<AuthClient.User>() {
            @Override
            public void onSuccess(AuthClient.User user) {
                runOnUiThread(() -> {
                    // Session valid, proceed to main activity
                    proceedToMainActivity();
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    // Session invalid, clear and show login
                    clearSession();
                    progressBar.setVisibility(View.GONE);
                    btnLogin.setEnabled(true);
                });
            }
        });
    }

    private void login() {
        String email = etEmail.getText() != null ? etEmail.getText().toString().trim() : "";
        String password = etPassword.getText() != null ? etPassword.getText().toString() : "";

        Log.d(TAG, "Login attempt for: " + email);

        if (email.isEmpty()) {
            Toast.makeText(this, "Please enter your email", Toast.LENGTH_SHORT).show();
            return;
        }

        if (password.isEmpty()) {
            Toast.makeText(this, "Please enter your password", Toast.LENGTH_SHORT).show();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);
        btnLogin.setEnabled(false);

        String deviceInfo = android.os.Build.MODEL + " (Android " + android.os.Build.VERSION.RELEASE + ")";
        Log.d(TAG, "Device info: " + deviceInfo);

        authClient.login(email, password, deviceInfo, new AuthClient.Callback<AuthClient.LoginResponse>() {
            @Override
            public void onSuccess(AuthClient.LoginResponse response) {
                Log.d(TAG, "Login successful! Session token: " + response.sessionToken.substring(0, 10) + "...");
                runOnUiThread(() -> {
                    // Save session
                    session.saveLogin(response.sessionToken, response.user.email,
                            response.user.role, response.user.distributorId);

                    Toast.makeText(LoginActivity.this, "Login successful", Toast.LENGTH_SHORT).show();
                    proceedToMainActivity();
                });
            }

            @Override
            public void onError(String error) {
                Log.e(TAG, "Login failed: " + error);
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnLogin.setEnabled(true);

                    if (error.contains("verify your email")) {
                        tvResendVerification.setVisibility(View.VISIBLE);
                        Toast.makeText(LoginActivity.this,
                                "Please verify your email before logging in", Toast.LENGTH_LONG).show();
                    } else {
                        Toast.makeText(LoginActivity.this, error, Toast.LENGTH_LONG).show();
                    }
                    Log.e(TAG, "Showing error to user: " + error);
                });
            }
        });
    }

    private void resendVerification() {
        String email = etEmail.getText() != null ? etEmail.getText().toString().trim() : "";

        if (email.isEmpty()) {
            Toast.makeText(this, "Please enter your email", Toast.LENGTH_SHORT).show();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);

        authClient.resendVerification(email, new AuthClient.Callback<Void>() {
            @Override
            public void onSuccess(Void result) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    Toast.makeText(LoginActivity.this,
                            "Verification email sent. Please check your inbox.", Toast.LENGTH_LONG).show();
                    tvResendVerification.setVisibility(View.GONE);
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    Toast.makeText(LoginActivity.this, error, Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void clearSession() {
        session.clearSession();
    }

    private void proceedToMainActivity() {
        // Check user role to determine which activity to open
        Intent intent;
        if (session.isDistributor()) {
            // Distributors go to menu
            intent = new Intent(LoginActivity.this, DistributorMenuActivity.class);
        } else {
            // Regular users go to firmware updater
            intent = new Intent(LoginActivity.this, FirmwareUpdaterActivity.class);
        }

        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }
}
