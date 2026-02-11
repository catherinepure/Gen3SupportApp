# Terms & Conditions - Android App Integration Guide

## Overview
The T&C system is ready for Android app integration. When a user opens the app, it checks if they need to accept new Terms & Conditions and saves their acceptance with a full audit trail.

## System Components

### Database Tables

#### 1. `terms_conditions` Table
Stores T&C documents with versioning and region support:
- `id` - UUID primary key
- `version` - Semantic version (e.g., "1.0", "1.1", "2.0")
- `language_code` - ISO 639-1 language code (e.g., "en", "es", "fr")
- `region_code` - ISO 3166-1 country code (e.g., "US", "GB", "AU")
- `state_code` - Optional ISO 3166-2 subdivision (e.g., "CA", "NSW", "QLD")
- `document_type` - Type of document (default: "terms")
- `title` - Document title
- `public_url` - CDN URL to HTML file in Supabase Storage
- `storage_path` - Storage path (e.g., "US/terms-1.0-en.html")
- `effective_date` - When this version becomes active
- `is_active` - Whether this version is currently active
- `file_size_bytes` - File size for tracking
- `created_by` - UUID of user who uploaded it
- `created_at` / `updated_at` - Timestamps

**Key Features:**
- Unique constraint: `(version, language_code, region_code, state_code)`
- Version control enforced - no overwrites allowed
- Fallback logic: state-specific → country-level → English

#### 2. `user_consent` Table
Tracks user acceptance of T&C with full audit trail:
- `id` - UUID primary key
- `user_id` - Reference to users table
- `terms_id` - Reference to terms_conditions table
- `version` - Version accepted (e.g., "1.0")
- `language_code` - Language they accepted
- `region_code` - Region for which they accepted
- `document_type` - Type of document accepted
- `accepted` - Boolean (true = accepted, false = declined)
- `accepted_at` - Timestamp of acceptance
- `ip_address` - User's IP address (for audit)
- `user_agent` - Browser/app user agent
- `device_info` - Device information
- `scrolled_to_bottom` - Boolean (did user scroll to bottom?)
- `time_to_read_seconds` - How long they took to read

**Key Features:**
- Unique constraint: `(user_id, terms_id)` - one acceptance per user per document
- Indexes for fast querying by user, version, region
- Cascade delete if user or terms are deleted

#### 3. `users` Table Updates
Extended with T&C tracking fields:
- `current_terms_version` - Last accepted version (for quick checks)
- `last_terms_check` - When we last checked if they need to accept
- `detected_region` - User's detected country (ISO 3166-1)
- `preferred_language` - User's preferred language (ISO 639-1)

---

## API Endpoints

### Base URL
```
https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms
```

### Authentication
All endpoints require:
```
Headers:
  apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  (anon key)
  Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  (anon key)
  X-Session-Token: <user's session token from login>
```

---

## Android App Flow

### Step 1: Check if User Needs to Accept T&C

**Endpoint:** `GET /check-acceptance`

**Query Parameters:**
- `user_id` - UUID of logged-in user
- `session_token` - User's session token (can be in header or query)

**Example Request:**
```kotlin
val userId = "f0c6a71b-0beb-4c85-bef5-693162972904"
val sessionToken = "user's session token"

val response = httpClient.get("https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/check-acceptance?user_id=$userId") {
    headers {
        append("apikey", SUPABASE_ANON_KEY)
        append("Authorization", "Bearer $SUPABASE_ANON_KEY")
        append("X-Session-Token", sessionToken)
    }
}
```

**Response:**
```json
{
  "needs_acceptance": true,
  "current_version": "1.0",
  "latest_version": "1.1",
  "last_accepted_at": "2026-01-15T10:30:00Z",
  "region": "US",
  "language": "en",
  "terms_url": "https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/US/terms-1.1-en.html",
  "terms_id": "uuid-of-terms-document",
  "terms_title": "Terms & Conditions"
}
```

**Fields:**
- `needs_acceptance` - `true` if user needs to accept new version, `false` if up-to-date
- `current_version` - Version user last accepted (null if never accepted)
- `latest_version` - Latest active version for their region
- `last_accepted_at` - When they last accepted (null if never)
- `region` - User's detected region
- `language` - User's preferred language
- `terms_url` - Public URL to load T&C HTML
- `terms_id` - UUID of the terms document (needed for recording consent)
- `terms_title` - Title of the T&C document

---

### Step 2: Display T&C to User

If `needs_acceptance` is `true`, display the T&C in a WebView or custom dialog:

```kotlin
if (response.needs_acceptance) {
    // Load T&C HTML from response.terms_url
    webView.loadUrl(response.terms_url)

    // Track scroll position to detect if user reached bottom
    webView.setOnScrollChangeListener { v, scrollX, scrollY, oldScrollX, oldScrollY ->
        val bottom = (v.height + scrollY) >= v.contentHeight
        if (bottom) {
            scrolledToBottom = true
            enableAcceptButton()
        }
    }

    // Track time spent reading
    val startTime = System.currentTimeMillis()
}
```

**UI Requirements:**
1. Display T&C HTML content
2. Track if user scrolls to bottom (`scrolled_to_bottom`)
3. Track time spent reading (`time_to_read_seconds`)
4. Show "Accept" and "Decline" buttons
5. Only enable "Accept" button after user scrolls to bottom (recommended)

---

### Step 3: Record User Acceptance

**Endpoint:** `POST /record-consent`

**Request Body:**
```json
{
  "session_token": "user's session token",
  "user_id": "f0c6a71b-0beb-4c85-bef5-693162972904",
  "terms_id": "uuid-of-terms-document",
  "version": "1.1",
  "language_code": "en",
  "region_code": "US",
  "document_type": "terms",
  "accepted": true,
  "scrolled_to_bottom": true,
  "time_to_read_seconds": 45,
  "ip_address": "192.168.1.1",
  "user_agent": "Gen3App/1.0 (Android 14)",
  "device_info": "{\"model\":\"Pixel 7\",\"os\":\"Android 14\",\"app_version\":\"1.0.0\"}"
}
```

**Example Request:**
```kotlin
val timeSpent = (System.currentTimeMillis() - startTime) / 1000 // seconds
val deviceInfo = JSONObject().apply {
    put("model", Build.MODEL)
    put("os", "Android ${Build.VERSION.RELEASE}")
    put("app_version", BuildConfig.VERSION_NAME)
}.toString()

val requestBody = JSONObject().apply {
    put("session_token", sessionToken)
    put("user_id", userId)
    put("terms_id", termsId) // Get this from check-acceptance response
    put("version", latestVersion)
    put("language_code", language)
    put("region_code", region)
    put("document_type", "terms")
    put("accepted", true) // or false if user declined
    put("scrolled_to_bottom", scrolledToBottom)
    put("time_to_read_seconds", timeSpent)
    put("ip_address", getUserIpAddress())
    put("user_agent", "Gen3App/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE})")
    put("device_info", deviceInfo)
}

val response = httpClient.post("https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/record-consent") {
    headers {
        append("Content-Type", "application/json")
        append("apikey", SUPABASE_ANON_KEY)
        append("Authorization", "Bearer $SUPABASE_ANON_KEY")
        append("X-Session-Token", sessionToken)
    }
    setBody(requestBody.toString())
}
```

**Response:**
```json
{
  "success": true,
  "consent_id": "uuid-of-consent-record",
  "user_version_updated": true
}
```

**What Happens:**
1. Creates a record in `user_consent` table with full audit trail
2. Updates `users.current_terms_version` to the accepted version
3. Updates `users.last_terms_check` to current timestamp
4. Returns success confirmation

---

## Getting the Terms ID

You need the `terms_id` (UUID) to record consent. The `/check-acceptance` endpoint now returns this automatically, so you don't need a separate call!

### Alternative: From `/latest` Endpoint (if needed)

**Endpoint:** `GET /latest`

**Query Parameters:**
- `region` - Country code (e.g., "US")
- `language` - Language code (e.g., "en")
- `document_type` - Type of document (default: "terms")

**Example:**
```kotlin
val response = httpClient.get("https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/latest?region=US&language=en&document_type=terms") {
    headers {
        append("apikey", SUPABASE_ANON_KEY)
        append("Authorization", "Bearer $SUPABASE_ANON_KEY")
    }
}
```

**Response:**
```json
{
  "id": "uuid-of-terms-document",
  "version": "1.1",
  "language_code": "en",
  "region_code": "US",
  "state_code": null,
  "title": "Terms & Conditions",
  "public_url": "https://...",
  "effective_date": "2026-02-10T00:00:00Z",
  "is_active": true
}
```

**Note:** The `/check-acceptance` endpoint already includes `terms_id` in the response, so in most cases you won't need to call `/latest` separately.

---

## Complete Android Integration Example

```kotlin
class TermsManager(
    private val httpClient: HttpClient,
    private val sessionToken: String,
    private val userId: String
) {

    suspend fun checkAndPromptForTerms(): Boolean {
        // Step 1: Check if user needs to accept
        val checkResponse = checkAcceptance()

        if (!checkResponse.needs_acceptance) {
            Log.d("Terms", "User is up-to-date on T&C")
            return true
        }

        Log.d("Terms", "User needs to accept version ${checkResponse.latest_version}")

        // Step 2: Show T&C dialog to user
        val accepted = showTermsDialog(
            termsUrl = checkResponse.terms_url,
            version = checkResponse.latest_version
        )

        if (!accepted) {
            Log.d("Terms", "User declined T&C")
            return false
        }

        // Step 3: Record acceptance (using terms_id from check response)
        recordConsent(
            termsId = checkResponse.terms_id,
            version = checkResponse.latest_version,
            languageCode = checkResponse.language,
            regionCode = checkResponse.region,
            accepted = true,
            scrolledToBottom = termsDialogMetrics.scrolledToBottom,
            timeToReadSeconds = termsDialogMetrics.timeSpent
        )

        return true
    }

    private suspend fun checkAcceptance(): CheckAcceptanceResponse {
        val response = httpClient.get(
            "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/check-acceptance?user_id=$userId"
        ) {
            headers {
                append("apikey", SUPABASE_ANON_KEY)
                append("Authorization", "Bearer $SUPABASE_ANON_KEY")
                append("X-Session-Token", sessionToken)
            }
        }
        return response.body()
    }

    private suspend fun getLatestTerms(region: String, language: String): TermsDetails {
        val response = httpClient.get(
            "https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/latest?region=$region&language=$language"
        ) {
            headers {
                append("apikey", SUPABASE_ANON_KEY)
                append("Authorization", "Bearer $SUPABASE_ANON_KEY")
            }
        }
        return response.body()
    }

    private suspend fun recordConsent(
        termsId: String,
        version: String,
        languageCode: String,
        regionCode: String,
        accepted: Boolean,
        scrolledToBottom: Boolean,
        timeToReadSeconds: Int
    ) {
        val deviceInfo = JSONObject().apply {
            put("model", Build.MODEL)
            put("manufacturer", Build.MANUFACTURER)
            put("os", "Android ${Build.VERSION.RELEASE}")
            put("sdk", Build.VERSION.SDK_INT)
            put("app_version", BuildConfig.VERSION_NAME)
        }.toString()

        val requestBody = JSONObject().apply {
            put("session_token", sessionToken)
            put("user_id", userId)
            put("terms_id", termsId)
            put("version", version)
            put("language_code", languageCode)
            put("region_code", regionCode)
            put("document_type", "terms")
            put("accepted", accepted)
            put("scrolled_to_bottom", scrolledToBottom)
            put("time_to_read_seconds", timeToReadSeconds)
            put("ip_address", getUserIpAddress())
            put("user_agent", "Gen3App/${BuildConfig.VERSION_NAME} (Android ${Build.VERSION.RELEASE})")
            put("device_info", deviceInfo)
        }.toString()

        httpClient.post("https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/terms/record-consent") {
            headers {
                append("Content-Type", "application/json")
                append("apikey", SUPABASE_ANON_KEY)
                append("Authorization", "Bearer $SUPABASE_ANON_KEY")
                append("X-Session-Token", sessionToken)
            }
            setBody(requestBody)
        }
    }

    private fun getUserIpAddress(): String {
        // Get user's IP address (you might need to call an external service for public IP)
        return "0.0.0.0" // placeholder
    }
}
```

---

## When to Check for T&C

Check at these points in the app lifecycle:

1. **On App Launch** - Check immediately after successful login
2. **After Login** - Every time user logs in
3. **Periodic Checks** - Every 24 hours while app is running (optional)

**Recommendation:** Check on every app launch. If `needs_acceptance` is true, block the user from proceeding until they accept.

```kotlin
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        lifecycleScope.launch {
            val termsManager = TermsManager(httpClient, sessionToken, userId)
            val accepted = termsManager.checkAndPromptForTerms()

            if (!accepted) {
                // User declined T&C - log them out or close app
                showDialog("You must accept Terms & Conditions to use this app")
                finish()
            } else {
                // Continue to main app
                proceedToMainScreen()
            }
        }
    }
}
```

---

## Audit Trail & Legal Compliance

Every acceptance is recorded with:
- ✅ User ID
- ✅ Exact version accepted
- ✅ Timestamp of acceptance
- ✅ IP address
- ✅ Device information
- ✅ User agent
- ✅ Whether they scrolled to bottom
- ✅ How long they took to read
- ✅ Region and language

This provides a **complete legal audit trail** for compliance purposes.

---

## Regional Fallback Logic

The system automatically handles regional fallbacks:

1. **State-specific T&C** (if available):
   - Example: `US/CA/terms-1.0-en.html` for California

2. **Country-level T&C** (if no state-specific):
   - Example: `US/terms-1.0-en.html` for United States

3. **English fallback** (if language not available):
   - Example: `US/terms-1.0-en.html` (even if user prefers Spanish)

This is handled automatically by the `get_latest_terms` database function.

---

## Testing the Integration

### Test Scenarios:

1. **New User (Never Accepted)**
   - `check-acceptance` returns `needs_acceptance: true`, `current_version: null`
   - Show T&C dialog
   - Record acceptance
   - Verify `user_consent` record created

2. **Existing User (Up-to-Date)**
   - `check-acceptance` returns `needs_acceptance: false`
   - Skip T&C dialog
   - Continue to app

3. **Existing User (New Version Available)**
   - `check-acceptance` returns `needs_acceptance: true`, `current_version: "1.0"`, `latest_version: "1.1"`
   - Show T&C dialog with new version
   - Record acceptance of v1.1

4. **User Declines T&C**
   - Record with `accepted: false`
   - Log user out or close app

---

## Admin Management

Admins can:
- Upload new T&C versions via web admin
- View acceptance statistics
- Toggle T&C active/inactive status
- Edit metadata (title, effective date, etc.)
- Copy T&C to multiple regions

All managed through: `https://ives.org.uk/app2026`

---

## Summary

The T&C system is **production-ready** for Android app integration:

✅ Version control with semantic versioning
✅ Multi-region and multi-language support
✅ Full audit trail for legal compliance
✅ Automatic fallback logic
✅ RESTful API endpoints ready to use
✅ Admin web interface for management
✅ Database constraints prevent duplicates
✅ Tracks user engagement (scroll, time to read)

**Next Step:** Implement the Android integration using the code examples above.
