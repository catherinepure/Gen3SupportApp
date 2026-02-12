package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;

import io.intercom.android.sdk.Intercom;

/**
 * Main menu for distributors after login
 * Shows various options for distributor operations
 */
public class DistributorMenuActivity extends AppCompatActivity {

    private TextView tvWelcome;
    private MaterialCardView cardScanScooter;
    private MaterialCardView cardManageUsers;
    private MaterialCardView cardViewInventory;
    private MaterialButton btnLogout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_distributor_menu);

        // Initialize views
        tvWelcome = findViewById(R.id.tvWelcome);
        cardScanScooter = findViewById(R.id.cardScanScooter);
        cardManageUsers = findViewById(R.id.cardManageUsers);
        cardViewInventory = findViewById(R.id.cardViewInventory);
        btnLogout = findViewById(R.id.btnLogout);

        // Get user email for welcome message
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        String email = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().getUserEmail();
        tvWelcome.setText("Welcome, " + (email != null ? email : "Distributor"));

        // Set up card listeners
        cardScanScooter.setOnClickListener(v -> {
            Intent intent = new Intent(DistributorMenuActivity.this, ScanScooterActivity.class);
            startActivity(intent);
        });

        cardManageUsers.setOnClickListener(v -> {
            Intent intent = new Intent(DistributorMenuActivity.this, UserManagementActivity.class);
            startActivity(intent);
        });

        cardViewInventory.setOnClickListener(v -> {
            Intent intent = new Intent(DistributorMenuActivity.this, ScooterSelectionActivity.class);
            startActivity(intent);
        });

        btnLogout.setOnClickListener(v -> logout());
    }

    private void logout() {
        com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().clearSession();
        if (Gen3FirmwareUpdaterApp.isIntercomInitialized()) {
            Intercom.client().logout();
            Gen3FirmwareUpdaterApp.clearIntercomUserRegistered();
        }

        Intent intent = new Intent(DistributorMenuActivity.this, RegistrationChoiceActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Prevent going back to login - stay on menu
    }
}
