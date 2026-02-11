package com.pure.gen3firmwareupdater;

import android.app.Dialog;
import android.os.Bundle;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
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
import com.pure.gen3firmwareupdater.services.ServiceFactory;

import java.io.IOException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/**
 * Dialog for setting a 6-digit PIN on a scooter after connection.
 * Shows PIN entry + confirmation with weak PIN detection.
 */
public class PinSetupDialog extends DialogFragment {
    private static final String TAG = "PinSetupDialog";
    private static final String ARG_SCOOTER_ID = "scooter_id";
    private static final String ARG_SESSION_TOKEN = "session_token";
    private static final String ARG_USE_USER_ENDPOINT = "use_user_endpoint";

    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1";

    private static final Set<String> WEAK_PINS = new HashSet<>(Arrays.asList(
            "000000", "111111", "222222", "333333", "444444",
            "555555", "666666", "777777", "888888", "999999",
            "123456", "654321", "123123", "112233"
    ));

    private TextInputEditText etPin, etConfirmPin;
    private TextView tvPinStrength;
    private ProgressBar progressBar;
    private AlertDialog dialog;

    private OkHttpClient httpClient;
    private ExecutorService executor;

    public interface PinSetupListener {
        void onPinSet();
        void onPinSkipped();
    }

    private PinSetupListener listener;

    public static PinSetupDialog newInstance(String scooterId, String sessionToken) {
        return newInstance(scooterId, sessionToken, false);
    }

    public static PinSetupDialog newInstance(String scooterId, String sessionToken, boolean useUserEndpoint) {
        PinSetupDialog frag = new PinSetupDialog();
        Bundle args = new Bundle();
        args.putString(ARG_SCOOTER_ID, scooterId);
        args.putString(ARG_SESSION_TOKEN, sessionToken);
        args.putBoolean(ARG_USE_USER_ENDPOINT, useUserEndpoint);
        frag.setArguments(args);
        return frag;
    }

    public void setPinSetupListener(PinSetupListener listener) {
        this.listener = listener;
    }

    @NonNull
    @Override
    public Dialog onCreateDialog(@Nullable Bundle savedInstanceState) {
        // Block PIN setup when offline — dangerous if it fails and user thinks PIN is set
        if (!ServiceFactory.isNetworkAvailable()) {
            Log.w(TAG, "Offline — PIN setup requires internet connection");
            new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                if (getContext() != null) {
                    Toast.makeText(getContext(),
                            "A PIN is required to lock your scooter. PIN setup needs an internet connection — please try when back online.",
                            Toast.LENGTH_LONG).show();
                }
                if (listener != null) listener.onPinSkipped();
            });
            return new AlertDialog.Builder(requireContext()).create();
        }

        httpClient = new OkHttpClient();
        executor = Executors.newSingleThreadExecutor();

        View view = LayoutInflater.from(getContext()).inflate(R.layout.dialog_pin_setup, null);
        etPin = view.findViewById(R.id.etPin);
        etConfirmPin = view.findViewById(R.id.etConfirmPin);
        tvPinStrength = view.findViewById(R.id.tvPinStrength);
        progressBar = view.findViewById(R.id.progressBar);

        etPin.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int st, int c, int a) {}
            @Override public void onTextChanged(CharSequence s, int st, int b, int c) {}
            @Override
            public void afterTextChanged(Editable s) {
                updatePinStrength(s.toString());
            }
        });

        dialog = new AlertDialog.Builder(requireContext())
                .setView(view)
                .setPositiveButton("Set PIN", null)
                .setNegativeButton("Skip", (d, w) -> {
                    if (listener != null) listener.onPinSkipped();
                })
                .setCancelable(false)
                .create();

        dialog.setOnShowListener(d -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> attemptSetPin());
        });

        return dialog;
    }

    private void updatePinStrength(String pin) {
        if (pin.length() < 6) {
            tvPinStrength.setVisibility(View.GONE);
            return;
        }

        tvPinStrength.setVisibility(View.VISIBLE);
        if (WEAK_PINS.contains(pin)) {
            tvPinStrength.setText("Weak PIN - try something less predictable");
            tvPinStrength.setTextColor(getResources().getColor(R.color.warning, null));
        } else {
            tvPinStrength.setText("Good PIN");
            tvPinStrength.setTextColor(getResources().getColor(R.color.success, null));
        }
    }

    private void attemptSetPin() {
        String pin = etPin.getText() != null ? etPin.getText().toString() : "";
        String confirmPin = etConfirmPin.getText() != null ? etConfirmPin.getText().toString() : "";

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

        if (!pin.equals(confirmPin)) {
            etConfirmPin.setError("PINs do not match");
            etConfirmPin.requestFocus();
            return;
        }

        // Show progress
        progressBar.setVisibility(View.VISIBLE);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(false);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(false);

        String scooterId = getArguments() != null ? getArguments().getString(ARG_SCOOTER_ID) : null;
        String sessionToken = getArguments() != null ? getArguments().getString(ARG_SESSION_TOKEN) : null;

        if (scooterId == null || sessionToken == null) {
            showError("Missing scooter or session info");
            return;
        }

        sendSetPinRequest(scooterId, pin, sessionToken);
    }

    private void sendSetPinRequest(String scooterId, String pin, String sessionToken) {
        boolean useUserEndpoint = getArguments() != null
                && getArguments().getBoolean(ARG_USE_USER_ENDPOINT, false);

        executor.execute(() -> {
            try {
                JsonObject body = new JsonObject();
                body.addProperty("action", "set-pin");
                body.addProperty("session_token", sessionToken);
                body.addProperty("scooter_id", scooterId);
                body.addProperty("pin", pin);
                if (!useUserEndpoint) {
                    body.addProperty("resource", "scooters");
                }

                String endpoint = useUserEndpoint ? "/user-pin" : "/admin";
                Log.d(TAG, "Sending set-pin request for scooter_id: " + scooterId
                        + " via " + endpoint);

                Request request = new Request.Builder()
                        .url(BASE_URL + endpoint)
                        .header("Authorization", "Bearer " + BuildConfig.SUPABASE_ANON_KEY)
                        .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                        .header("Content-Type", "application/json")
                        .header("X-Session-Token", sessionToken)
                        .post(RequestBody.create(body.toString(), MediaType.parse("application/json")))
                        .build();

                Response response = httpClient.newCall(request).execute();
                String responseBody = response.body() != null ? response.body().string() : "";
                Log.d(TAG, "Set-pin response: HTTP " + response.code() + " - " + responseBody);

                if (response.isSuccessful()) {
                    Log.d(TAG, "PIN set successfully");
                    if (getActivity() != null) {
                        getActivity().runOnUiThread(() -> {
                            dismiss();
                            if (listener != null) listener.onPinSet();
                        });
                    }
                } else {
                    Log.e(TAG, "Set PIN failed: " + response.code() + " - " + responseBody);
                    String errorMsg = "Failed to set PIN";
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
                Log.e(TAG, "Network error setting PIN", e);
                if (getActivity() != null) {
                    getActivity().runOnUiThread(() -> showError("Network error: " + e.getMessage()));
                }
            }
        });
    }

    private void showError(String message) {
        progressBar.setVisibility(View.GONE);
        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setEnabled(true);
        dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setEnabled(true);
        etPin.setError(message);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (executor != null) executor.shutdownNow();
    }
}
