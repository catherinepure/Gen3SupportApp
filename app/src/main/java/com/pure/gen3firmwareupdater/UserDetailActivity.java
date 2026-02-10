package com.pure.gen3firmwareupdater;

import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;
import com.google.gson.JsonObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * User detail and edit screen for distributors.
 * View user info, edit fields, deactivate users, and view audit trail.
 */
public class UserDetailActivity extends AppCompatActivity {

    private static final String TAG = "UserDetail";

    // Views
    private ProgressBar progressBar;
    private ScrollView scrollContent;
    private MaterialButton btnToggleEdit;
    private MaterialButton btnSave;
    private MaterialButton btnDeactivate;

    private TextView tvEmail, tvStatus, tvCreatedAt;
    private TextInputEditText etFirstName, etLastName;
    private Spinner spinnerUserLevel, spinnerAgeRange, spinnerGender, spinnerScooterUse;
    private TextView tvScooters;
    private LinearLayout llAuditTrail;
    private TextView tvNoAuditEntries;

    // State
    private SupabaseClient supabase;
    private String userId;
    private String distributorEmail; // For audit trail "changed_by"
    private UserInfo currentUser;    // Original data for comparison
    private boolean isEditMode = false;

    // Spinner arrays - Roles as assigned by database administrator
    // Database values: 'admin', 'manager', 'normal'
    private static final String[] USER_LEVELS = {"normal", "manager", "admin"};
    private static final String[] USER_LEVEL_DISPLAY = {"Normal", "Manager", "Admin"};
    private static final String[] AGE_RANGES = {"Not set", "<18", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"};
    private static final String[] GENDERS = {"Not set", "Male", "Female", "Other", "Prefer not to say"};
    private static final String[] SCOOTER_USES = {"Not set", "Business", "Pleasure", "Both"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_user_detail);

        userId = getIntent().getStringExtra("user_id");
        if (userId == null) {
            Toast.makeText(this, "User ID not provided", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // Get distributor email for audit logging
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        String email = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().getUserEmail();
        distributorEmail = email != null ? email : "unknown";

        // Initialize Supabase
        supabase = com.pure.gen3firmwareupdater.services.ServiceFactory.getSupabaseClient();

        // Initialize views
        progressBar = findViewById(R.id.progressBar);
        scrollContent = findViewById(R.id.scrollContent);
        btnToggleEdit = findViewById(R.id.btnToggleEdit);
        btnSave = findViewById(R.id.btnSave);
        btnDeactivate = findViewById(R.id.btnDeactivate);
        tvEmail = findViewById(R.id.tvEmail);
        tvStatus = findViewById(R.id.tvStatus);
        tvCreatedAt = findViewById(R.id.tvCreatedAt);
        etFirstName = findViewById(R.id.etFirstName);
        etLastName = findViewById(R.id.etLastName);
        spinnerUserLevel = findViewById(R.id.spinnerUserLevel);
        spinnerAgeRange = findViewById(R.id.spinnerAgeRange);
        spinnerGender = findViewById(R.id.spinnerGender);
        spinnerScooterUse = findViewById(R.id.spinnerScooterUse);
        tvScooters = findViewById(R.id.tvScooters);
        llAuditTrail = findViewById(R.id.llAuditTrail);
        tvNoAuditEntries = findViewById(R.id.tvNoAuditEntries);

        // Setup spinners
        setupSpinners();

        // Button listeners
        btnToggleEdit.setOnClickListener(v -> toggleEditMode());
        btnSave.setOnClickListener(v -> saveChanges());
        btnDeactivate.setOnClickListener(v -> confirmDeactivate());

        // Load user data
        loadUser();
    }

    private void setupSpinners() {
        ArrayAdapter<String> levelAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, USER_LEVEL_DISPLAY);
        levelAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerUserLevel.setAdapter(levelAdapter);

        ArrayAdapter<String> ageAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, AGE_RANGES);
        ageAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerAgeRange.setAdapter(ageAdapter);

        ArrayAdapter<String> genderAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, GENDERS);
        genderAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerGender.setAdapter(genderAdapter);

        ArrayAdapter<String> useAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, SCOOTER_USES);
        useAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerScooterUse.setAdapter(useAdapter);
    }

    private void loadUser() {
        progressBar.setVisibility(View.VISIBLE);
        scrollContent.setVisibility(View.GONE);

        supabase.getUserById(userId, new SupabaseClient.Callback<UserInfo>() {
            @Override
            public void onSuccess(UserInfo user) {
                currentUser = user;
                populateFields(user);
                progressBar.setVisibility(View.GONE);
                scrollContent.setVisibility(View.VISIBLE);

                // Load scooters and audit trail in parallel
                loadScooters();
                loadAuditTrail();
            }

            @Override
            public void onError(String error) {
                Log.e(TAG, "Load user error: " + error);
                progressBar.setVisibility(View.GONE);
                Toast.makeText(UserDetailActivity.this, "Error loading user: " + error, Toast.LENGTH_LONG).show();
                finish();
            }
        });
    }

    private void populateFields(UserInfo user) {
        tvEmail.setText(user.email != null ? user.email : "");

        // Status with colour
        String status = user.getStatusDisplay();
        tvStatus.setText(status);
        switch (status) {
            case "Active":
                tvStatus.setTextColor(Color.parseColor("#4CAF50"));
                break;
            case "Inactive":
                tvStatus.setTextColor(Color.parseColor("#F44336"));
                break;
            case "Unverified":
                tvStatus.setTextColor(Color.parseColor("#FF9800"));
                break;
        }

        tvCreatedAt.setText("Joined: " + user.getFormattedDate());

        // Text fields
        etFirstName.setText(user.firstName != null ? user.firstName : "");
        etLastName.setText(user.lastName != null ? user.lastName : "");

        // Spinners
        setSpinnerSelection(spinnerUserLevel, USER_LEVELS, user.userLevel);
        setSpinnerSelectionByValue(spinnerAgeRange, AGE_RANGES, user.ageRange);
        setSpinnerSelectionByValue(spinnerGender, GENDERS, user.gender);
        setSpinnerSelectionByValue(spinnerScooterUse, SCOOTER_USES, user.scooterUseType);

        // Deactivate button: hide if already inactive
        if (!user.isActive) {
            btnDeactivate.setVisibility(View.GONE);
        }
    }

    private void setSpinnerSelection(Spinner spinner, String[] values, String value) {
        if (value == null) {
            spinner.setSelection(0);
            return;
        }
        for (int i = 0; i < values.length; i++) {
            if (values[i].equalsIgnoreCase(value)) {  // Case-insensitive for defensive coding
                spinner.setSelection(i);
                return;
            }
        }
        spinner.setSelection(0);
    }

    private void setSpinnerSelectionByValue(Spinner spinner, String[] options, String value) {
        if (value == null || value.isEmpty()) {
            spinner.setSelection(0); // "Not set"
            return;
        }
        for (int i = 0; i < options.length; i++) {
            if (options[i].equals(value)) {
                spinner.setSelection(i);
                return;
            }
        }
        spinner.setSelection(0);
    }

    private void loadScooters() {
        supabase.getUserScooters(userId, new SupabaseClient.Callback<List<String>>() {
            @Override
            public void onSuccess(List<String> serials) {
                if (serials.isEmpty()) {
                    tvScooters.setText("No scooters registered");
                } else {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < serials.size(); i++) {
                        if (i > 0) sb.append("\n");
                        sb.append("  ").append(serials.get(i));
                    }
                    tvScooters.setText(sb.toString());
                }
            }

            @Override
            public void onError(String error) {
                tvScooters.setText("Error loading scooters");
                Log.e(TAG, "Load scooters error: " + error);
            }
        });
    }

    private void loadAuditTrail() {
        supabase.getUserAuditLog(userId, 20, new SupabaseClient.Callback<List<JsonObject>>() {
            @Override
            public void onSuccess(List<JsonObject> entries) {
                llAuditTrail.removeAllViews();

                if (entries.isEmpty()) {
                    tvNoAuditEntries.setVisibility(View.VISIBLE);
                    return;
                }

                tvNoAuditEntries.setVisibility(View.GONE);

                for (JsonObject entry : entries) {
                    View entryView = createAuditEntryView(entry);
                    llAuditTrail.addView(entryView);
                }
            }

            @Override
            public void onError(String error) {
                tvNoAuditEntries.setText("Error loading change history");
                tvNoAuditEntries.setVisibility(View.VISIBLE);
                Log.e(TAG, "Load audit trail error: " + error);
            }
        });
    }

    private View createAuditEntryView(JsonObject entry) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(0, 0, 0, 12);

        // Action and timestamp
        String action = entry.has("action") && !entry.get("action").isJsonNull()
                ? entry.get("action").getAsString() : "unknown";
        String createdAt = entry.has("created_at") && !entry.get("created_at").isJsonNull()
                ? entry.get("created_at").getAsString() : "";

        String formattedDate = formatTimestamp(createdAt);

        // Details
        String detailText = "";
        if (entry.has("details") && !entry.get("details").isJsonNull()) {
            JsonObject details = entry.getAsJsonObject("details");
            String field = details.has("field") ? details.get("field").getAsString() : "";
            String oldValue = details.has("old_value") ? details.get("old_value").getAsString() : "";
            String newValue = details.has("new_value") ? details.get("new_value").getAsString() : "";
            String changedBy = details.has("changed_by_email") ? details.get("changed_by_email").getAsString() : "";

            if ("update_field".equals(action) && !field.isEmpty()) {
                detailText = field + ": " + oldValue + " -> " + newValue;
                if (!changedBy.isEmpty()) {
                    detailText += "\nby " + changedBy;
                }
            } else if ("deactivate_user".equals(action)) {
                detailText = "User deactivated";
                if (!changedBy.isEmpty()) {
                    detailText += " by " + changedBy;
                }
            } else {
                detailText = action;
            }
        }

        // Action text
        TextView tvAction = new TextView(this);
        tvAction.setText(formattedDate + " - " + action.replace("_", " "));
        tvAction.setTextSize(13);
        tvAction.setTypeface(null, Typeface.BOLD);
        layout.addView(tvAction);

        // Detail text
        if (!detailText.isEmpty()) {
            TextView tvDetail = new TextView(this);
            tvDetail.setText(detailText);
            tvDetail.setTextSize(12);
            tvDetail.setTextColor(Color.GRAY);
            layout.addView(tvDetail);
        }

        return layout;
    }

    private String formatTimestamp(String timestamp) {
        if (timestamp == null || timestamp.isEmpty()) return "";
        try {
            SimpleDateFormat inputFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            SimpleDateFormat outputFormat = new SimpleDateFormat("MMM dd, yyyy HH:mm", Locale.US);
            Date date = inputFormat.parse(timestamp);
            return outputFormat.format(date);
        } catch (Exception e) {
            return timestamp;
        }
    }

    // ==========================================
    // Edit Mode
    // ==========================================

    private void toggleEditMode() {
        isEditMode = !isEditMode;

        // Toggle field editability
        etFirstName.setEnabled(isEditMode);
        etLastName.setEnabled(isEditMode);
        spinnerUserLevel.setEnabled(isEditMode);
        spinnerAgeRange.setEnabled(isEditMode);
        spinnerGender.setEnabled(isEditMode);
        spinnerScooterUse.setEnabled(isEditMode);

        // Toggle buttons
        btnToggleEdit.setText(isEditMode ? "Cancel" : "Edit");
        btnSave.setVisibility(isEditMode ? View.VISIBLE : View.GONE);

        // If cancelling, restore original values
        if (!isEditMode && currentUser != null) {
            populateFields(currentUser);
        }
    }

    // ==========================================
    // Save Changes
    // ==========================================

    private void saveChanges() {
        if (currentUser == null) return;

        // Collect current field values
        String newFirstName = etFirstName.getText() != null ? etFirstName.getText().toString().trim() : "";
        String newLastName = etLastName.getText() != null ? etLastName.getText().toString().trim() : "";
        String newUserLevel = USER_LEVELS[spinnerUserLevel.getSelectedItemPosition()];
        String newAgeRange = spinnerAgeRange.getSelectedItemPosition() > 0
                ? AGE_RANGES[spinnerAgeRange.getSelectedItemPosition()] : null;
        String newGender = spinnerGender.getSelectedItemPosition() > 0
                ? GENDERS[spinnerGender.getSelectedItemPosition()] : null;
        String newScooterUse = spinnerScooterUse.getSelectedItemPosition() > 0
                ? SCOOTER_USES[spinnerScooterUse.getSelectedItemPosition()] : null;

        // Build changes JSON (only changed fields)
        JsonObject changes = new JsonObject();
        boolean hasChanges = false;

        if (!nullSafeEquals(newFirstName.isEmpty() ? null : newFirstName, currentUser.firstName)) {
            changes.addProperty("first_name", newFirstName.isEmpty() ? "" : newFirstName);
            hasChanges = true;
        }
        if (!nullSafeEquals(newLastName.isEmpty() ? null : newLastName, currentUser.lastName)) {
            changes.addProperty("last_name", newLastName.isEmpty() ? "" : newLastName);
            hasChanges = true;
        }
        if (!nullSafeEquals(newUserLevel, currentUser.userLevel)) {
            changes.addProperty("user_level", newUserLevel);
            hasChanges = true;
        }
        if (!nullSafeEquals(newAgeRange, currentUser.ageRange)) {
            if (newAgeRange != null) {
                changes.addProperty("age_range", newAgeRange);
            } else {
                changes.add("age_range", null);
            }
            hasChanges = true;
        }
        if (!nullSafeEquals(newGender, currentUser.gender)) {
            if (newGender != null) {
                changes.addProperty("gender", newGender);
            } else {
                changes.add("gender", null);
            }
            hasChanges = true;
        }
        if (!nullSafeEquals(newScooterUse, currentUser.scooterUseType)) {
            if (newScooterUse != null) {
                changes.addProperty("scooter_use_type", newScooterUse);
            } else {
                changes.add("scooter_use_type", null);
            }
            hasChanges = true;
        }

        if (!hasChanges) {
            Toast.makeText(this, "No changes to save", Toast.LENGTH_SHORT).show();
            return;
        }

        btnSave.setEnabled(false);

        // PATCH the user record
        supabase.updateUser(userId, changes, new SupabaseClient.Callback<Void>() {
            @Override
            public void onSuccess(Void result) {
                // Create audit log entries for each changed field
                createAuditEntries(changes);

                Toast.makeText(UserDetailActivity.this, "Changes saved", Toast.LENGTH_SHORT).show();
                btnSave.setEnabled(true);

                // Exit edit mode and reload
                isEditMode = false;
                loadUser();
                btnToggleEdit.setText("Edit");
                btnSave.setVisibility(View.GONE);
            }

            @Override
            public void onError(String error) {
                Log.e(TAG, "Save error: " + error);
                Toast.makeText(UserDetailActivity.this, "Error saving: " + error, Toast.LENGTH_LONG).show();
                btnSave.setEnabled(true);
            }
        });
    }

    /**
     * Create one audit log entry per changed field.
     */
    private void createAuditEntries(JsonObject changes) {
        for (String key : changes.keySet()) {
            String oldValue = getOriginalValue(key);
            String newValue = changes.get(key).isJsonNull() ? "" : changes.get(key).getAsString();

            JsonObject details = new JsonObject();
            details.addProperty("field", key);
            details.addProperty("old_value", oldValue != null ? oldValue : "");
            details.addProperty("new_value", newValue);
            details.addProperty("changed_by_email", distributorEmail);

            supabase.createAuditLogEntry(userId, "update_field", details, new SupabaseClient.Callback<Void>() {
                @Override
                public void onSuccess(Void result) {
                    Log.d(TAG, "Audit log entry created for field: " + key);
                }

                @Override
                public void onError(String error) {
                    Log.e(TAG, "Failed to create audit log for field " + key + ": " + error);
                }
            });
        }
    }

    private String getOriginalValue(String fieldName) {
        if (currentUser == null) return "";
        switch (fieldName) {
            case "first_name": return currentUser.firstName;
            case "last_name": return currentUser.lastName;
            case "user_level": return currentUser.userLevel;
            case "age_range": return currentUser.ageRange;
            case "gender": return currentUser.gender;
            case "scooter_use_type": return currentUser.scooterUseType;
            default: return "";
        }
    }

    private boolean nullSafeEquals(String a, String b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        return a.equals(b);
    }

    // ==========================================
    // Deactivate User
    // ==========================================

    private void confirmDeactivate() {
        if (currentUser == null) return;

        new AlertDialog.Builder(this)
                .setTitle("Deactivate User")
                .setMessage("Are you sure you want to deactivate " + currentUser.getDisplayName() + "?\n\n" +
                        "This will prevent them from logging in. This action can be reversed.")
                .setPositiveButton("Deactivate", (dialog, which) -> deactivateUser())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void deactivateUser() {
        btnDeactivate.setEnabled(false);

        supabase.deactivateUser(userId, new SupabaseClient.Callback<Void>() {
            @Override
            public void onSuccess(Void result) {
                // Create audit log entry
                JsonObject details = new JsonObject();
                details.addProperty("changed_by_email", distributorEmail);

                supabase.createAuditLogEntry(userId, "deactivate_user", details, new SupabaseClient.Callback<Void>() {
                    @Override
                    public void onSuccess(Void result) {
                        Log.d(TAG, "Deactivation audit log created");
                    }

                    @Override
                    public void onError(String error) {
                        Log.e(TAG, "Failed to create deactivation audit log: " + error);
                    }
                });

                Toast.makeText(UserDetailActivity.this, "User deactivated", Toast.LENGTH_SHORT).show();
                finish();
            }

            @Override
            public void onError(String error) {
                Log.e(TAG, "Deactivate error: " + error);
                Toast.makeText(UserDetailActivity.this, "Error: " + error, Toast.LENGTH_LONG).show();
                btnDeactivate.setEnabled(true);
            }
        });
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (supabase != null) {
            supabase.shutdown();
        }
    }
}
