package com.pure.gen3firmwareupdater;

import android.os.Bundle;
import android.widget.Button;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Distributor/Workshop Staff Info Screen
 *
 * Distributor and workshop staff accounts are now created by administrators.
 * This screen informs users of the new process and directs them back to login.
 */
public class RegisterDistributorActivity extends AppCompatActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_register_distributor);

        TextView tvLogin = findViewById(R.id.tvLogin);
        if (tvLogin != null) {
            tvLogin.setOnClickListener(v -> finish());
        }

        // If layout has a register button, repurpose as back button
        Button btnRegister = findViewById(R.id.btnRegister);
        if (btnRegister != null) {
            btnRegister.setText("Back to Login");
            btnRegister.setOnClickListener(v -> finish());
        }
    }
}
