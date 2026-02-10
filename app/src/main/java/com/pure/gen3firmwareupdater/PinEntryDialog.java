package com.pure.gen3firmwareupdater;

import android.app.Dialog;
import android.os.Bundle;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.DialogFragment;

import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

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
 * Calls the user-pin Edge Function to verify the entered PIN.
 */
public class PinEntryDialog extends DialogFragment {
    private static final String TAG = "PinEntryDialog";
    private static final String ARG_SCOOTER_ID = "scooter_id";
    private static final String ARG_SESSION_TOKEN = "session_token";
    private static final String ARG_IS_LOCKING = "is_locking";

    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1";

    private TextInputEditText etPin;
    private TextView tvError;
    private ProgressBar progressBar;
    private AlertDialog dialog;

    private OkHttpClient httpClient;
    private ExecutorService executor;

    public interface PinEntryListener {
        void onPinVerified(boolean isLocking);
        void onPinCancelled();
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

    public void setPinEntryListener(PinEntryListener listener) {
        this.listener = listener;
    }

    @NonNull
    @Override
    public Dialog onCreateDialog(@Nullable Bundle savedInstanceState) {
        httpClient = new OkHttpClient();
        executor = Executors.newSingleThreadExecutor();

        boolean isLocking = getArguments() != null && getArguments().getBoolean(ARG_IS_LOCKING, true);

        View view = LayoutInflater.from(getContext()).inflate(R.layout.dialog_pin_entry, null);
        etPin = view.findViewById(R.id.etPin);
        tvError = view.findViewById(R.id.tvError);
        progressBar = view.findViewById(R.id.progressBar);

        TextView tvTitle = view.findViewById(R.id.tvPinTitle);
        TextView tvMessage = view.findViewById(R.id.tvPinMessage);
        tvTitle.setText(isLocking ? "Lock Scooter" : "Unlock Scooter");
        tvMessage.setText(isLocking
                ? "Enter your 6-digit PIN to lock the scooter"
                : "Enter your 6-digit PIN to unlock the scooter");

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
                    if (getActivity() != null) {
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
