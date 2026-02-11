# Terms & Conditions System - Implementation Plan
**Date:** 2026-02-10
**Objective:** Bucket-based, CDN-ready T&C system with versioning and regional management

---

## Executive Summary

**Requirements:**
- ✅ T&Cs stored in Supabase Storage bucket (like firmware)
- ✅ Region-based and multilingual (e.g., US-en, GB-en, ES-es, FR-fr)
- ✅ Version tracking with automatic update detection
- ✅ User must scroll to bottom before accepting
- ✅ Acceptance logged per version per user
- ✅ Distributors can manage their region's T&Cs via web-admin
- ✅ Distributors can view acceptance history for their region
- ✅ CDN-ready structure for future deployment

---

## 1. STORAGE ARCHITECTURE

### 1.1 Supabase Storage Bucket Structure

```
Bucket: terms-and-conditions (public read access)
├── global/
│   ├── privacy-policy-1.0-en.html
│   ├── privacy-policy-1.0-es.html
│   ├── privacy-policy-1.0-fr.html
│   └── privacy-policy-1.1-en.html
│
├── US/
│   ├── terms-1.0-en.html
│   ├── terms-1.1-en.html
│   └── terms-2.0-en.html
│
├── GB/
│   ├── terms-1.0-en.html
│   └── terms-1.1-en.html
│
├── EU/
│   ├── terms-1.0-en.html
│   ├── terms-1.0-de.html
│   ├── terms-1.0-fr.html
│   ├── terms-1.0-es.html
│   └── terms-1.0-it.html
│
├── CN/
│   ├── terms-1.0-zh.html
│   └── terms-1.0-en.html
│
└── metadata/
    ├── catalog.json  (master index of all T&C files)
    └── regions.json  (region metadata)
```

**File Naming Convention:**
```
{type}-{version}-{language}.html

Examples:
- terms-1.0-en.html
- terms-1.1-en.html
- terms-2.0-es.html
- privacy-policy-1.0-en.html
```

**Why HTML Format:**
- Easy to display in WebView (Android) or iframe (web)
- Supports formatting, links, bold/italic
- Can include CSS for styling
- Browser-native rendering

---

### 1.2 Catalog File Structure

**File:** `metadata/catalog.json`

```json
{
  "last_updated": "2026-02-10T10:30:00Z",
  "regions": {
    "US": {
      "latest_version": "2.0",
      "languages": ["en", "es"],
      "terms": [
        {
          "version": "1.0",
          "language": "en",
          "path": "US/terms-1.0-en.html",
          "url": "https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/US/terms-1.0-en.html",
          "size_bytes": 15234,
          "sha256": "abc123...",
          "effective_date": "2025-01-01T00:00:00Z",
          "created_at": "2025-01-01T00:00:00Z",
          "created_by": "admin@pure.com",
          "is_active": false
        },
        {
          "version": "2.0",
          "language": "en",
          "path": "US/terms-2.0-en.html",
          "url": "https://...",
          "size_bytes": 18456,
          "sha256": "def456...",
          "effective_date": "2026-02-01T00:00:00Z",
          "created_at": "2026-01-20T00:00:00Z",
          "created_by": "admin@pure.com",
          "is_active": true
        }
      ]
    },
    "GB": {
      "latest_version": "1.1",
      "languages": ["en"],
      "terms": [...]
    },
    "EU": {
      "latest_version": "1.0",
      "languages": ["en", "de", "fr", "es", "it"],
      "terms": [...]
    },
    "CN": {
      "latest_version": "1.0",
      "languages": ["zh", "en"],
      "terms": [...]
    }
  },
  "global": {
    "privacy_policy": {
      "latest_version": "1.1",
      "languages": ["en", "es", "fr", "de", "zh"],
      "documents": [
        {
          "version": "1.1",
          "language": "en",
          "path": "global/privacy-policy-1.1-en.html",
          "url": "https://...",
          "is_active": true
        }
      ]
    }
  }
}
```

**Catalog Update Strategy:**
- Updated by web-admin when distributor uploads new T&C
- Cached by Android app (check once per day)
- Version comparison triggers re-acceptance prompt

---

## 2. DATABASE SCHEMA

### 2.1 T&C Metadata Table

```sql
-- Tracks T&C versions and their storage locations
CREATE TABLE terms_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Identification
  version TEXT NOT NULL,
  language_code TEXT NOT NULL,  -- ISO 639-1: en, es, fr, de, zh
  region_code TEXT NOT NULL,    -- US, GB, EU, CN, or "global"
  document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy', 'other')),

  -- Storage
  storage_path TEXT NOT NULL,   -- Path in bucket: "US/terms-1.0-en.html"
  public_url TEXT NOT NULL,     -- Full CDN/storage URL
  file_size_bytes BIGINT,
  sha256_hash TEXT,             -- For integrity verification

  -- Metadata
  title TEXT,
  effective_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,

  -- Management
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  distributor_id UUID REFERENCES distributors(id),  -- NULL for global T&C

  -- Constraints
  UNIQUE(version, language_code, region_code, document_type)
);

CREATE INDEX idx_tc_active ON terms_conditions(is_active, region_code, document_type);
CREATE INDEX idx_tc_region_lang ON terms_conditions(region_code, language_code);
CREATE INDEX idx_tc_distributor ON terms_conditions(distributor_id);
CREATE INDEX idx_tc_version ON terms_conditions(version, effective_date DESC);

COMMENT ON TABLE terms_conditions IS
'Metadata for T&C documents stored in Supabase Storage bucket';
```

### 2.2 User Consent Table

```sql
-- Tracks which users accepted which versions
CREATE TABLE user_consent (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User & Document
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_id UUID NOT NULL REFERENCES terms_conditions(id),

  -- What they accepted
  version TEXT NOT NULL,
  language_code TEXT NOT NULL,
  region_code TEXT NOT NULL,
  document_type TEXT NOT NULL,

  -- Acceptance details
  accepted BOOLEAN NOT NULL DEFAULT true,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit trail
  ip_address INET,
  user_agent TEXT,
  device_info TEXT,
  scrolled_to_bottom BOOLEAN DEFAULT false,  -- Android tracks scroll
  time_to_read_seconds INTEGER,              -- How long they took

  -- Only one acceptance per user per version
  UNIQUE(user_id, terms_id)
);

CREATE INDEX idx_consent_user ON user_consent(user_id, accepted_at DESC);
CREATE INDEX idx_consent_terms ON user_consent(terms_id);
CREATE INDEX idx_consent_version ON user_consent(version, region_code, accepted_at DESC);
CREATE INDEX idx_consent_accepted ON user_consent(accepted, accepted_at DESC);

COMMENT ON TABLE user_consent IS
'Tracks user acceptance of T&C versions with full audit trail';
```

### 2.3 User Language & Region Tracking

```sql
-- Add to users table
ALTER TABLE users
ADD COLUMN preferred_language TEXT DEFAULT 'en',
ADD COLUMN detected_region TEXT,
ADD COLUMN current_terms_version TEXT,
ADD COLUMN last_terms_check TIMESTAMPTZ;

CREATE INDEX idx_users_language ON users(preferred_language);
CREATE INDEX idx_users_region ON users(detected_region);

COMMENT ON COLUMN users.current_terms_version IS
'Last T&C version this user has accepted';

COMMENT ON COLUMN users.last_terms_check IS
'Last time app checked if user needs to accept new T&C version';
```

---

## 3. LANGUAGE DETECTION LOGIC

### 3.1 Language Priority

```
Priority 1: Device Language
  → Locale.getDefault().getLanguage()
  → e.g., "en", "es", "fr", "de", "zh"

Priority 2: User's Saved Preference
  → users.preferred_language
  → User can override in settings

Priority 3: Fallback to English
  → If region doesn't have user's language
  → Always provide English version as fallback
```

### 3.2 Region Detection

```
Priority 1: User's Saved Region
  → users.detected_region
  → Set during registration via GPS

Priority 2: Distributor's Region
  → If user linked to distributor
  → distributors.country

Priority 3: IP-based Geolocation
  → Fallback during registration

Priority 4: Manual Selection
  → User picks from dropdown
```

### 3.3 Language-Region Matching

**Android Implementation:**

```java
public class TermsLanguageResolver {

    public static String resolveLanguage(String preferredLanguage, String region) {
        // Get available languages for this region
        List<String> availableLanguages = getAvailableLanguages(region);

        // 1. Try preferred language
        if (availableLanguages.contains(preferredLanguage)) {
            return preferredLanguage;
        }

        // 2. Try device language
        String deviceLanguage = Locale.getDefault().getLanguage();
        if (availableLanguages.contains(deviceLanguage)) {
            return deviceLanguage;
        }

        // 3. Fallback to English
        if (availableLanguages.contains("en")) {
            return "en";
        }

        // 4. Use first available language
        return availableLanguages.isEmpty() ? "en" : availableLanguages.get(0);
    }

    private static List<String> getAvailableLanguages(String region) {
        // Query catalog.json or database
        // Return list of languages available for this region
    }
}
```

---

## 4. VERSION CHECKING SYSTEM

### 4.1 Version Comparison Logic

**App Startup Check:**

```java
public class TermsVersionChecker {

    // Check if user needs to accept new T&C version
    public void checkForNewVersion(String userId, VersionCheckCallback callback) {

        // 1. Get user's current accepted version
        String currentVersion = getCurrentVersion(userId);

        // 2. Get user's region and language
        String region = getUserRegion(userId);
        String language = getUserLanguage(userId);

        // 3. Fetch latest version from catalog
        String latestVersion = getLatestVersion(region, language);

        // 4. Compare versions
        if (isNewerVersion(latestVersion, currentVersion)) {
            callback.onNewVersionAvailable(latestVersion, currentVersion);
        } else {
            callback.onUpToDate();
        }
    }

    private boolean isNewerVersion(String latest, String current) {
        // Parse semantic versioning: "1.0", "1.1", "2.0"
        // Compare major.minor
        String[] latestParts = latest.split("\\.");
        String[] currentParts = current.split("\\.");

        int latestMajor = Integer.parseInt(latestParts[0]);
        int latestMinor = Integer.parseInt(latestParts[1]);

        int currentMajor = Integer.parseInt(currentParts[0]);
        int currentMinor = Integer.parseInt(currentParts[1]);

        if (latestMajor > currentMajor) return true;
        if (latestMajor == currentMajor && latestMinor > currentMinor) return true;

        return false;
    }
}
```

### 4.2 Check Frequency

**Strategy:**
- Check on app startup (if last check > 24 hours ago)
- Store `last_terms_check` timestamp in `users` table
- Background check: Once per day
- Force check: When user opens T&C screen manually

**Implementation:**

```java
public class TermsCheckScheduler {

    private static final long CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

    public boolean shouldCheckForUpdate(long lastCheckTimestamp) {
        long now = System.currentTimeMillis();
        return (now - lastCheckTimestamp) > CHECK_INTERVAL_MS;
    }

    public void scheduleNextCheck() {
        // Use WorkManager for periodic background check
        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(
            TermsCheckWorker.class,
            24, TimeUnit.HOURS
        ).build();

        WorkManager.getInstance(context).enqueue(workRequest);
    }
}
```

---

## 5. SCROLL-TO-ACCEPT UI

### 5.1 Android Implementation

**New Activity:** `TermsAcceptanceActivity.java`

```java
public class TermsAcceptanceActivity extends AppCompatActivity {

    private WebView webViewTerms;
    private Button btnAccept;
    private Button btnDecline;
    private TextView tvScrollIndicator;
    private ProgressBar progressBar;

    private boolean hasScrolledToBottom = false;
    private long startTime;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_terms_acceptance);

        startTime = System.currentTimeMillis();

        webViewTerms = findViewById(R.id.webViewTerms);
        btnAccept = findViewById(R.id.btnAccept);
        btnDecline = findViewById(R.id.btnDecline);
        tvScrollIndicator = findViewById(R.id.tvScrollIndicator);
        progressBar = findViewById(R.id.progressBar);

        // Disable accept button initially
        btnAccept.setEnabled(false);
        btnAccept.setAlpha(0.5f);

        // Load T&C from URL
        String termsUrl = getIntent().getStringExtra("terms_url");
        loadTerms(termsUrl);

        // Monitor scrolling
        webViewTerms.setOnScrollChangeListener((v, scrollX, scrollY, oldScrollX, oldScrollY) -> {
            checkIfScrolledToBottom();
        });

        btnAccept.setOnClickListener(v -> acceptTerms());
        btnDecline.setOnClickListener(v -> declineTerms());
    }

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

    private void enableAcceptButton() {
        btnAccept.setEnabled(true);
        btnAccept.setAlpha(1.0f);
        tvScrollIndicator.setText("✓ You have read the terms");
        tvScrollIndicator.setTextColor(Color.GREEN);
    }

    private void acceptTerms() {
        long timeToRead = (System.currentTimeMillis() - startTime) / 1000; // seconds

        // Record consent with full audit trail
        recordConsent(true, hasScrolledToBottom, timeToRead);

        Toast.makeText(this, "Terms accepted", Toast.LENGTH_SHORT).show();
        setResult(RESULT_OK);
        finish();
    }

    private void declineTerms() {
        new AlertDialog.Builder(this)
            .setTitle("Cannot Continue")
            .setMessage("You must accept the Terms & Conditions to use this app.")
            .setPositiveButton("Read Again", null)
            .setNegativeButton("Exit App", (dialog, which) -> {
                // User declined - cannot use app
                finishAffinity(); // Close app
            })
            .show();
    }

    private void recordConsent(boolean accepted, boolean scrolledToBottom, long timeToRead) {
        // Call edge function to record consent
        ConsentPayload payload = new ConsentPayload();
        payload.userId = userId;
        payload.termsId = termsId;
        payload.version = termsVersion;
        payload.languageCode = language;
        payload.regionCode = region;
        payload.accepted = accepted;
        payload.scrolledToBottom = scrolledToBottom;
        payload.timeToReadSeconds = (int) timeToRead;
        payload.ipAddress = getIPAddress();
        payload.userAgent = System.getProperty("http.agent");
        payload.deviceInfo = Build.MODEL + " (Android " + Build.VERSION.RELEASE + ")";

        // POST to /functions/v1/consent
        consentManager.recordConsent(payload, callback);
    }
}
```

### 5.2 Layout

**File:** `res/layout/activity_terms_acceptance.xml`

```xml
<LinearLayout
    orientation="vertical"
    layout_width="match_parent"
    layout_height="match_parent"
    padding="16dp">

    <!-- Header -->
    <TextView
        id="@+id/tvTitle"
        layout_width="match_parent"
        layout_height="wrap_content"
        text="Terms &amp; Conditions"
        textSize="24sp"
        textStyle="bold"
        marginBottom="16dp"/>

    <!-- Version Info -->
    <TextView
        id="@+id/tvVersionInfo"
        layout_width="match_parent"
        layout_height="wrap_content"
        text="Version 2.0 • Effective Feb 1, 2026"
        textSize="12sp"
        textColor="#666666"
        marginBottom="8dp"/>

    <!-- Scroll Indicator -->
    <TextView
        id="@+id/tvScrollIndicator"
        layout_width="match_parent"
        layout_height="wrap_content"
        text="Please scroll to the bottom to accept"
        textSize="14sp"
        textColor="#FF9800"
        textStyle="bold"
        marginBottom="16dp"/>

    <!-- WebView for T&C Content -->
    <WebView
        id="@+id/webViewTerms"
        layout_width="match_parent"
        layout_height="0dp"
        layout_weight="1"/>

    <!-- Progress Bar (while loading) -->
    <ProgressBar
        id="@+id/progressBar"
        layout_width="wrap_content"
        layout_height="wrap_content"
        layout_gravity="center"
        visibility="visible"/>

    <!-- Buttons -->
    <LinearLayout
        orientation="horizontal"
        layout_width="match_parent"
        layout_height="wrap_content"
        marginTop="16dp">

        <Button
            id="@+id/btnDecline"
            layout_width="0dp"
            layout_height="wrap_content"
            layout_weight="1"
            text="Decline"
            style="@style/Widget.MaterialComponents.Button.OutlinedButton"
            marginEnd="8dp"/>

        <Button
            id="@+id/btnAccept"
            layout_width="0dp"
            layout_height="wrap_content"
            layout_weight="1"
            text="Accept"
            enabled="false"
            marginStart="8dp"/>

    </LinearLayout>

</LinearLayout>
```

---

## 6. DISTRIBUTOR MANAGEMENT (WEB-ADMIN)

### 6.1 T&C Management Page

**New Page:** `web-admin/js/pages/terms-management.js`

**Features:**

1. **List T&C Versions**
   - Show all versions for distributor's region
   - Display: version, language, status, effective date
   - Sort by version (desc), language

2. **Upload New Version**
   - File upload form (HTML file)
   - Select language
   - Enter version number
   - Set effective date
   - Preview before saving

3. **Edit Existing Version**
   - Update title, effective date
   - Mark as active/inactive
   - Cannot edit content after users have accepted

4. **View Translations**
   - Show which languages are available
   - Upload new translation
   - Compare versions side-by-side

5. **Acceptance Statistics**
   - Total users in region
   - Acceptance rate per version
   - Users who need to re-accept (new version available)

**UI Wireframe:**

```
┌─────────────────────────────────────────────────┐
│ Terms & Conditions Management                   │
├─────────────────────────────────────────────────┤
│                                                 │
│ Region: US (United States)   [Upload New ↑]   │
│                                                 │
│ ┌─────────────────────────────────────────────┐│
│ │ Version │ Language │ Status  │ Effective   ││
│ ├─────────────────────────────────────────────┤│
│ │ 2.0     │ English  │ Active  │ Feb 1, 2026 ││
│ │ 2.0     │ Spanish  │ Active  │ Feb 1, 2026 ││
│ │ 1.1     │ English  │ Inactive│ Jan 1, 2026 ││
│ │ 1.0     │ English  │ Inactive│ Jan 1, 2025 ││
│ └─────────────────────────────────────────────┘│
│                                                 │
│ Acceptance Stats:                               │
│ • Version 2.0: 1,234 / 5,000 users (24.7%)     │
│ • Version 1.1: 3,766 / 5,000 users (75.3%)     │
│ • Need Re-accept: 3,766 users                  │
│                                                 │
└─────────────────────────────────────────────────┘
```

### 6.2 Acceptance History Page

**New Page:** `web-admin/js/pages/consent-history.js`

**Features:**

1. **Filter Options**
   - By user (email/name search)
   - By version
   - By date range
   - By acceptance status (accepted/declined)
   - By language

2. **Table Columns**
   - User email/name
   - Version accepted
   - Language
   - Accepted at (timestamp)
   - IP address
   - Device info
   - Time to read
   - Scrolled to bottom (✓/✗)

3. **Export**
   - CSV export for compliance
   - Include all audit fields
   - Filtered by date range

4. **User Detail**
   - Click user → show all their consent history
   - See which versions they've accepted over time

**UI Wireframe:**

```
┌─────────────────────────────────────────────────┐
│ Consent History                                 │
├─────────────────────────────────────────────────┤
│                                                 │
│ Filters:                                        │
│ Search: [____________]  Version: [All ▾]        │
│ Date: [Last 30 days ▾]  Status: [All ▾]        │
│                                       [Export CSV]│
│                                                 │
│ ┌─────────────────────────────────────────────┐│
│ │ User       │Ver│Lang│Date      │Time│Scroll││
│ ├─────────────────────────────────────────────┤│
│ │ user@ex.com│2.0│ en │Feb 5 10am│45s │  ✓   ││
│ │ john@ex.com│2.0│ en │Feb 4 2pm │120s│  ✓   ││
│ │ jane@ex.com│1.1│ es │Jan 15 9am│60s │  ✓   ││
│ └─────────────────────────────────────────────┘│
│                                                 │
│ Showing 3 of 1,234 records                      │
│ [1] 2 3 4 5 ... 50 →                           │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 7. EDGE FUNCTION ENDPOINTS

### 7.1 Get Latest T&C Version

**Endpoint:** `GET /functions/v1/terms/latest`

**Query Parameters:**
- `region` (required): US, GB, EU, CN
- `language` (optional): en, es, fr, de, zh (defaults to 'en')
- `document_type` (optional): terms, privacy (defaults to 'terms')

**Response:**

```json
{
  "id": "uuid-123",
  "version": "2.0",
  "language_code": "en",
  "region_code": "US",
  "document_type": "terms",
  "title": "Terms & Conditions",
  "public_url": "https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/US/terms-2.0-en.html",
  "effective_date": "2026-02-01T00:00:00Z",
  "file_size_bytes": 18456,
  "sha256_hash": "abc123..."
}
```

### 7.2 Check if User Needs to Accept New Version

**Endpoint:** `GET /functions/v1/terms/check-acceptance`

**Query Parameters:**
- `user_id` (required)
- `session_token` (header or body)

**Response:**

```json
{
  "needs_acceptance": true,
  "current_version": "1.1",
  "latest_version": "2.0",
  "region": "US",
  "language": "en",
  "terms_url": "https://...",
  "last_accepted_at": "2026-01-15T10:30:00Z"
}
```

### 7.3 Record Consent

**Endpoint:** `POST /functions/v1/terms/record-consent`

**Payload:**

```json
{
  "session_token": "...",
  "user_id": "uuid-456",
  "terms_id": "uuid-789",
  "version": "2.0",
  "language_code": "en",
  "region_code": "US",
  "document_type": "terms",
  "accepted": true,
  "scrolled_to_bottom": true,
  "time_to_read_seconds": 120,
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "device_info": "Samsung Galaxy S21 (Android 13)"
}
```

**Response:**

```json
{
  "success": true,
  "consent_id": "uuid-consent-123",
  "user_version_updated": true
}
```

### 7.4 Upload New T&C (Web-Admin Only)

**Endpoint:** `POST /functions/v1/terms/upload`

**Payload (multipart/form-data):**
- `file`: HTML file
- `version`: "2.0"
- `language_code`: "en"
- `region_code`: "US"
- `document_type`: "terms"
- `title`: "Terms & Conditions"
- `effective_date`: "2026-02-01T00:00:00Z"
- `distributor_id`: UUID (optional, for regional distributors)
- `session_token`: auth token

**Response:**

```json
{
  "success": true,
  "terms_id": "uuid-new-terms",
  "storage_path": "US/terms-2.0-en.html",
  "public_url": "https://..."
}
```

### 7.5 Get Acceptance History (Web-Admin)

**Endpoint:** `GET /functions/v1/terms/acceptance-history`

**Query Parameters:**
- `region` (required for distributors)
- `version` (optional filter)
- `start_date`, `end_date` (optional)
- `user_id` (optional)
- `limit`, `offset` (pagination)

**Response:**

```json
{
  "total_count": 1234,
  "records": [
    {
      "user_email": "user@example.com",
      "user_name": "John Doe",
      "version": "2.0",
      "language_code": "en",
      "accepted_at": "2026-02-05T10:30:00Z",
      "ip_address": "192.168.1.1",
      "device_info": "Samsung Galaxy S21",
      "time_to_read_seconds": 120,
      "scrolled_to_bottom": true
    }
  ]
}
```

---

## 8. CDN PREPARATION

### 8.1 Current Setup (Supabase Storage)

**URL Format:**
```
https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/US/terms-2.0-en.html
```

**Advantages:**
- Already CDN-backed (Cloudflare or similar)
- Public read access
- Version control via file naming
- Easy to migrate to external CDN later

### 8.2 Future CDN Migration Plan

**Option 1: CloudFront + S3**
```
https://cdn.pure-escooter.com/terms/US/terms-2.0-en.html
```

**Option 2: Cloudflare CDN**
```
https://terms.pure-escooter.com/US/terms-2.0-en.html
```

**Migration Steps:**
1. Export all files from Supabase Storage
2. Upload to CDN bucket/storage
3. Update `public_url` in database
4. Update `catalog.json` with new URLs
5. Android app fetches from new URLs automatically

**App Code (CDN-Agnostic):**
```java
// App always uses URL from database, not hardcoded
String termsUrl = termsMetadata.public_url;
webView.loadUrl(termsUrl);
```

---

## 9. IMPLEMENTATION ROADMAP

### Phase 1: Infrastructure (3 days)

**Day 1: Database Schema**
- [ ] Create `terms_conditions` table migration
- [ ] Create `user_consent` table migration
- [ ] Add language/region columns to `users` table
- [ ] Test migrations on dev database

**Day 2: Storage Bucket Setup**
- [ ] Create `terms-and-conditions` bucket in Supabase
- [ ] Set public read permissions
- [ ] Create folder structure (US/, GB/, EU/, CN/, global/)
- [ ] Upload sample T&C files for testing
- [ ] Create `catalog.json` template

**Day 3: Edge Functions (Backend)**
- [ ] Create `/functions/v1/terms/latest` endpoint
- [ ] Create `/functions/v1/terms/check-acceptance` endpoint
- [ ] Create `/functions/v1/terms/record-consent` endpoint
- [ ] Create `/functions/v1/terms/upload` endpoint (admin only)
- [ ] Create `/functions/v1/terms/acceptance-history` endpoint
- [ ] Test all endpoints with Postman

---

### Phase 2: Android App (4 days)

**Day 4: Version Checking**
- [ ] Create `TermsVersionChecker.java`
- [ ] Implement catalog.json fetching and parsing
- [ ] Implement version comparison logic
- [ ] Add background check with WorkManager
- [ ] Test version detection

**Day 5: Language Resolution**
- [ ] Create `TermsLanguageResolver.java`
- [ ] Implement language detection (device → preference → fallback)
- [ ] Implement region detection (GPS → distributor → IP)
- [ ] Test with different device languages

**Day 6: Acceptance UI**
- [ ] Create `TermsAcceptanceActivity.java`
- [ ] Implement WebView with scroll detection
- [ ] Create scroll-to-accept logic
- [ ] Add accept/decline buttons
- [ ] Implement consent recording API call
- [ ] Test scroll detection accuracy

**Day 7: Integration**
- [ ] Integrate into registration flow
- [ ] Add startup check for new versions
- [ ] Show re-acceptance dialog when needed
- [ ] Test end-to-end flow
- [ ] Handle edge cases (no internet, declined T&C)

---

### Phase 3: Web-Admin (3 days)

**Day 8: T&C Management Page**
- [ ] Create `web-admin/js/pages/terms-management.js`
- [ ] Build upload form (file + metadata)
- [ ] Implement file upload to storage bucket
- [ ] List all T&C versions for distributor's region
- [ ] Show acceptance statistics
- [ ] Test file upload and storage

**Day 9: Acceptance History Page**
- [ ] Create `web-admin/js/pages/consent-history.js`
- [ ] Build table with filters
- [ ] Implement CSV export
- [ ] Add user detail view
- [ ] Test filtering and export

**Day 10: Polish & Testing**
- [ ] Add validation for upload form
- [ ] Improve error messages
- [ ] Test distributor permissions (region-scoped)
- [ ] Test admin permissions (global access)
- [ ] End-to-end testing

---

### Phase 4: Testing & Deployment (2 days)

**Day 11: Integration Testing**
- [ ] Test Android app with real T&C files
- [ ] Test version checking logic
- [ ] Test language fallbacks
- [ ] Test scroll-to-accept on different screen sizes
- [ ] Test consent recording and history

**Day 12: Deployment**
- [ ] Run database migrations on production
- [ ] Create production storage bucket
- [ ] Upload initial T&C files (US-en, GB-en, EU-en)
- [ ] Deploy edge functions
- [ ] Deploy web-admin updates
- [ ] Build and test Android APK
- [ ] Monitor for errors

---

**Total Estimated Time:** 12 days (2.5 weeks)

---

## 10. SUCCESS METRICS

### User Experience:
- ✅ 95%+ users successfully accept T&C on first attempt
- ✅ Average time to read < 3 minutes
- ✅ Scroll detection accuracy > 99%
- ✅ Language fallback works for 100% of users

### Legal Compliance:
- ✅ 100% consent records include all required audit fields
- ✅ Version tracking accurate for all users
- ✅ Re-acceptance rate > 90% within 7 days of new version
- ✅ Distributor access properly scoped to their region

### Technical:
- ✅ T&C loading time < 2 seconds
- ✅ Catalog.json update time < 1 second
- ✅ Storage bucket availability > 99.9%
- ✅ Zero data loss in consent records

---

## 11. QUESTIONS TO RESOLVE

1. **Initial T&C Content:**
   - Who will write the initial T&C content for each region?
   - Do we need legal review before deployment?

2. **Language Priority:**
   - Which languages should be supported at launch?
   - Priority order: US-en, GB-en, EU-en/de/fr/es/it, CN-zh?

3. **Distributor Permissions:**
   - Can distributors edit T&C for their region, or only view?
   - Should there be an approval process for T&C changes?

4. **Re-acceptance Timing:**
   - When new version available, block app immediately or give grace period?
   - Allow users to continue using app for X days before forcing re-acceptance?

5. **Declined T&C:**
   - What happens if user declines during registration? Block registration?
   - What happens if existing user declines new version? Logout and block?

6. **Marketing Consent:**
   - Should this be part of T&C or separate?
   - Optional or required?

---

## 12. NEXT STEPS

Ready to start implementation!

**Option A: Start with Infrastructure**
- Create database migrations
- Set up storage bucket
- Build edge functions

**Option B: Start with Android**
- Build version checking
- Build acceptance UI
- Integrate into registration

**Option C: Start with Web-Admin**
- Build T&C management page
- Build upload functionality
- Test with sample files

**Which would you like to start with?**

