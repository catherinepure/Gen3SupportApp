package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.materialswitch.MaterialSwitch;
import com.pure.gen3firmwareupdater.services.PinCacheManager;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.UserSettingsManager;

import io.intercom.android.sdk.Intercom;
import io.intercom.android.sdk.identity.Registration;

/**
 * Settings screen for user preferences.
 * Sections are role-based: admin/manager see extra options.
 */
public class SettingsActivity extends AppCompatActivity {

    private static final String TAG = "SettingsActivity";

    private SessionManager session;
    private UserSettingsManager settings;
    private PinCacheManager pinCache;

    // UI
    private TextView tvCurrentEmail;
    private MaterialSwitch switchPinSave;
    private MaterialSwitch switchAutoConnect;
    private View sectionAdmin;
    private TextView tvAppVersion;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Dark status bar to match dashboard theme
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(getColor(R.color.dashboard_bg));

        setContentView(R.layout.activity_settings);

        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        settings = ServiceFactory.getUserSettingsManager();
        pinCache = ServiceFactory.getPinCacheManager();

        initViews();
        loadSettings();
        setupListeners();
        configureRoleBasedSections();
    }

    private void initViews() {
        tvCurrentEmail = findViewById(R.id.tvCurrentEmail);
        switchPinSave = findViewById(R.id.switchPinSave);
        switchAutoConnect = findViewById(R.id.switchAutoConnect);
        sectionAdmin = findViewById(R.id.sectionAdmin);
        tvAppVersion = findViewById(R.id.tvAppVersion);
    }

    private void loadSettings() {
        // Email
        String email = session.getUserEmail();
        tvCurrentEmail.setText(email != null ? email : "Not set");

        // Toggles
        switchPinSave.setChecked(settings.isPinSaveEnabled());
        switchAutoConnect.setChecked(settings.isAutoConnectEnabled());

        // App version
        try {
            PackageInfo pInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            tvAppVersion.setText("Version " + pInfo.versionName + " (" + pInfo.versionCode + ")");
        } catch (Exception e) {
            tvAppVersion.setText("Version unknown");
        }
    }

    private void setupListeners() {
        // Back button
        ImageButton btnBack = findViewById(R.id.btnBack);
        btnBack.setOnClickListener(v -> finish());

        // Change Email
        findViewById(R.id.btnChangeEmail).setOnClickListener(v -> {
            if (!ServiceFactory.isNetworkAvailable()) {
                Toast.makeText(this, "Internet connection required to change email", Toast.LENGTH_SHORT).show();
                return;
            }
            startActivity(new Intent(this, ChangeEmailActivity.class));
        });

        // Change PIN
        findViewById(R.id.btnChangePin).setOnClickListener(v -> changePin());

        // PIN Save toggle
        switchPinSave.setOnCheckedChangeListener((buttonView, isChecked) -> {
            settings.setPinSaveEnabled(isChecked);
            if (!isChecked) {
                // Clear all cached PINs when user disables PIN save
                pinCache.clearAllCachedPins();
                Toast.makeText(this, "PIN cache cleared", Toast.LENGTH_SHORT).show();
            }
            Log.d(TAG, "PIN save: " + isChecked);
        });

        // Auto-Connect toggle
        switchAutoConnect.setOnCheckedChangeListener((buttonView, isChecked) -> {
            settings.setAutoConnectEnabled(isChecked);
            Log.d(TAG, "Auto-connect: " + isChecked);
        });

        // Contact Support (opens new conversation — Fin AI will respond first)
        findViewById(R.id.btnContactSupport).setOnClickListener(v -> {
            if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
                ensureIntercomRegisteredThen(() -> Intercom.client().displayMessageComposer());
            } else {
                Toast.makeText(this, "Support chat not available — coming soon", Toast.LENGTH_SHORT).show();
            }
        });

        // Message History (opens past conversations list)
        findViewById(R.id.btnMessageHistory).setOnClickListener(v -> {
            if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
                ensureIntercomRegisteredThen(() -> Intercom.client().displayConversationsList());
            } else {
                Toast.makeText(this, "Support chat not available — coming soon", Toast.LENGTH_SHORT).show();
            }
        });

        // Logout
        MaterialButton btnLogout = findViewById(R.id.btnLogout);
        btnLogout.setOnClickListener(v -> confirmLogout());
    }

    private void configureRoleBasedSections() {
        String role = session.getUserRole();
        if (role == null) role = "normal"; // default if offline

        if ("admin".equals(role) || "manager".equals(role)) {
            sectionAdmin.setVisibility(View.VISIBLE);
        } else {
            sectionAdmin.setVisibility(View.GONE);
        }
    }

    private void changePin() {
        if (!ServiceFactory.isNetworkAvailable()) {
            Toast.makeText(this, "Internet connection required to change PIN", Toast.LENGTH_SHORT).show();
            return;
        }

        // Need a scooter ID — use the last connected scooter from settings
        String lastMac = settings.getLastConnectedMac();
        String lastName = settings.getLastConnectedName();

        if (lastMac == null || lastName == null) {
            Toast.makeText(this, "Connect to a scooter first to change its PIN", Toast.LENGTH_LONG).show();
            return;
        }

        // Look up scooter DB ID, then verify current PIN before allowing change
        ServiceFactory.scooterRepo().getScooterBySerial(lastName,
                new com.pure.gen3firmwareupdater.services.SupabaseBaseRepository.Callback<com.google.gson.JsonObject>() {
                    @Override
                    public void onSuccess(com.google.gson.JsonObject scooter) {
                        if (isFinishing() || isDestroyed()) return;
                        String scooterId = scooter.has("id") ? scooter.get("id").getAsString() : null;
                        if (scooterId == null) {
                            runOnUiThread(() -> Toast.makeText(SettingsActivity.this,
                                    "Could not find scooter in database", Toast.LENGTH_SHORT).show());
                            return;
                        }
                        runOnUiThread(() -> verifyCurrentPinThenChange(scooterId));
                    }

                    @Override
                    public void onError(String error) {
                        if (isFinishing() || isDestroyed()) return;
                        runOnUiThread(() -> Toast.makeText(SettingsActivity.this,
                                "Error: " + error, Toast.LENGTH_SHORT).show());
                    }
                });
    }

    /**
     * Step 1: Verify current PIN for security before allowing a PIN change.
     */
    private void verifyCurrentPinThenChange(String scooterId) {
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Toast.makeText(this, "Session expired — please re-login", Toast.LENGTH_SHORT).show();
            return;
        }

        PinEntryDialog verifyDialog = PinEntryDialog.newInstance(scooterId, sessionToken, false,
                "Verify Current PIN", "Enter your current 6-digit PIN to change it", true);
        verifyDialog.setPinEntryListener(new PinEntryDialog.PinEntryListener() {
            @Override
            public void onPinVerified(boolean isLocking) {
                // Current PIN verified — now show PIN setup for the new PIN
                Log.d(TAG, "Current PIN verified, showing new PIN setup");
                showPinSetupDialog(scooterId);
            }

            @Override
            public void onPinCancelled() {
                Log.d(TAG, "PIN change cancelled — current PIN not verified");
            }

            @Override
            public void onPinNotSet(boolean isLocking) {
                // No PIN set — go straight to setup
                Log.d(TAG, "No PIN set, going to PIN setup directly");
                showPinSetupDialog(scooterId);
            }
        });
        verifyDialog.show(getSupportFragmentManager(), "pin_verify_current");
    }

    /**
     * Step 2: Show PIN setup dialog for the new PIN (after current PIN verified).
     */
    private void showPinSetupDialog(String scooterId) {
        String sessionToken = session.getSessionToken();
        if (sessionToken == null) {
            Toast.makeText(this, "Session expired — please re-login", Toast.LENGTH_SHORT).show();
            return;
        }

        PinSetupDialog dialog = PinSetupDialog.newInstance(scooterId, sessionToken, true);
        dialog.setPinSetupListener(new PinSetupDialog.PinSetupListener() {
            @Override
            public void onPinSet() {
                Toast.makeText(SettingsActivity.this, "PIN changed successfully", Toast.LENGTH_SHORT).show();
                // Clear cached PIN so user enters new one next time
                pinCache.clearCachedPin(scooterId);
            }

            @Override
            public void onPinSkipped() {
                Log.d(TAG, "PIN change cancelled");
            }
        });
        dialog.show(getSupportFragmentManager(), "pin_change");
    }

    /**
     * Ensures the current user is registered with Intercom, then runs the action.
     * The Intercom SDK persists login state across app launches, so we must NOT
     * call loginIdentifiedUser() if the user is already registered — doing so
     * triggers a "user already exists" error that puts the SDK in a bad state.
     */
    private void ensureIntercomRegisteredThen(Runnable onReady) {
        String userId = session.getUserId();
        if (userId == null) {
            Toast.makeText(this, "Please log in to use support chat", Toast.LENGTH_SHORT).show();
            return;
        }

        boolean alreadyRegistered = Gen3FirmwareUpdaterApp.isIntercomUserRegistered(userId);

        if (alreadyRegistered) {
            // User already registered — safe to present immediately
            Log.d(TAG, "Intercom user already registered, opening messenger directly");
            onReady.run();
            return;
        }

        // Not yet tracked as registered — register now
        Log.d(TAG, "Intercom user not tracked, attempting registration for: " + userId);
        doIntercomLogin(userId, onReady, true);
    }

    /**
     * Attempt Intercom loginIdentifiedUser. If it fails with "user already exists",
     * logout the stale SDK session and retry once cleanly.
     */
    private void doIntercomLogin(String userId, Runnable onReady, boolean canRetry) {
        try {
            Registration registration = Registration.create().withUserId(userId);
            Intercom.client().loginIdentifiedUser(registration, new io.intercom.android.sdk.IntercomStatusCallback() {
                @Override
                public void onSuccess() {
                    Log.d(TAG, "Intercom user registered: " + userId);
                    Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);

                    io.intercom.android.sdk.UserAttributes userAttributes =
                            new io.intercom.android.sdk.UserAttributes.Builder()
                                    .withEmail(session.getUserEmail())
                                    .withCustomAttribute("role", session.getUserRole() != null ? session.getUserRole() : "normal")
                                    .withCustomAttribute("app_version", BuildConfig.VERSION_NAME)
                                    .build();
                    Intercom.client().updateUser(userAttributes);

                    // Small delay to let Intercom SDK fully set up the session
                    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
                        if (!isDestroyed() && !isFinishing()) {
                            onReady.run();
                        }
                    }, 500);
                }

                @Override
                public void onFailure(io.intercom.android.sdk.IntercomError intercomError) {
                    Log.w(TAG, "Intercom registration failed: " + intercomError.getErrorMessage());

                    if (canRetry) {
                        // SDK has stale state — logout and retry once
                        Log.d(TAG, "Clearing stale Intercom session and retrying login");
                        Intercom.client().logout();
                        runOnUiThread(() -> {
                            if (!isDestroyed() && !isFinishing()) {
                                doIntercomLogin(userId, onReady, false);
                            }
                        });
                    } else {
                        // Retry also failed — mark as registered anyway and proceed
                        Log.w(TAG, "Intercom retry also failed, proceeding anyway");
                        Gen3FirmwareUpdaterApp.setIntercomUserRegistered(userId);
                        runOnUiThread(() -> {
                            if (!isDestroyed() && !isFinishing()) {
                                onReady.run();
                            }
                        });
                    }
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "Intercom registration error", e);
            onReady.run();
        }
    }

    private void confirmLogout() {
        new AlertDialog.Builder(this)
                .setTitle("Logout")
                .setMessage("Are you sure you want to logout?")
                .setPositiveButton("Logout", (dialog, which) -> {
                    // Release BLE connection if active
                    if (ServiceFactory.isConnectionServiceActive()) {
                        ServiceFactory.releaseConnectionService();
                    }
                    session.clearSession();
                    pinCache.clearAllCachedPins();
                    if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
                        Intercom.client().logout();
                        Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
                    }

                    Intent intent = new Intent(this, RegistrationChoiceActivity.class);
                    intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                    startActivity(intent);
                    finish();
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh email in case it was changed
        String email = session.getUserEmail();
        tvCurrentEmail.setText(email != null ? email : "Not set");
    }
}
