package com.pure.gen3firmwareupdater;

import android.app.Dialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.DialogFragment;

import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.services.PinCacheManager;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.UserSettingsManager;

import java.io.IOException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Dialog for entering a PIN to verify lock/unlock operations.
 * Supports PIN caching with 7-day expiry and "Forgot PIN" recovery flow.
 */
public class PinEntryDialog extends DialogFragment {
    private static final String TAG = "PinEntryDialog";
    private static final String ARG_SCOOTER_ID = "scooter_id";
    private static final String ARG_SESSION_TOKEN = "session_token";
    private static final String ARG_IS_LOCKING = "is_locking";
    private static final String ARG_CUSTOM_TITLE = "custom_title";
    private static final String ARG_CUSTOM_MESSAGE = "custom_message";
    private static final String ARG_SKIP_CACHE = "skip_cache";

    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1";

    private TextInputEditText etPin;
    private TextView tvError;
    private TextView tvCacheHint;
    private ProgressBar progressBar;
    private Button btnForgotPin;
    private AlertDialog dialog;

    private OkHttpClient httpClient;
    private ExecutorService executor;
    private PinCacheManager pinCache;

    public interface PinEntryListener {
        void onPinVerified(boolean isLocking);
        void onPinCancelled();
        default void onPinNotSet(boolean isLocking) { onPinCancelled(); }
    }

    private PinEntryListener listener;

    public static PinEntryDialog newInstance(String scooterId, String sessionToken, boolean isLocking) {
        PinEntryDialog frag = new PinEntryDialog();
        Bundle args = new Bundle();
        args.putString(ARG_SCOOTER_ID, scooterId);
        args.putString(ARG_SESSION_TOKEN, sessionToken);
        args.putBoolean(ARG_IS_LOCKING, isLocking);
        frag.setArguments(args);
        return frag;
    }

    public static PinEntryDialog newInstance(String scooterId, String sessionToken, boolean isLocking,
                                              String customTitle, String customMessage) {
        return newInstance(scooterId, sessionToken, isLocking, customTitle, customMessage, false);
    }

    public static PinEntryDialog newInstance(String scooterId, String sessionToken, boolean isLocking,
                                              String customTitle, String customMessage, boolean skipCache) {
        PinEntryDialog frag = newInstance(scooterId, sessionToken, isLocking);
        frag.getArguments().putString(ARG_CUSTOM_TITLE, customTitle);
        frag.getArguments().putString(ARG_CUSTOM_MESSAGE, customMessage);
        frag.getArguments().putBoolean(ARG_SKIP_CACHE, skipCache);
        return frag;
    }

    public void setPinEntryListener(PinEntryListener listener) {
        this.listener = listener;
    }

    @NonNull
    @Override
    public Dialog onCreateDialog(@Nullable Bundle savedInstanceState) {
        httpClient = new OkHttpClient();
        executor = Executors.newSingleThreadExecutor();
        pinCache = ServiceFactory.getPinCacheManager();

        boolean isLocking = getArguments() != null && getArguments().getBoolean(ARG_IS_LOCKING, true);
        boolean skipCache = getArguments() != null && getArguments().getBoolean(ARG_SKIP_CACHE, false);
        String scooterId = getArguments() != null ? getArguments().getString(ARG_SCOOTER_ID) : null;
        String sessionToken = getArguments() != null ? getArguments().getString(ARG_SESSION_TOKEN) : null;

        // Check for cached PIN first (skip for security-sensitive flows like PIN change)
        if (!skipCache && scooterId != null && pinCache.hasCachedPin(scooterId)) {
            String cachedPin = pinCache.getCachedPin(scooterId);
            if (cachedPin != null) {
                if (!ServiceFactory.isNetworkAvailable()) {
                    // Offline: trust the cached PIN without server verification
                    Log.d(TAG, "Offline — trusting cached PIN for lock/unlock");
                    // Post to next frame so listener is attached before callback fires
                    new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                        if (listener != null) listener.onPinVerified(isLocking);
                    });
                    return new AlertDialog.Builder(requireContext()).create();
                }
                // Online: verify cached PIN with server
                Log.d(TAG, "Using cached PIN for auto-verification");
                autoVerifyWithCachedPin(cachedPin, scooterId, sessionToken, isLocking);
                // Return a dummy dialog that never shows
                return new AlertDialog.Builder(requireContext()).create();
            }
        }

        // No cached PIN or cache expired - check if offline
        if (!ServiceFactory.isNetworkAvailable()) {
            // Offline with no cached PIN — can't verify, show message and cancel
            Log.w(TAG, "Offline with no cached PIN — cannot verify");
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                if (getContext() != null) {
                    Toast.makeText(getContext(),
                            "No internet connection. PIN verification requires internet on first use.",
                            Toast.LENGTH_LONG).show();
                }
                if (listener != null) listener.onPinCancelled();
            });
            return new AlertDialog.Builder(requireContext()).create();
        }

        // Online — show PIN entry dialog
        View view = LayoutInflater.from(getContext()).inflate(R.layout.dialog_pin_entry, null);
        etPin = view.findViewById(R.id.etPin);
        tvError = view.findViewById(R.id.tvError);
        tvCacheHint = view.findViewById(R.id.tvCacheHint);
        progressBar = view.findViewById(R.id.progressBar);
        btnForgotPin = view.findViewById(R.id.btnForgotPin);

        TextView tvTitle = view.findViewById(R.id.tvPinTitle);
        TextView tvMessage = view.findViewById(R.id.tvPinMessage);
        String customTitle = getArguments() != null ? getArguments().getString(ARG_CUSTOM_TITLE) : null;
        String customMessage = getArguments() != null ? getArguments().getString(ARG_CUSTOM_MESSAGE) : null;
        if (customTitle != null) {
            tvTitle.setText(customTitle);
        } else {
            tvTitle.setText(isLocking ? "Lock Scooter" : "Unlock Scooter");
        }
        if (customMessage != null) {
            tvMessage.setText(customMessage);
        } else {
            tvMessage.setText(isLocking
                    ? "Enter your 6-digit PIN to lock the scooter"
                    : "Enter your 6-digit PIN to unlock the scooter");
        }

        // Show cache expiry hint if applicable
        if (scooterId != null && pinCache.shouldReVerify(scooterId)) {
            long daysRemaining = pinCache.getDaysRemaining(scooterId);
            tvCacheHint.setText("PIN cache expires in " + daysRemaining + " day(s). Re-enter to refresh.");
            tvCacheHint.setVisibility(View.VISIBLE);
        }

        // Setup Forgot PIN button - ensure it's visible
        if (btnForgotPin != null) {
            btnForgotPin.setVisibility(View.VISIBLE);
            btnForgotPin.setOnClickListener(v -> openForgotPinLink());
            Log.d(TAG, "Forgot PIN button initialized and visible");
        } else {
            Log.e(TAG, "ERROR: btnForgotPin is NULL!");
        }

        dialog = new AlertDialog.Builder(requireContext())
                .setView(view)
                .setPositiveButton("Confirm", null)
                .setNegativeButton("Cancel", (d, w) -> {
                    if (listener != null) listener.onPinCancelled();
                })
                .setCancelable(false)
                .create();

        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> attemptVerify());
        });

        return dialog;
    }

    /**
     * Auto-verify with cached PIN in background.
     * If successful, notify listener and dismiss immediately.
     * If failed, clear cache and show error.
     */
    private void autoVerifyWithCachedPin(String cachedPin, String scooterId, String sessionToken, boolean isLocking) {
        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "verify-pin");
                body.addProperty("session_token", sessionToken);
                body.addProperty("scooter_id", scooterId);
                body.addProperty("pin", cachedPin);

                Request request = new Request.Builder()
                        .url(BASE_URL + "/user-pin")
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .header("X-Session-Token", sessionToken)
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body() != null ? response.body().string() : "";

                if (response.isSuccessful()) {
                    JsonObject result = new Gson().fromJson(responseBody, JsonObject.class);
                    boolean valid = result.has("valid") && result.get("valid").getAsBoolean();

                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            if (valid) {
                                Log.d(TAG, "Cached PIN verified successfully");
                                dismiss();
                                if (listener != null) listener.onPinVerified(isLocking);
                            } else {
                                // Cached PIN is invalid - clear cache and show error
                                Log.w(TAG, "Cached PIN verification failed - clearing cache");
                                pinCache.clearCachedPin(scooterId);
                                // Re-show dialog for manual entry
                                dismiss();
                                if (listener != null) listener.onPinCancelled();
                            }
                        });
                    }
                } else {
                    Log.e(TAG, "Auto-verification failed: " + response.code() + " - " + responseBody);
                    // Check if PIN was cleared on server
                    boolean noPinSet = response.code() == 404 && responseBody.toLowerCase().contains("no pin set");
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            pinCache.clearCachedPin(scooterId);
                            dismiss();
                            if (noPinSet && listener != null) {
                                listener.onPinNotSet(isLocking);
                            } else if (listener != null) {
                                listener.onPinCancelled();
                            }
                        });
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Network error during auto-verification", e);
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        dismiss();
                        if (listener != null) listener.onPinCancelled();
                    });
                }
            }
        });
    }

    /**
     * Show email entry dialog for PIN recovery.
     */
    private void openForgotPinLink() {
        final TextInputEditText etEmail = new TextInputEditText(requireContext());
        etEmail.setHint("your.email@example.com");
        etEmail.setInputType(android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        etEmail.setPadding(48, 24, 48, 24);

        new AlertDialog.Builder(requireContext())
            .setTitle("Forgot PIN?")
            .setMessage("Enter your registered email address. If the email matches your account, you'll receive a recovery link to reset your PIN and the local PIN cache will be cleared.")
            .setView(etEmail)
            .setPositiveButton("Send Recovery Email", (d, w) -> {
                String email = etEmail.getText() != null ? etEmail.getText().toString().trim() : "";
                if (email.isEmpty() || !android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
                    Toast.makeText(getContext(), "Please enter a valid email address", Toast.LENGTH_SHORT).show();
                } else {
                    sendRecoveryEmail(email);
                }
            })
            .setNegativeButton("Cancel", null)
            .show();
    }

    /**
     * Send recovery email request to backend.
     */
    private void sendRecoveryEmail(String email) {
        String scooterId = getArguments() != null ? getArguments().getString(ARG_SCOOTER_ID) : null;

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "request-recovery");
                body.addProperty("email", email);
                body.addProperty("scooter_id", scooterId);

                Request request = new Request.Builder()
                        .url(BASE_URL + "/user-pin")
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();

                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> {
                        // Clear local PIN cache regardless of response (security)
                        if (scooterId != null) {
                            pinCache.clearCachedPin(scooterId);
                            Log.d(TAG, "Local PIN cache cleared for security");
                        }

                        // Always show same message for security (don't reveal if email exists)
                        Toast.makeText(getContext(),
                            "If that email is registered, you'll receive a recovery link shortly.",
                            Toast.LENGTH_LONG).show();
                        dismiss();
                        if (listener != null) listener.onPinCancelled();
                    });
                }
            } catch (IOException e) {
                Log.e(TAG, "Network error sending recovery email", e);
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() ->
                        Toast.makeText(getContext(), "Network error. Please try again.", Toast.LENGTH_SHORT).show()
                    );
                }
            }
        });
    }

    private void attemptVerify() {
        String pin = etPin.getText() != null ? etPin.getText().toString() : "";

        if (pin.length() != 6) {
            etPin.setError("PIN must be exactly 6 digits");
            etPin.requestFocus();
            return;
        }

        if (!pin.matches("\\d{6}")) {
            etPin.setError("PIN must be numbers only");
            etPin.requestFocus();
            return;
        }

        // Show progress
        progressBar.setVisibility(View.VISIBLE);
        tvError.setVisibility(View.GONE);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);

        String scooterId = getArguments() != null ? getArguments().getString(ARG_SCOOTER_ID) : null;
        String sessionToken = getArguments() != null ? getArguments().getString(ARG_SESSION_TOKEN) : null;
        boolean isLocking = getArguments() != null && getArguments().getBoolean(ARG_IS_LOCKING, true);

        if (scooterId == null || sessionToken == null) {
            showError("Missing scooter or session info");
            return;
        }

        sendVerifyRequest(scooterId, pin, sessionToken, isLocking);
    }

    private void sendVerifyRequest(String scooterId, String pin, String sessionToken, boolean isLocking) {
        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "verify-pin");
                body.addProperty("session_token", sessionToken);
                body.addProperty("scooter_id", scooterId);
                body.addProperty("pin", pin);

                Log.d(TAG, "Sending verify-pin request for scooter_id: " + scooterId);

                Request request = new Request.Builder()
                        .url(BASE_URL + "/user-pin")
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .header("X-Session-Token", sessionToken)
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body() != null ? response.body().string() : "";
                Log.d(TAG, "Verify-pin response: HTTP " + response.code() + " - " + responseBody);

                if (response.isSuccessful()) {
                    JsonObject result = new Gson().fromJson(responseBody, JsonObject.class);
                    boolean valid = result.has("valid") && result.get("valid").getAsBoolean();

                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            if (valid) {
                                // Cache the PIN for 7 days (only if PIN save is enabled)
                                UserSettingsManager userSettings = ServiceFactory.getUserSettingsManager();
                                if (userSettings.isPinSaveEnabled()) {
                                    pinCache.cachePin(scooterId, pin);
                                    Log.d(TAG, "PIN verified and cached for 7 days");
                                } else {
                                    pinCache.clearCachedPin(scooterId);
                                    Log.d(TAG, "PIN verified (caching disabled by user)");
                                }

                                dismiss();
                                if (listener != null) listener.onPinVerified(isLocking);
                            } else {
                                showError("Incorrect PIN. Please try again.");
                                etPin.setText("");
                                etPin.requestFocus();
                            }
                        });
                    }
                } else {
                    String errorMsg = "Verification failed";
                    try {
                        JsonObject errJson = new Gson().fromJson(responseBody, JsonObject.class);
                        if (errJson.has("error")) errorMsg = errJson.get("error").getAsString();
                    } catch (Exception ignored) {}
                    final String msg = errorMsg;
                    // If server says no PIN is set, redirect to PIN setup
                    if (response.code() == 404 && msg.toLowerCase().contains("no pin set")) {
                        Log.d(TAG, "No PIN set on server — redirecting to PIN setup");
                        if (getActivity() != null) {
                            getActivity().runOnUiThread(() -> {
                                pinCache.clearCachedPin(scooterId);
                                dismiss();
                                if (listener != null) listener.onPinNotSet(isLocking);
                            });
                        }
                    } else if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> showError(msg));
                    }
                }
            } catch (IOException e) {
                Log.e(TAG, "Network error verifying PIN", e);
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> showError("Network error: " + e.getMessage()));
                }
            }
        });
    }

    private void showError(String message) {
        progressBar.setVisibility(View.GONE);
        tvError.setVisibility(View.VISIBLE);
        tvError.setText(message);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (executor != null) executor.shutdownNow();
    }
}
