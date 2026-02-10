package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.textfield.TextInputEditText;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.TermsManager;

public class LoginActivity extends AppCompatActivity {
    private static final String TAG = "LoginActivity";
    private static final int REQUEST_CODE_TERMS = 1001;

    private TextInputEditText etEmail, etPassword;
    private Button btnLogin;
    private TextView tvRegister, tvForgotPassword, tvResendVerification;
    private ProgressBar progressBar;
    private AuthClient authClient;
    private SessionManager session;
    private TermsManager termsManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_login);

        // Initialize services
        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        termsManager = ServiceFactory.getTermsManager();
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
            startActivity(new Intent(LoginActivity.this, RegisterUserActivity.class));
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
                    // Ensure userId is stored (may be missing from older sessions)
                    if (user.id != null && session.getUserId() == null) {
                        session.setUserId(user.id);
                    }
                    checkTermsAndProceed();
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
                    // Save session (now includes userId)
                    session.saveLogin(response.user.id, response.sessionToken, response.user.email,
                            response.user.role, response.user.distributorId);

                    Toast.makeText(LoginActivity.this, "Login successful", Toast.LENGTH_SHORT).show();
                    checkTermsAndProceed();
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

    private void checkTermsAndProceed() {
        String userId = session.getUserId();
        String sessionToken = session.getSessionToken();

        if (userId == null || sessionToken == null) {
            // No userId available (legacy session) — skip T&C check
            Log.w(TAG, "No userId in session, skipping T&C check");
            navigateToMainActivity();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);

        termsManager.checkAcceptanceStatus(userId, sessionToken, new TermsManager.TermsCallback<TermsManager.ConsentCheckResult>() {
            @Override
            public void onSuccess(TermsManager.ConsentCheckResult result) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);

                    if (result.needsAcceptance && result.termsUrl != null) {
                        Log.d(TAG, "User needs to accept T&C version " + result.latestVersion);
                        launchTermsAcceptance(result);
                    } else {
                        Log.d(TAG, "User T&C is up-to-date");
                        navigateToMainActivity();
                    }
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    // Don't block app usage if T&C check fails
                    Log.w(TAG, "T&C check failed, proceeding anyway: " + error);
                    progressBar.setVisibility(View.GONE);
                    navigateToMainActivity();
                });
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
                navigateToMainActivity();
            } else {
                // User declined — cannot use app
                new AlertDialog.Builder(this)
                        .setTitle("Terms & Conditions Required")
                        .setMessage("You must accept the Terms & Conditions to use this app.")
                        .setPositiveButton("Try Again", (dialog, which) -> checkTermsAndProceed())
                        .setNegativeButton("Logout", (dialog, which) -> {
                            clearSession();
                            recreate();
                        })
                        .setCancelable(false)
                        .show();
            }
        }
    }

    private void navigateToMainActivity() {
        Intent intent = new Intent(LoginActivity.this, UserDashboardActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }
}
