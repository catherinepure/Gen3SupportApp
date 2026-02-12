package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.pure.gen3firmwareupdater.services.ServiceFactory;
import com.pure.gen3firmwareupdater.services.SessionManager;
import com.pure.gen3firmwareupdater.services.TermsManager;

import io.intercom.android.sdk.Intercom;

/**
 * Home screen. Shows registration/login options when not logged in,
 * or a user hub (scan scooter, logout) when logged in as a regular user.
 * Distributors are redirected straight to DistributorMenuActivity.
 *
 * Also performs periodic T&C re-checks for logged-in users (every 24h).
 */
public class RegistrationChoiceActivity extends AppCompatActivity {

    private static final String TAG = "RegistrationChoice";
    private static final int REQUEST_CODE_TERMS = 1002;

    private SessionManager session;
    private TermsManager termsManager;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        ServiceFactory.init(this);
        session = ServiceFactory.getSessionManager();
        termsManager = ServiceFactory.getTermsManager();

        Log.d(TAG, "isLoggedIn=" + session.isLoggedIn()
                + " isDistributor=" + session.isDistributor()
                + " role='" + session.getUserRole() + "'"
                + " distributorId='" + session.getDistributorId() + "'"
                + " email='" + session.getUserEmail() + "'");

        if (session.isLoggedIn()) {
            // Periodic T&C re-check for logged-in users
            if (termsManager.shouldCheckForUpdate() && session.getUserId() != null) {
                checkTermsBeforeProceeding();
                return;
            }

            // No T&C check needed — all users go to dashboard
            routeToUserDashboard();
            return;
        }

        showMainLayout();
    }

    private void checkTermsBeforeProceeding() {
        Log.d(TAG, "Performing periodic T&C check");

        termsManager.checkAcceptanceStatus(session.getUserId(), session.getSessionToken(),
                new TermsManager.TermsCallback<TermsManager.ConsentCheckResult>() {
                    @Override
                    public void onSuccess(TermsManager.ConsentCheckResult result) {
                        runOnUiThread(() -> {
                            if (result.needsAcceptance && result.termsUrl != null) {
                                Log.d(TAG, "Periodic check: user needs to accept T&C version " + result.latestVersion);
                                launchTermsAcceptance(result);
                            } else {
                                Log.d(TAG, "Periodic check: T&C up-to-date");
                                proceedAfterTermsCheck();
                            }
                        });
                    }

                    @Override
                    public void onError(String error) {
                        runOnUiThread(() -> {
                            Log.w(TAG, "Periodic T&C check failed, proceeding: " + error);
                            proceedAfterTermsCheck();
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
                proceedAfterTermsCheck();
            } else {
                new AlertDialog.Builder(this)
                        .setTitle("Terms & Conditions Required")
                        .setMessage("You must accept the Terms & Conditions to use this app.")
                        .setPositiveButton("Try Again", (dialog, which) -> checkTermsBeforeProceeding())
                        .setNegativeButton("Logout", (dialog, which) -> {
                            session.clearSession();
                            if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
                                Intercom.client().logout();
                                Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
                            }
                            recreate();
                        })
                        .setCancelable(false)
                        .show();
            }
        }
    }

    private void proceedAfterTermsCheck() {
        routeToUserDashboard();
    }

    private void routeToUserDashboard() {
        Log.d(TAG, "Routing to UserDashboardActivity");
        Intent intent = new Intent(this, UserDashboardActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void routeToDistributorMenu() {
        Log.d(TAG, "Routing to DistributorMenuActivity");
        Intent intent = new Intent(this, DistributorMenuActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    private void showMainLayout() {
        setContentView(R.layout.activity_registration_choice);

        View layoutNotLoggedIn = findViewById(R.id.layoutNotLoggedIn);
        View layoutUserHub = findViewById(R.id.layoutUserHub);

        if (session.isLoggedIn()) {
            // --- Logged-in regular user: show user hub ---
            Log.d(TAG, "Showing user hub for: " + session.getUserEmail());
            layoutNotLoggedIn.setVisibility(View.GONE);
            layoutUserHub.setVisibility(View.VISIBLE);

            TextView tvWelcome = findViewById(R.id.tvWelcome);
            tvWelcome.setText("Welcome, " + session.getUserEmail());

            MaterialButton btnScan = findViewById(R.id.btnUserScanScooter);
            btnScan.setOnClickListener(v -> {
                Intent intent = new Intent(this, ScanScooterActivity.class);
                intent.putExtra("user_mode", true);
                startActivity(intent);
            });

            MaterialButton btnLogout = findViewById(R.id.btnLogout);
            btnLogout.setOnClickListener(v -> {
                session.clearSession();
                if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
                    Intercom.client().logout();
                    Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
                }
                recreate();
            });
        } else {
            // --- Not logged in: show registration options ---
            Button btnRegisterUser = findViewById(R.id.btnRegisterUser);
            Button btnRegisterDistributor = findViewById(R.id.btnRegisterDistributor);
            TextView tvLogin = findViewById(R.id.tvLogin);

            btnRegisterUser.setOnClickListener(v -> {
                startActivity(new Intent(this, RegisterUserActivity.class));
            });

            btnRegisterDistributor.setOnClickListener(v -> {
                startActivity(new Intent(this, RegisterDistributorActivity.class));
            });

            tvLogin.setOnClickListener(v -> {
                startActivity(new Intent(this, LoginActivity.class));
                finish();
            });
        }
    }
}
