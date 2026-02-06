package com.pure.gen3firmwareupdater;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

/**
 * Home screen. Shows registration/login options when not logged in,
 * or a user hub (scan scooter, logout) when logged in as a regular user.
 * Distributors are redirected straight to DistributorMenuActivity.
 */
public class RegistrationChoiceActivity extends AppCompatActivity {

    private static final String TAG = "RegistrationChoice";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        com.pure.gen3firmwareupdater.services.SessionManager session =
                com.pure.gen3firmwareupdater.services.ServiceFactory.getSessionManager();

        Log.d(TAG, "isLoggedIn=" + session.isLoggedIn()
                + " isDistributor=" + session.isDistributor()
                + " role='" + session.getUserRole() + "'"
                + " distributorId='" + session.getDistributorId() + "'"
                + " email='" + session.getUserEmail() + "'");

        if (session.isLoggedIn() && session.isDistributor()) {
            Log.d(TAG, "Routing to DistributorMenuActivity");
            Intent intent = new Intent(this, DistributorMenuActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(intent);
            finish();
            return;
        }

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
