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
import com.google.firebase.messaging.FirebaseMessaging;
import com.pure.gen3firmwareupdater.services.DeviceTokenManager;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.TermsManager;

import io.intercom.android.sdk.Intercom;
import io.intercom.android.sdk.identity.Registration;

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
            startActivity(new Intent(LoginActivity.this, RegistrationChoiceActivity.class));
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

                    // Re-register with Intercom (handles edge cases like cleared app data)
                    String userId = user.id != null ? user.id : session.getUserId();
                    if (userId != null) {
                        registerIntercomUser(userId, session.getUserEmail(), session.getUserRole());
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
                Log.d(TAG, "Login successful");
                runOnUiThread(() -> {
                    // Save session (now includes userId)
                    session.saveLogin(response.user.id, response.sessionToken, response.user.email,
                            response.user.role, response.user.distributorId);

                    // Register user with Intercom for support messaging
                    registerIntercomUser(response.user.id, response.user.email, response.user.role);

                    // Register FCM token with Supabase for custom push notifications
                    registerFcmToken();

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
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
            Intercom.client().logout();
            Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
        }
    }

    private void registerIntercomUser(String userId, String email, String role) {
        if (!Gen3FirmwareUpdaterApp.isIntercomInitialized()) return;
        doIntercomLogin(userId, email, role, true);
    }

    /**
     * Attempt Intercom loginIdentifiedUser. If it fails with "user already exists",
     * logout the stale SDK session and retry once cleanly.
     */
    private void doIntercomLogin(String userId, String email, String role, boolean canRetry) {
        try {
            Registration registration = Registration.create().withUserId(userId);
            Intercom.client().loginIdentifiedUser(registration, new io.intercom.android.sdk.IntercomStatusCallback() {
                @Override
                public void onSuccess() {
                    Log.d(TAG, "Intercom user registered: " + userId);
                    Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);

                    io.intercom.android.sdk.UserAttributes userAttributes =
                            new io.intercom.android.sdk.UserAttributes.Builder()
                                    .withEmail(email)
                                    .withCustomAttribute("role", role != null ? role : "normal")
                                    .withCustomAttribute("app_version", BuildConfig.VERSION_NAME)
                                    .build();
                    Intercom.client().updateUser(userAttributes);
                }

                @Override
                public void onFailure(io.intercom.android.sdk.IntercomError intercomError) {
                    Log.w(TAG, "Intercom registration failed: " + intercomError.getErrorMessage());

                    if (canRetry) {
                        // SDK has stale state — logout and retry once
                        Log.d(TAG, "Clearing stale Intercom session and retrying login");
                        Intercom.client().logout();
                        doIntercomLogin(userId, email, role, false);
                    } else {
                        // Retry also failed — mark as registered anyway
                        Log.w(TAG, "Intercom retry also failed");
                        Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);
                    }
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "Intercom registration error", e);
        }
    }

    /**
     * Register FCM token with Supabase for custom push notifications.
     * Called after login so the backend knows this device's token.
     */
    private void registerFcmToken() {
        FirebaseMessaging.getInstance().getToken()
                .addOnSuccessListener(token -> {
                    Log.d(TAG, "FCM token obtained, registering with Supabase");
                    new DeviceTokenManager().registerToken(token);
                })
                .addOnFailureListener(e ->
                        Log.w(TAG, "Failed to get FCM token", e));
    }

    private void checkTermsAndProceed() {
        String userId = session.getUserId();
        String sessionToken = session.getSessionToken();

        if (userId == null || sessionToken == null) {
            // No userId available (legacy session) — force re-login to ensure T&C compliance
            Log.w(TAG, "No userId in session, clearing stale session and requiring re-login");
            clearSession();
            progressBar.setVisibility(View.GONE);
            btnLogin.setEnabled(true);
            Toast.makeText(this, "Session expired — please log in again", Toast.LENGTH_SHORT).show();
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

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (authClient != null) {
            authClient.shutdown();
        }
    }

    private void navigateToMainActivity() {
        Intent intent = new Intent(LoginActivity.this, UserDashboardActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }
}
