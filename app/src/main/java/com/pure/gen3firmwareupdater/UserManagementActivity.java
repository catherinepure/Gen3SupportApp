package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.textfield.TextInputEditText;

import java.util.ArrayList;
import java.util.List;

/**
 * User Management screen for distributors.
 * Search, view, and navigate to user details for editing.
 */
public class UserManagementActivity extends AppCompatActivity {

    private static final String TAG = "UserManagement";

    private TextInputEditText etSearch;
    private MaterialButton btnSearch;
    private Spinner spinnerFilter;
    private RecyclerView rvUsers;
    private TextView tvEmpty;
    private ProgressBar progressBar;

    private SupabaseClient supabase;
    private UserListAdapter adapter;
    private List<UserInfo> userList;
    private String distributorId;

    private static final String[] FILTER_OPTIONS = {"All Users", "Active", "Inactive", "Unverified"};
    private static final String[] FILTER_VALUES = {"all", "active", "inactive", "unverified"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_user_management);

        // Get distributor ID from session
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        distributorId = com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager().getDistributorId();

        if (distributorId == null) {
            Toast.makeText(this, "Distributor ID not found", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }

        // Initialize Supabase client
        supabase = com.pure.gen3firmwareupdater.services.ServiceFactory.getSupabaseClient();

        // Initialize views
        etSearch = findViewById(R.id.etSearch);
        btnSearch = findViewById(R.id.btnSearch);
        spinnerFilter = findViewById(R.id.spinnerFilter);
        rvUsers = findViewById(R.id.rvUsers);
        tvEmpty = findViewById(R.id.tvEmpty);
        progressBar = findViewById(R.id.progressBar);

        // Setup filter spinner
        ArrayAdapter<String> filterAdapter = new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_item, FILTER_OPTIONS);
        filterAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerFilter.setAdapter(filterAdapter);

        // Setup RecyclerView
        userList = new ArrayList<>();
        adapter = new UserListAdapter(userList);
        adapter.setOnUserClickListener(user -> {
            Intent intent = new Intent(UserManagementActivity.this, UserDetailActivity.class);
            intent.putExtra("user_id", user.id);
            startActivity(intent);
        });
        rvUsers.setLayoutManager(new LinearLayoutManager(this));
        rvUsers.setAdapter(adapter);

        // Search button click
        btnSearch.setOnClickListener(v -> performSearch());

        // Search on keyboard "Search" action
        etSearch.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                performSearch();
                return true;
            }
            return false;
        });

        // Filter change triggers new search
        spinnerFilter.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                // Only search if we've already done an initial search or user changed filter
                if (userList.size() > 0 || position > 0) {
                    performSearch();
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // Load all users initially
        performSearch();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Refresh results when returning from detail screen (user may have been edited)
        if (userList.size() > 0) {
            performSearch();
        }
    }

    private void performSearch() {
        String query = etSearch.getText() != null ? etSearch.getText().toString().trim() : "";
        int filterIndex = spinnerFilter.getSelectedItemPosition();
        String filter = filterIndex >= 0 && filterIndex < FILTER_VALUES.length
                ? FILTER_VALUES[filterIndex] : "all";

        progressBar.setVisibility(View.VISIBLE);
        tvEmpty.setVisibility(View.GONE);
        rvUsers.setVisibility(View.GONE);

        supabase.searchUsers(query, filter, distributorId, new SupabaseClient.Callback<List<UserInfo>>() {
            @Override
            public void onSuccess(List<UserInfo> result) {
                userList.clear();
                userList.addAll(result);
                adapter.notifyDataSetChanged();

                progressBar.setVisibility(View.GONE);
                if (result.isEmpty()) {
                    tvEmpty.setVisibility(View.VISIBLE);
                    rvUsers.setVisibility(View.GONE);
                } else {
                    tvEmpty.setVisibility(View.GONE);
                    rvUsers.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onError(String error) {
                Log.e(TAG, "Search error: " + error);
                progressBar.setVisibility(View.GONE);
                tvEmpty.setText("Error: " + error);
                tvEmpty.setVisibility(View.VISIBLE);
                rvUsers.setVisibility(View.GONE);
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
