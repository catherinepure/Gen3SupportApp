package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

/**
 * Main menu for distributors after login
 * Shows various options for distributor operations
 */
public class DistributorMenuActivity extends AppCompatActivity {

    private TextView tvWelcome;
    private MaterialButton btnScanScooter;
    private MaterialButton btnSearchDatabase;
    private MaterialButton btnViewInventory;
    private MaterialButton btnLogout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_distributor_menu);

        // Initialize views
        tvWelcome = findViewById(R.id.tvWelcome);
        btnScanScooter = findViewById(R.id.btnScanScooter);
        btnSearchDatabase = findViewById(R.id.btnSearchDatabase);
        btnViewInventory = findViewById(R.id.btnViewInventory);
        btnLogout = findViewById(R.id.btnLogout);

        // Get user email for welcome message
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        String email = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().getUserEmail();
        tvWelcome.setText("Welcome, " + (email != null ? email : "Distributor"));

        // Set up button listeners
        btnScanScooter.setOnClickListener(v -> {
            // PRIMARY ACTION: Scan for nearby scooter (walk-in customer)
            Intent intent = new Intent(DistributorMenuActivity.this, ScanScooterActivity.class);
            startActivity(intent);
        });

        btnSearchDatabase.setOnClickListener(v -> {
            // Manage users: search, view, edit, deactivate
            Intent intent = new Intent(DistributorMenuActivity.this, UserManagementActivity.class);
            startActivity(intent);
        });

        btnViewInventory.setOnClickListener(v -> {
            // Browse all scooters in inventory
            Intent intent = new Intent(DistributorMenuActivity.this, ScooterSelectionActivity.class);
            startActivity(intent);
        });

        btnLogout.setOnClickListener(v -> {
            logout();
        });
    }

    private void logout() {
        // Clear session
        com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().clearSession();

        // Go back to registration choice screen
        Intent intent = new Intent(DistributorMenuActivity.this, RegistrationChoiceActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    @Override
    public void onBackPressed() {
        // Prevent going back to login - stay on menu
        // User must use logout button
    }
}
