# Terms & Conditions - Android App Integration (Java)

## Overview
This guide shows how to integrate the T&C system into your **Java-based Android app**. The system checks if users need to accept new Terms & Conditions and saves their acceptance with a full audit trail.

---

## Quick Start

### Step 1: Add Dependencies

Add these to your `app/build.gradle`:

```gradle
dependencies {
    // For HTTP requests
    implementation 'com.squareup.okhttp3:okhttp:4.12.0'

    // For JSON parsing
    implementation 'com.google.code.gson:gson:2.10.1'

    // Optional: For easier async handling
    // implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.7.0'
}
```

---

## Complete Java Implementation

### 1. Create Data Models

```java
// CheckAcceptanceResponse.java
public class CheckAcceptanceResponse {
    @SerializedName("needs_acceptance")
    public boolean needsAcceptance;

    @SerializedName("current_version")
    public String currentVersion;

    @SerializedName("latest_version")
    public String latestVersion;

    @SerializedName("last_accepted_at")
    public String lastAcceptedAt;

    public String region;
    public String language;

    @SerializedName("terms_url")
    public String termsUrl;

    @SerializedName("terms_id")
    public String termsId;

    @SerializedName("terms_title")
    public String termsTitle;
}

// ConsentRequest.java
public class ConsentRequest {
    @SerializedName("session_token")
    public String sessionToken;

    @SerializedName("user_id")
    public String userId;

    @SerializedName("terms_id")
    public String termsId;

    public String version;

    @SerializedName("language_code")
    public String languageCode;

    @SerializedName("region_code")
    public String regionCode;

    @SerializedName("document_type")
    public String documentType;

    public boolean accepted;

    @SerializedName("scrolled_to_bottom")
    public boolean scrolledToBottom;

    @SerializedName("time_to_read_seconds")
    public int timeToReadSeconds;

    @SerializedName("ip_address")
    public String ipAddress;

    @SerializedName("user_agent")
    public String userAgent;

    @SerializedName("device_info")
    public String deviceInfo;
}

// ConsentResponse.java
public class ConsentResponse {
    public boolean success;

    @SerializedName("consent_id")
    public String consentId;

    @SerializedName("user_version_updated")
    public boolean userVersionUpdated;
}
```

---

### 2. Create Terms Manager

```java
// TermsManager.java
public class TermsManager {
    private static final String BASE_URL = "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms";
    private static final String SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwNTQsImV4cCI6MjA4NTc4NDA1NH0.w_9rkrz6Mw12asETIAk7jenY-yjVVxrLeWz642k3PVM";

    private final OkHttpClient httpClient;
    private final Gson gson;
    private final String sessionToken;
    private final String userId;
    private final Context context;

    public TermsManager(Context context, String sessionToken, String userId) {
        this.context = context;
        this.sessionToken = sessionToken;
        this.userId = userId;
        this.httpClient = new OkHttpClient();
        this.gson = new Gson();
    }

    /**
     * Check if user needs to accept Terms & Conditions
     */
    public CheckAcceptanceResponse checkAcceptance() throws IOException {
        String url = BASE_URL + "/check-acceptance?user_id=" + userId;

        Request request = new Request.Builder()
            .url(url)
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer " + SUPABASE_ANON_KEY)
            .addHeader("X-Session-Token", sessionToken)
            .get()
            .build();

        try (Response response = httpClient.newCall(request).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Failed to check acceptance: " + response.code());
            }

            String jsonData = response.body().string();
            return gson.fromJson(jsonData, CheckAcceptanceResponse.class);
        }
    }

    /**
     * Record user consent (acceptance or decline)
     */
    public ConsentResponse recordConsent(
        String termsId,
        String version,
        String languageCode,
        String regionCode,
        boolean accepted,
        boolean scrolledToBottom,
        int timeToReadSeconds
    ) throws IOException {

        ConsentRequest request = new ConsentRequest();
        request.sessionToken = sessionToken;
        request.userId = userId;
        request.termsId = termsId;
        request.version = version;
        request.languageCode = languageCode;
        request.regionCode = regionCode;
        request.documentType = "terms";
        request.accepted = accepted;
        request.scrolledToBottom = scrolledToBottom;
        request.timeToReadSeconds = timeToReadSeconds;
        request.ipAddress = getIpAddress();
        request.userAgent = getUserAgent();
        request.deviceInfo = getDeviceInfo();

        String json = gson.toJson(request);

        RequestBody body = RequestBody.create(
            json,
            MediaType.parse("application/json")
        );

        Request httpRequest = new Request.Builder()
            .url(BASE_URL + "/record-consent")
            .addHeader("Content-Type", "application/json")
            .addHeader("apikey", SUPABASE_ANON_KEY)
            .addHeader("Authorization", "Bearer " + SUPABASE_ANON_KEY)
            .addHeader("X-Session-Token", sessionToken)
            .post(body)
            .build();

        try (Response response = httpClient.newCall(httpRequest).execute()) {
            if (!response.isSuccessful()) {
                throw new IOException("Failed to record consent: " + response.code());
            }

            String jsonData = response.body().string();
            return gson.fromJson(jsonData, ConsentResponse.class);
        }
    }

    /**
     * Get device information as JSON string
     */
    private String getDeviceInfo() {
        JSONObject deviceInfo = new JSONObject();
        try {
            deviceInfo.put("model", Build.MODEL);
            deviceInfo.put("manufacturer", Build.MANUFACTURER);
            deviceInfo.put("os", "Android " + Build.VERSION.RELEASE);
            deviceInfo.put("sdk", Build.VERSION.SDK_INT);
            deviceInfo.put("app_version", BuildConfig.VERSION_NAME);
        } catch (JSONException e) {
            Log.e("TermsManager", "Error creating device info", e);
        }
        return deviceInfo.toString();
    }

    /**
     * Get user agent string
     */
    private String getUserAgent() {
        return "Gen3App/" + BuildConfig.VERSION_NAME +
               " (Android " + Build.VERSION.RELEASE + ")";
    }

    /**
     * Get IP address (placeholder - you may need to call external service)
     */
    private String getIpAddress() {
        // Option 1: Get local IP (not recommended for audit trail)
        // Option 2: Call external service like ipify.org
        // Option 3: Let backend capture it from request
        return "0.0.0.0"; // Placeholder
    }
}
```

---

### 3. Create Terms Dialog Activity

```java
// TermsDialogActivity.java
public class TermsDialogActivity extends AppCompatActivity {

    private WebView webView;
    private Button acceptButton;
    private Button declineButton;
    private ProgressBar progressBar;

    private boolean scrolledToBottom = false;
    private long startTime;

    private String termsUrl;
    private String termsId;
    private String version;
    private String region;
    private String language;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_terms_dialog);

        // Get data from intent
        termsUrl = getIntent().getStringExtra("terms_url");
        termsId = getIntent().getStringExtra("terms_id");
        version = getIntent().getStringExtra("version");
        region = getIntent().getStringExtra("region");
        language = getIntent().getStringExtra("language");

        // Initialize views
        webView = findViewById(R.id.webView);
        acceptButton = findViewById(R.id.acceptButton);
        declineButton = findViewById(R.id.declineButton);
        progressBar = findViewById(R.id.progressBar);

        // Disable accept button initially
        acceptButton.setEnabled(false);
        acceptButton.setAlpha(0.5f);

        // Track start time
        startTime = System.currentTimeMillis();

        // Setup WebView
        setupWebView();

        // Setup buttons
        acceptButton.setOnClickListener(v -> handleAccept());
        declineButton.setOnClickListener(v -> handleDecline());

        // Load T&C
        webView.loadUrl(termsUrl);
    }

    private void setupWebView() {
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false); // Disable JS for security
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                progressBar.setVisibility(View.GONE);
            }
        });

        // Track scroll position
        webView.setOnScrollChangeListener(new View.OnScrollChangeListener() {
            @Override
            public void onScrollChange(View v, int scrollX, int scrollY,
                                      int oldScrollX, int oldScrollY) {
                if (isScrolledToBottom()) {
                    scrolledToBottom = true;
                    enableAcceptButton();
                }
            }
        });
    }

    private boolean isScrolledToBottom() {
        int scrollY = webView.getScrollY();
        int height = webView.getHeight();
        int contentHeight = (int) Math.floor(
            webView.getContentHeight() * webView.getScale()
        );

        // Check if scrolled to bottom (with small threshold)
        return (scrollY + height) >= (contentHeight - 20);
    }

    private void enableAcceptButton() {
        acceptButton.setEnabled(true);
        acceptButton.setAlpha(1.0f);
        Toast.makeText(this,
            "You may now accept the Terms & Conditions",
            Toast.LENGTH_SHORT
        ).show();
    }

    private void handleAccept() {
        int timeSpent = (int) ((System.currentTimeMillis() - startTime) / 1000);

        // Show progress
        progressBar.setVisibility(View.VISIBLE);
        acceptButton.setEnabled(false);
        declineButton.setEnabled(false);

        // Record consent in background thread
        new Thread(() -> {
            try {
                String sessionToken = getSessionToken(); // Get from SharedPreferences
                String userId = getUserId(); // Get from SharedPreferences

                TermsManager termsManager = new TermsManager(
                    this,
                    sessionToken,
                    userId
                );

                ConsentResponse response = termsManager.recordConsent(
                    termsId,
                    version,
                    language,
                    region,
                    true, // accepted
                    scrolledToBottom,
                    timeSpent
                );

                // Success - return to caller
                runOnUiThread(() -> {
                    Intent resultIntent = new Intent();
                    resultIntent.putExtra("accepted", true);
                    setResult(RESULT_OK, resultIntent);
                    finish();
                });

            } catch (IOException e) {
                Log.e("TermsDialog", "Failed to record consent", e);

                runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    acceptButton.setEnabled(true);
                    declineButton.setEnabled(true);

                    Toast.makeText(this,
                        "Failed to save acceptance. Please try again.",
                        Toast.LENGTH_LONG
                    ).show();
                });
            }
        }).start();
    }

    private void handleDecline() {
        new AlertDialog.Builder(this)
            .setTitle("Decline Terms & Conditions")
            .setMessage("You must accept the Terms & Conditions to use this app.")
            .setPositiveButton("Review Again", (dialog, which) -> {
                // Stay on this screen
            })
            .setNegativeButton("Exit App", (dialog, which) -> {
                Intent resultIntent = new Intent();
                resultIntent.putExtra("accepted", false);
                setResult(RESULT_CANCELED, resultIntent);
                finish();
            })
            .show();
    }

    private String getSessionToken() {
        SharedPreferences prefs = getSharedPreferences("app_prefs", MODE_PRIVATE);
        return prefs.getString("session_token", null);
    }

    private String getUserId() {
        SharedPreferences prefs = getSharedPreferences("app_prefs", MODE_PRIVATE);
        return prefs.getString("user_id", null);
    }

    @Override
    public void onBackPressed() {
        // Prevent back button - user must accept or decline
        Toast.makeText(this,
            "Please accept or decline the Terms & Conditions",
            Toast.LENGTH_SHORT
        ).show();
    }
}
```

---

### 4. Create Layout

```xml
<!-- res/layout/activity_terms_dialog.xml -->
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp">

    <TextView
        android:id="@+id/titleText"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Terms &amp; Conditions"
        android:textSize="24sp"
        android:textStyle="bold"
        android:gravity="center"
        android:paddingBottom="16dp"/>

    <TextView
        android:id="@+id/instructionText"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Please read and scroll to the bottom to accept"
        android:textSize="14sp"
        android:gravity="center"
        android:paddingBottom="8dp"/>

    <FrameLayout
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1">

        <WebView
            android:id="@+id/webView"
            android:layout_width="match_parent"
            android:layout_height="match_parent"
            android:background="#FFFFFF"/>

        <ProgressBar
            android:id="@+id/progressBar"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:layout_gravity="center"
            android:visibility="visible"/>
    </FrameLayout>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:paddingTop="16dp"
        android:gravity="center">

        <Button
            android:id="@+id/declineButton"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginEnd="8dp"
            android:text="Decline"
            android:backgroundTint="#757575"/>

        <Button
            android:id="@+id/acceptButton"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:layout_marginStart="8dp"
            android:text="Accept"
            android:backgroundTint="#4CAF50"/>
    </LinearLayout>
</LinearLayout>
```

---

### 5. Integrate in MainActivity

```java
// MainActivity.java
public class MainActivity extends AppCompatActivity {

    private static final int REQUEST_CODE_TERMS = 1001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        // Check T&C on app launch
        checkTermsAndConditions();
    }

    private void checkTermsAndConditions() {
        // Show loading indicator
        ProgressDialog progressDialog = ProgressDialog.show(
            this,
            "Loading",
            "Checking Terms & Conditions...",
            true,
            false
        );

        // Check in background thread
        new Thread(() -> {
            try {
                String sessionToken = getSessionToken();
                String userId = getUserId();

                TermsManager termsManager = new TermsManager(
                    this,
                    sessionToken,
                    userId
                );

                CheckAcceptanceResponse response = termsManager.checkAcceptance();

                runOnUiThread(() -> {
                    progressDialog.dismiss();

                    if (response.needsAcceptance) {
                        // User needs to accept T&C
                        Log.d("MainActivity", "User needs to accept version " +
                              response.latestVersion);
                        showTermsDialog(response);
                    } else {
                        // User is up-to-date
                        Log.d("MainActivity", "User is up-to-date on T&C");
                        proceedToApp();
                    }
                });

            } catch (IOException e) {
                Log.e("MainActivity", "Failed to check T&C", e);

                runOnUiThread(() -> {
                    progressDialog.dismiss();

                    new AlertDialog.Builder(this)
                        .setTitle("Error")
                        .setMessage("Failed to check Terms & Conditions. " +
                                  "Please check your internet connection.")
                        .setPositiveButton("Retry", (dialog, which) -> {
                            checkTermsAndConditions();
                        })
                        .setNegativeButton("Exit", (dialog, which) -> {
                            finish();
                        })
                        .show();
                });
            }
        }).start();
    }

    private void showTermsDialog(CheckAcceptanceResponse response) {
        Intent intent = new Intent(this, TermsDialogActivity.class);
        intent.putExtra("terms_url", response.termsUrl);
        intent.putExtra("terms_id", response.termsId);
        intent.putExtra("version", response.latestVersion);
        intent.putExtra("region", response.region);
        intent.putExtra("language", response.language);
        startActivityForResult(intent, REQUEST_CODE_TERMS);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_TERMS) {
            if (resultCode == RESULT_OK &&
                data != null &&
                data.getBooleanExtra("accepted", false)) {
                // User accepted T&C
                Toast.makeText(this,
                    "Thank you for accepting the Terms & Conditions",
                    Toast.LENGTH_SHORT
                ).show();
                proceedToApp();
            } else {
                // User declined T&C
                new AlertDialog.Builder(this)
                    .setTitle("Terms & Conditions Required")
                    .setMessage("You must accept the Terms & Conditions to use this app.")
                    .setPositiveButton("OK", (dialog, which) -> {
                        finish(); // Close app
                    })
                    .setCancelable(false)
                    .show();
            }
        }
    }

    private void proceedToApp() {
        // Continue to main app functionality
        Log.d("MainActivity", "Proceeding to main app");
        // ... your existing app code
    }

    private String getSessionToken() {
        SharedPreferences prefs = getSharedPreferences("app_prefs", MODE_PRIVATE);
        return prefs.getString("session_token", null);
    }

    private String getUserId() {
        SharedPreferences prefs = getSharedPreferences("app_prefs", MODE_PRIVATE);
        return prefs.getString("user_id", null);
    }
}
```

---

## AndroidManifest.xml

Add the Terms Dialog Activity:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.pureelectric.gen3app">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".App"
        android:label="@string/app_name"
        android:theme="@style/AppTheme">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <activity
            android:name=".TermsDialogActivity"
            android:theme="@style/Theme.AppCompat.Dialog"
            android:screenOrientation="portrait" />

    </application>
</manifest>
```

---

## API Endpoints Summary

### Base URL
```
https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms
```

### Headers (All Requests)
```
apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Session-Token: <user's session token>
```

### 1. Check Acceptance
**GET** `/check-acceptance?user_id={userId}`

Returns:
- `needs_acceptance` - boolean
- `terms_id` - UUID (use this for recording consent)
- `terms_url` - String (load in WebView)
- `latest_version` - String
- `region` - String
- `language` - String

### 2. Record Consent
**POST** `/record-consent`

Body:
```json
{
  "session_token": "...",
  "user_id": "...",
  "terms_id": "...",
  "version": "1.0",
  "language_code": "en",
  "region_code": "US",
  "document_type": "terms",
  "accepted": true,
  "scrolled_to_bottom": true,
  "time_to_read_seconds": 45,
  "ip_address": "...",
  "user_agent": "...",
  "device_info": "{...}"
}
```

---

## Testing Checklist

- [ ] New user (never accepted) - shows T&C dialog
- [ ] Existing user (up-to-date) - skips T&C dialog
- [ ] Existing user (new version) - shows T&C dialog
- [ ] Accept button disabled until scrolled to bottom
- [ ] Accept button records consent successfully
- [ ] Decline button shows warning and exits app
- [ ] Back button blocked during T&C review
- [ ] Network error handled gracefully with retry option
- [ ] Time tracking works correctly
- [ ] Scroll tracking works correctly
- [ ] Device info captured correctly

---

## Important Notes

1. **Session Token**: Make sure you have a valid session token from login before checking T&C
2. **User ID**: Store user ID in SharedPreferences after login
3. **WebView Security**: JavaScript is disabled for security. T&C HTML should be static.
4. **Error Handling**: Always handle network errors gracefully
5. **UI/UX**: Consider using a DialogFragment instead of full Activity for better UX
6. **Testing**: Test on different screen sizes and API levels

---

## Next Steps

1. Copy the code above into your Android project
2. Replace placeholder values (session token, user ID)
3. Test with a new user account
4. Test with an existing user account
5. Verify consent records are saved in admin dashboard

---

## Support

If you encounter issues:
- Check logcat for error messages
- Verify session token is valid
- Check network connectivity
- Review admin dashboard at: https://ives.org.uk/app2026
