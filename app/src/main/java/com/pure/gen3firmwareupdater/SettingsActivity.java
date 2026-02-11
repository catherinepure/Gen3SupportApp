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

        // Look up scooter DB ID by serial name, then show PIN setup dialog
        ServiceFactory.scooterRepo().getScooterBySerial(lastName,
                new com.pure.gen3firmwareupdater.services.SupabaseBaseRepository.Callback<com.google.gson.JsonObject>() {
                    @Override
                    public void onSuccess(com.google.gson.JsonObject scooter) {
                        String scooterId = scooter.has("id") ? scooter.get("id").getAsString() : null;
                        if (scooterId == null) {
                            runOnUiThread(() -> Toast.makeText(SettingsActivity.this,
                                    "Could not find scooter in database", Toast.LENGTH_SHORT).show());
                            return;
                        }
                        runOnUiThread(() -> showPinSetupDialog(scooterId));
                    }

                    @Override
                    public void onError(String error) {
                        runOnUiThread(() -> Toast.makeText(SettingsActivity.this,
                                "Error: " + error, Toast.LENGTH_SHORT).show());
                    }
                });
    }

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
