package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

import java.util.ArrayList;
import java.util.List;

/**
 * Activity to select a scooter from the distributor's inventory
 * After selection, user can choose what action to perform
 */
public class ScooterSelectionActivity extends AppCompatActivity {

    private static final String TAG = "ScooterSelection";

    private SupabaseClient supabase;
    private ListView lvScooters;
    private ProgressBar progressBar;
    private TextView tvStatus;
    private MaterialButton btnBackToMenu;

    private List<String> scooterSerials;
    private String selectedScooter = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_scooter_selection);

        // Initialize views
        lvScooters = findViewById(R.id.lvScooters);
        progressBar = findViewById(R.id.progressBar);
        tvStatus = findViewById(R.id.tvStatus);
        btnBackToMenu = findViewById(R.id.btnBackToMenu);

        btnBackToMenu.setOnClickListener(v -> finish());

        // Initialize services
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        supabase = com.pure.gen3firmwareupdater.services.ServiceFactory.getSupabaseClient();

        // Load distributor's scooters
        loadScooters();

        // Set up list item click listener
        lvScooters.setOnItemClickListener((parent, view, position, id) -> {
            selectedScooter = scooterSerials.get(position);
            showScooterActionsDialog(selectedScooter);
        });
    }

    private void loadScooters() {
        String distributorId = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().getDistributorId();

        if (distributorId == null) {
            Toast.makeText(this, "Distributor ID not found", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        progressBar.setVisibility(View.VISIBLE);
        tvStatus.setText("Loading scooters...");

        supabase.getDistributorScooters(distributorId, new SupabaseClient.Callback<List<String>>() {
            @Override
            public void onSuccess(List<String> result) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    scooterSerials = result;

                    if (result.isEmpty()) {
                        tvStatus.setText("No scooters found in your inventory");
                    } else {
                        tvStatus.setText("Select a scooter (" + result.size() + " available):");

                        // Create adapter and populate list
                        ArrayAdapter<String> adapter = new ArrayAdapter<>(
                                ScooterSelectionActivity.this,
                                android.R.layout.simple_list_item_1,
                                result
                        );
                        lvScooters.setAdapter(adapter);
                    }
                });
            }

            @Override
            public void onError(String error) {
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    tvStatus.setText("Error loading scooters");
                    Toast.makeText(ScooterSelectionActivity.this,
                            "Failed to load scooters: " + error,
                            Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    private void showScooterActionsDialog(String scooterSerial) {
        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle("Scooter: " + scooterSerial)
                .setMessage("What would you like to do?")
                .setPositiveButton("Update Firmware", (dialog, which) -> {
                    updateFirmware(scooterSerial);
                })
                .setNeutralButton("View Details", (dialog, which) -> {
                    viewScooterDetails(scooterSerial);
                })
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void updateFirmware(String scooterSerial) {
        // Go to firmware updater with this scooter pre-selected
        Intent intent = new Intent(ScooterSelectionActivity.this, FirmwareUpdaterActivity.class);
        intent.putExtra("target_scooter_serial", scooterSerial);
        startActivity(intent);
    }

    private void viewScooterDetails(String scooterSerial) {
        // Go to scooter details activity
        Intent intent = new Intent(ScooterSelectionActivity.this, ScooterDetailsActivity.class);
        intent.putExtra("scooter_serial", scooterSerial);
        startActivity(intent);
    }
}
