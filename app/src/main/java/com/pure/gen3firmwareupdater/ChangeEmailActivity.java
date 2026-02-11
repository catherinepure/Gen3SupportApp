package com.pure.gen3firmwareupdater;

import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Activity for changing the user's email address.
 * Flow: enter new email → verification code sent to CURRENT email → enter code → email updated.
 */
public class ChangeEmailActivity extends AppCompatActivity {

    private static final String TAG = "ChangeEmailActivity";
    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1";

    private SessionManager session;
    private OkHttpClient httpClient;
    private ExecutorService executor;

    // State
    private String pendingNewEmail;

    // UI - Request phase
    private View layoutRequest;
    private TextView tvCurrentEmail;
    private TextInputEditText etNewEmail;
    private MaterialButton btnSendCode;
    private ProgressBar progressRequest;

    // UI - Verify phase
    private View layoutVerify;
    private TextView tvVerifyMessage;
    private TextInputEditText etVerifyCode;
    private TextView tvVerifyError;
    private MaterialButton btnVerifyCode;
    private MaterialButton btnResendCode;
    private ProgressBar progressVerify;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(getColor(R.color.dashboard_bg));

        setContentView(R.layout.activity_change_email);

        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        httpClient = new OkHttpClient();
        executor = Executors.newSingleThreadExecutor();

        initViews();
        setupListeners();
    }

    private void initViews() {
        // Request phase
        layoutRequest = findViewById(R.id.layoutRequest);
        tvCurrentEmail = findViewById(R.id.tvCurrentEmail);
        etNewEmail = findViewById(R.id.etNewEmail);
        btnSendCode = findViewById(R.id.btnSendCode);
        progressRequest = findViewById(R.id.progressRequest);

        // Verify phase
        layoutVerify = findViewById(R.id.layoutVerify);
        tvVerifyMessage = findViewById(R.id.tvVerifyMessage);
        etVerifyCode = findViewById(R.id.etVerifyCode);
        tvVerifyError = findViewById(R.id.tvVerifyError);
        btnVerifyCode = findViewById(R.id.btnVerifyCode);
        btnResendCode = findViewById(R.id.btnResendCode);
        progressVerify = findViewById(R.id.progressVerify);

        // Set current email
        String email = session.getUserEmail();
        tvCurrentEmail.setText(email != null ? email : "Not set");
    }

    private void setupListeners() {
        ImageButton btnBack = findViewById(R.id.btnBack);
        btnBack.setOnClickListener(v -> finish());

        btnSendCode.setOnClickListener(v -> requestEmailChange());
        btnVerifyCode.setOnClickListener(v -> verifyCode());
        btnResendCode.setOnClickListener(v -> requestEmailChange());
    }

    private void requestEmailChange() {
        String newEmail = etNewEmail.getText() != null ? etNewEmail.getText().toString().trim() : "";

        if (newEmail.isEmpty()) {
            etNewEmail.setError("Please enter a new email address");
            etNewEmail.requestFocus();
            return;
        }

        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(newEmail).matches()) {
            etNewEmail.setError("Please enter a valid email address");
            etNewEmail.requestFocus();
            return;
        }

        String currentEmail = session.getUserEmail();
        if (newEmail.equalsIgnoreCase(currentEmail)) {
            etNewEmail.setError("New email must be different from current email");
            etNewEmail.requestFocus();
            return;
        }

        pendingNewEmail = newEmail;

        // Show progress
        progressRequest.setVisibility(View.VISIBLE);
        btnSendCode.setEnabled(false);

        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Toast.makeText(this, "Session expired — please re-login", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "request-change");
                body.addProperty("session_token", sessionToken);
                body.addProperty("new_email", newEmail);

                Request request = new Request.Builder()
                        .url(BASE_URL + "/change-email")
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .header("X-Session-Token", sessionToken)
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body() != null ? response.body().string() : "";

                if (isFinishing() || isDestroyed()) return;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    progressRequest.setVisibility(View.GONE);
                    btnSendCode.setEnabled(true);

                    if (response.isSuccessful()) {
                        Log.d(TAG, "Email change request sent successfully");
                        showVerifyPhase();
                    } else {
                        String errorMsg = "Failed to send verification code";
                        try {
                            JsonObject errJson = new Gson().fromJson(responseBody, JsonObject.class);
                            if (errJson.has("error")) errorMsg = errJson.get("error").getAsString();
                        } catch (Exception ignored) {}
                        Toast.makeText(ChangeEmailActivity.this, errorMsg, Toast.LENGTH_LONG).show();
                    }
                });
            } catch (IOException e) {
                Log.e(TAG, "Network error requesting email change", e);
                if (isFinishing() || isDestroyed()) return;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    progressRequest.setVisibility(View.GONE);
                    btnSendCode.setEnabled(true);
                    Toast.makeText(ChangeEmailActivity.this,
                            "Network error: " + e.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        });
    }

    private void showVerifyPhase() {
        layoutRequest.setVisibility(View.GONE);
        layoutVerify.setVisibility(View.VISIBLE);
        tvVerifyMessage.setText("Check your current email (" + session.getUserEmail()
                + ") for a 6-digit verification code.");
    }

    private void verifyCode() {
        String code = etVerifyCode.getText() != null ? etVerifyCode.getText().toString().trim() : "";

        if (code.length() != 6 || !code.matches("\\d{6}")) {
            etVerifyCode.setError("Enter the 6-digit code from your email");
            etVerifyCode.requestFocus();
            return;
        }

        // Show progress
        progressVerify.setVisibility(View.VISIBLE);
        tvVerifyError.setVisibility(View.GONE);
        btnVerifyCode.setEnabled(false);
        btnResendCode.setEnabled(false);

        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Toast.makeText(this, "Session expired — please re-login", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "verify-change");
                body.addProperty("session_token", sessionToken);
                body.addProperty("code", code);
                body.addProperty("new_email", pendingNewEmail);

                Request request = new Request.Builder()
                        .url(BASE_URL + "/change-email")
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .header("X-Session-Token", sessionToken)
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body() != null ? response.body().string() : "";

                if (isFinishing() || isDestroyed()) return;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    progressVerify.setVisibility(View.GONE);
                    btnVerifyCode.setEnabled(true);
                    btnResendCode.setEnabled(true);

                    if (response.isSuccessful()) {
                        Log.d(TAG, "Email changed successfully to: " + pendingNewEmail);
                        // Update local session
                        session.setUserEmail(pendingNewEmail);
                        Toast.makeText(ChangeEmailActivity.this,
                                "Email changed successfully", Toast.LENGTH_SHORT).show();
                        finish();
                    } else {
                        String errorMsg = "Verification failed";
                        try {
                            JsonObject errJson = new Gson().fromJson(responseBody, JsonObject.class);
                            if (errJson.has("error")) errorMsg = errJson.get("error").getAsString();
                        } catch (Exception ignored) {}
                        tvVerifyError.setText(errorMsg);
                        tvVerifyError.setVisibility(View.VISIBLE);
                    }
                });
            } catch (IOException e) {
                Log.e(TAG, "Network error verifying code", e);
                if (isFinishing() || isDestroyed()) return;
                runOnUiThread(() -> {
                    if (isFinishing() || isDestroyed()) return;
                    progressVerify.setVisibility(View.GONE);
                    btnVerifyCode.setEnabled(true);
                    btnResendCode.setEnabled(true);
                    tvVerifyError.setText("Network error: " + e.getMessage());
                    tvVerifyError.setVisibility(View.VISIBLE);
                });
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (executor != null) executor.shutdownNow();
    }
}
