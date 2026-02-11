package com.pure.gen3firmwareupdater;

import android.graphics.Color;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import com.google.gson.JsonObject;
import com.pure.gen3firmwareupdater.services.TermsManager;

import java.io.IOException;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

/**
 * Terms & Conditions acceptance screen.
 * Features:
 * - Loads T&C from URL (HTML content)
 * - Tracks scrolling (must scroll to bottom)
 * - Records time to read
 * - Full audit trail (IP, device, user agent)
 */
public class TermsAcceptanceActivity extends AppCompatActivity {

    private static final String TAG = "TermsAcceptance";

    // Views
    private WebView webViewTerms;
    private Button btnAccept;
    private Button btnDecline;
    private TextView tvTitle;
    private TextView tvVersionInfo;
    private TextView tvScrollIndicator;
    private ProgressBar progressBar;

    // State
    private boolean hasScrolledToBottom = false;
    private long startTime;
    private TermsManager termsManager;

    // Data passed via intent
    private String termsUrl;
    private String termsId;
    private String version;
    private String languageCode;
    private String regionCode;
    private String documentType;
    private String title;
    private String userId;
    private String sessionToken;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_terms_acceptance);

        startTime = System.currentTimeMillis();

        // Get data from intent
        termsUrl = getIntent().getStringExtra("terms_url");
        termsId = getIntent().getStringExtra("terms_id");
        version = getIntent().getStringExtra("version");
        languageCode = getIntent().getStringExtra("language_code");
        regionCode = getIntent().getStringExtra("region_code");
        documentType = getIntent().getStringExtra("document_type");
        title = getIntent().getStringExtra("title");
        userId = getIntent().getStringExtra("user_id");
        sessionToken = getIntent().getStringExtra("session_token");

        if (termsUrl == null || termsId == null) {
            Toast.makeText(this, "Error: Missing terms data", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // Initialize views
        webViewTerms = findViewById(R.id.webViewTerms);
        btnAccept = findViewById(R.id.btnAccept);
        btnDecline = findViewById(R.id.btnDecline);
        tvTitle = findViewById(R.id.tvTitle);
        tvVersionInfo = findViewById(R.id.tvVersionInfo);
        tvScrollIndicator = findViewById(R.id.tvScrollIndicator);
        progressBar = findViewById(R.id.progressBar);

        // Initialize TermsManager
        com.pure.gen3firmwareupdater.services.ServiceFactory.init(this);
        termsManager = com.pure.gen3firmwareupdater.services.ServiceFactory.getTermsManager();

        // Set title
        tvTitle.setText(title != null ? title : "Terms & Conditions");
        tvVersionInfo.setText("Version " + version);

        // Disable accept button initially
        btnAccept.setEnabled(false);
        btnAccept.setAlpha(0.5f);

        // Configure WebView
        webViewTerms.getSettings().setJavaScriptEnabled(false); // No JS needed for static HTML
        webViewTerms.getSettings().setBuiltInZoomControls(true);
        webViewTerms.getSettings().setDisplayZoomControls(false);

        // Monitor scroll position
        webViewTerms.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            checkIfScrolledToBottom();
        });

        // WebView client to hide progress when loaded
        webViewTerms.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        // Fetch T&C HTML content and render it (Supabase storage serves .html as text/plain,
        // which causes WebView.loadUrl() to show raw HTML source instead of rendered page)
        fetchAndLoadHtml(termsUrl);

        // Button listeners
        btnAccept.setOnClickListener(v -> acceptTerms());
        btnDecline.setOnClickListener(v -> declineTerms());
    }

    /**
     * Fetch HTML content from URL and load it into the WebView as rendered HTML.
     * This works around Supabase storage serving .html files with text/plain content-type.
     */
    private void fetchAndLoadHtml(String url) {
        OkHttpClient client = new OkHttpClient();
        Request request = new Request.Builder().url(url).build();

        client.newCall(request).enqueue(new okhttp3.Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String html = response.body() != null ? response.body().string() : "";
                runOnUiThread(() -> {
                    webViewTerms.loadDataWithBaseURL(url, html, "text/html", "UTF-8", null);
                    progressBar.setVisibility(View.GONE);
                });
            }

            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Failed to fetch T&C HTML", e);
                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    Toast.makeText(TermsAcceptanceActivity.this,
                            "Failed to load Terms & Conditions", Toast.LENGTH_LONG).show();
                });
            }
        });
    }

    /**
     * Check if user has scrolled to bottom of T&C
     */
    private void checkIfScrolledToBottom() {
        WebView webView = webViewTerms;
        int scrollY = webView.getScrollY();
        int height = webView.getHeight();
        int contentHeight = (int) (webView.getContentHeight() * webView.getScale());

        // Check if scrolled to bottom (with 10px tolerance)
        if (scrollY + height >= contentHeight - 10) {
            if (!hasScrolledToBottom) {
                hasScrolledToBottom = true;
                enableAcceptButton();
            }
        }
    }

    /**
     * Enable accept button after scrolling to bottom
     */
    private void enableAcceptButton() {
        btnAccept.setEnabled(true);
        btnAccept.setAlpha(1.0f);
        tvScrollIndicator.setText("✓ You have read the terms");
        tvScrollIndicator.setTextColor(Color.parseColor("#4CAF50")); // Green
    }

    /**
     * User accepted terms
     */
    private void acceptTerms() {
        long timeToRead = (System.currentTimeMillis() - startTime) / 1000; // seconds

        btnAccept.setEnabled(false);
        btnDecline.setEnabled(false);
        progressBar.setVisibility(View.VISIBLE);

        // Get IP address and record consent
        termsManager.getPublicIPAddress(new TermsManager.TermsCallback<String>() {
            @Override
            public void onSuccess(String ipAddress) {
                recordConsent(ipAddress, (int) timeToRead);
            }

            @Override
            public void onError(String error) {
                // Record anyway with null IP
                recordConsent(null, (int) timeToRead);
            }
        });
    }

    /**
     * Record consent with full audit trail
     */
    private void recordConsent(String ipAddress, int timeToRead) {
        String userAgent = termsManager.getUserAgent();
        String deviceInfo = termsManager.getDeviceInfo();

        termsManager.recordConsent(
                sessionToken,
                userId,
                termsId,
                version,
                languageCode,
                regionCode,
                documentType,
                true, // accepted
                hasScrolledToBottom,
                timeToRead,
                ipAddress,
                userAgent,
                deviceInfo,
                new TermsManager.TermsCallback<JsonObject>() {
                    @Override
                    public void onSuccess(JsonObject result) {
                        if (isFinishing() || isDestroyed()) return;
                        runOnUiThread(() -> {
                            if (isFinishing() || isDestroyed()) return;
                            Toast.makeText(TermsAcceptanceActivity.this,
                                    "Terms accepted", Toast.LENGTH_SHORT).show();
                            setResult(RESULT_OK);
                            finish();
                        });
                    }

                    @Override
                    public void onError(String error) {
                        if (isFinishing() || isDestroyed()) return;
                        runOnUiThread(() -> {
                            if (isFinishing() || isDestroyed()) return;
                            Log.e(TAG, "Failed to record consent: " + error);
                            progressBar.setVisibility(View.GONE);
                            btnAccept.setEnabled(true);
                            btnDecline.setEnabled(true);
                            Toast.makeText(TermsAcceptanceActivity.this,
                                    "Error recording acceptance: " + error, Toast.LENGTH_LONG).show();
                        });
                    }
                }
        );
    }

    /**
     * User declined terms
     */
    private void declineTerms() {
        new AlertDialog.Builder(this)
                .setTitle("Cannot Continue")
                .setMessage("You must accept the Terms & Conditions to use this app.")
                .setPositiveButton("Read Again", null)
                .setNegativeButton("Exit App", (dialog, which) -> {
                    // User declined - cannot use app
                    setResult(RESULT_CANCELED);
                    finishAffinity(); // Close entire app
                })
                .setCancelable(false)
                .show();
    }

    @Override
    public void onBackPressed() {
        // Prevent back button from bypassing T&C acceptance
        new AlertDialog.Builder(this)
                .setTitle("Accept Terms Required")
                .setMessage("You must accept the Terms & Conditions to continue.")
                .setPositiveButton("Continue Reading", null)
                .setNegativeButton("Exit App", (dialog, which) -> {
                    setResult(RESULT_CANCELED);
                    finishAffinity();
                })
                .show();
    }
}
