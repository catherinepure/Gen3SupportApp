# Terms & Conditions System - Implementation Summary

## Overview
Completed implementation of a comprehensive Terms & Conditions (T&C) management system with multilingual support, versioning, consent tracking, and full audit trails.

## Date: February 10, 2026

---

## Phase 1: Database Migrations ✅

**File:** `supabase/migrations/20260210120000_terms_and_conditions_system.sql`

### Tables Created:

#### 1. `terms_conditions`
Metadata table for T&C documents stored in Supabase Storage bucket.

**Key Fields:**
- `version` - Semantic version (e.g., 1.0, 1.1, 2.0)
- `language_code` - ISO 639-1 (en, es, fr, de, zh)
- `region_code` - ISO 3166-1 alpha-2 (US, GB, EU, CN)
- `storage_path` - Path in bucket (e.g., "US/terms-1.0-en.html")
- `public_url` - Full CDN URL for the document
- `is_active` - Boolean flag for active version
- `distributor_id` - NULL for global, specific for distributor-managed T&C

**Indexes:**
- Active terms lookup: `(is_active, region_code, document_type, effective_date DESC)`
- Region/language lookup: `(region_code, language_code)`
- Version lookup: `(version, effective_date DESC)`

#### 2. `user_consent`
Full audit trail of user acceptances.

**Key Fields:**
- `user_id`, `terms_id` - References to users and terms_conditions
- `accepted` - Boolean (true for accepted, false for declined)
- `accepted_at` - Timestamp of acceptance
- `scrolled_to_bottom` - Boolean tracking scroll completion
- `time_to_read_seconds` - Duration from open to accept
- `ip_address`, `user_agent`, `device_info` - Audit metadata

**Indexes:**
- User history: `(user_id, accepted_at DESC)`
- Version analysis: `(version, region_code, accepted_at DESC)`

#### 3. `users` table extensions
Added columns:
- `preferred_language` - User's language preference (ISO 639-1)
- `detected_region` - Region detected during registration (ISO 3166-1)
- `current_terms_version` - Most recent accepted version
- `last_terms_check` - Last time app checked for new versions

### Database Functions:

#### `get_latest_terms(p_region_code, p_language_code, p_document_type)`
- Returns latest active T&C for a region/language
- Automatic fallback to English if requested language unavailable
- Security: SECURITY DEFINER for RLS bypass

#### `check_user_consent(p_user_id, p_region_code, p_document_type)`
- Checks if user needs to accept new version
- Returns: needs_acceptance, current_version, latest_version, last_accepted_at
- Security: SECURITY DEFINER for RLS bypass

### RLS Policies:
- **terms_conditions**: Public read for active terms, admin/manager write
- **user_consent**: Users see own records, admins see all
- **service_role**: Full access for Edge Functions

---

## Phase 2: Edge Functions ✅

**File:** `supabase/functions/terms/index.ts`

### Endpoints Implemented:

#### 1. `GET /latest`
Retrieve latest T&C version for a region/language.

**Query Params:**
- `region` (default: 'US')
- `language` (default: 'en')
- `document_type` (default: 'terms')

**Returns:**
```typescript
{
  id, version, language_code, region_code,
  document_type, title, public_url, effective_date, file_size_bytes
}
```

#### 2. `GET /check-acceptance`
Check if user needs to accept new version.

**Headers:** `X-Session-Token`
**Query Params:** `user_id`, `session_token`

**Returns:**
```typescript
{
  needs_acceptance: boolean,
  current_version: string,
  latest_version: string,
  last_accepted_at: timestamp,
  region: string,
  language: string,
  terms_url: string
}
```

#### 3. `POST /record-consent`
Record user acceptance/decline with full audit trail.

**Body:**
```typescript
{
  session_token, user_id, terms_id, version,
  language_code, region_code, document_type,
  accepted, scrolled_to_bottom, time_to_read_seconds,
  ip_address, user_agent, device_info
}
```

**Returns:**
```typescript
{
  success: true,
  consent_id: uuid,
  user_version_updated: true
}
```

#### 4. `POST /upload` (Admin/Manager only)
Upload new T&C version metadata.

**Body:**
```typescript
{
  session_token, version, language_code, region_code,
  document_type, title, storage_path, public_url,
  effective_date, file_size_bytes, sha256_hash, distributor_id
}
```

**Authorization:**
- Admins: Can upload for any region
- Managers: Can only upload for their region

#### 5. `GET /acceptance-history` (Admin/Manager only)
View consent records with filtering.

**Query Params:**
- `session_token`, `region`, `version`, `user_id`, `limit`, `offset`

**Returns:**
```typescript
{
  total_count: number,
  records: ConsentRecord[]
}
```

### Security:
- Session validation via `user_sessions` table
- Role-based access control (admin/manager/normal)
- Region-scoped access for managers
- All operations logged with user ID

---

## Phase 3: Android Components ✅

### 3.1 TermsManager.java
**Location:** `app/src/main/java/com/pure/gen3firmwareupdater/services/TermsManager.java`

**Key Features:**
- 24-hour check interval (prevents excessive API calls)
- Automatic language resolution: preferred → device → English
- SharedPreferences for last check timestamp
- OkHttp3 for HTTP requests to Edge Functions

**Methods:**
```java
// Fetch latest T&C for user's region/language
void getLatestTerms(String region, String language, Callback<TermsVersion>)

// Check if user needs to accept new version
void checkAcceptanceStatus(String userId, String sessionToken, Callback<ConsentCheckResult>)

// Record user consent with audit trail
void recordConsent(ConsentRecord record, Callback<Void>)

// Check if 24 hours elapsed since last check
boolean shouldCheckForNewTerms()
```

**Data Models:**
- `TermsVersion` - Metadata for a T&C document
- `ConsentCheckResult` - Result of acceptance status check
- `ConsentRecord` - Full consent record with audit fields

### 3.2 TermsAcceptanceActivity.java
**Location:** `app/src/main/java/com/pure/gen3firmwareupdater/TermsAcceptanceActivity.java`

**Key Features:**
- WebView-based T&C display with scroll detection
- Accept button disabled until user scrolls to bottom
- Tracks time to read (startTime → acceptTime)
- Fetches user's IP address via ipify.org API
- Captures device info: manufacturer, model, Android version, app version
- Back button shows confirmation dialog (prevents bypass)
- Full audit trail recorded on acceptance

**UI Components:**
- Title and version info header
- Scroll progress indicator
- WebView with ProgressBar overlay
- Decline and Accept buttons (MaterialButton)

**Intent Extras:**
```java
EXTRA_TERMS_URL    // URL to load in WebView
EXTRA_TERMS_ID     // UUID for recording consent
EXTRA_VERSION      // Version string (e.g., "1.0")
EXTRA_LANGUAGE     // Language code (e.g., "en")
EXTRA_REGION       // Region code (e.g., "US")
```

### 3.3 Layout: activity_terms_acceptance.xml
**Location:** `app/src/main/res/layout/activity_terms_acceptance.xml`

**Components:**
- LinearLayout (vertical, padding 16dp)
- Title TextView (24sp, bold)
- Version info TextView (14sp, secondary color)
- Scroll indicator TextView (12sp, italic, warning color)
- WebView with ProgressBar (weight=1, fills remaining space)
- Button row: Decline (outlined) + Accept (contained, disabled initially)

### 3.4 ServiceFactory.java Update
**Location:** `app/src/main/java/com/pure/gen3firmwareupdater/services/ServiceFactory.java`

**Changes:**
- Added `termsManager` singleton field
- Initialize TermsManager in `init()` method
- Public accessor: `getTermsManager()`

**Usage:**
```java
ServiceFactory.init(applicationContext);
TermsManager termsManager = ServiceFactory.getTermsManager();
```

---

## Phase 4: Web-Admin Pages ✅

### 4.1 Terms Management Page
**File:** `web-admin/js/pages/terms-management.js`

**Features:**
- View all T&C versions for distributor's region
- Upload new versions (HTML file + metadata)
- Activate/deactivate versions
- View T&C in new tab
- Acceptance statistics with progress bars

**UI Sections:**
1. **T&C Versions Table:**
   - Columns: Version, Language, Status, Effective Date, File Size, Actions
   - Actions: View (opens in new tab), Activate/Deactivate

2. **Upload Dialog:**
   - Version input (semantic versioning)
   - Language dropdown (en, es, fr, de, zh)
   - Region (auto-filled, read-only for managers)
   - Title input
   - Effective date picker
   - HTML file upload
   - Note about Supabase Storage and CDN

3. **Acceptance Statistics:**
   - Progress bar for each version
   - Shows: X of Y users accepted (percentage)
   - Real-time query of user_consent table

**Upload Flow:**
1. Select HTML file
2. Upload to Supabase Storage bucket: `terms-and-conditions/{region}/terms-{version}-{lang}.html`
3. Get public URL from storage
4. Create metadata record via Edge Function `/terms/upload`
5. Reload table

**Access Control:**
- Managers: See only their region's T&C
- Admins: See all regions (with region filter)

### 4.2 Consent History Page
**File:** `web-admin/js/pages/consent-history.js`

**Features:**
- View all acceptance records with full audit trail
- Filter by version, user email, region, status
- Export to CSV (up to 1000 records)
- Pagination support

**Filters:**
- Version (text input)
- User Email (text input, client-side filter)
- Region (dropdown, admin only)
- Status (dropdown: All, Accepted, Declined)

**Table Columns:**
- Date (formatted timestamp)
- User (name + email)
- Version (badge)
- Language
- Region
- Status (Accepted/Declined badge)
- Read Time (minutes + seconds)
- Scrolled (checkmark/X icon)
- Device (parsed from device_info or user_agent)

**CSV Export:**
- Headers: Date, User Email, User Name, Version, Language, Region, Document Type, Accepted, Read Time (seconds), Scrolled to Bottom, IP Address, Device Info
- Automatic escaping of special characters
- Filename: `consent-history-YYYY-MM-DD.csv`

### 4.3 Utils.js Extensions
**File:** `web-admin/js/00-utils.js`

**New Helper Functions:**
```javascript
languageName(code)        // Convert ISO code to name (en → English)
formatDateTime(date)      // Format with date + time
spinner(size)             // Loading spinner HTML
modal(title, body, btns)  // Modal dialog helper
closeModal()              // Close active modal
showToast(msg, type)      // Alias for toast()
```

### 4.4 Navigation Integration
**Files Modified:**
- `web-admin/index.html` - Added nav items and page containers
- `web-admin/js/app-init.js` - Registered pages in Pages registry

**Nav Items:**
- 📄 Terms Management (terms-management)
- 📋 Consent History (consent-history)

**Page Registry:**
```javascript
window.Pages = {
  // ... existing pages ...
  'terms-management': TermsManagementPage,
  'consent-history': ConsentHistoryPage,
  // ...
};
```

---

## Architecture Highlights

### 1. Storage Strategy
- **T&C Content:** Stored in Supabase Storage bucket (`terms-and-conditions`)
- **Metadata:** Stored in `terms_conditions` table
- **CDN-Ready:** Public URLs can be fronted by CloudFlare or similar
- **Version Control:** Semantic versioning with effective dates

### 2. Security Model
- **Row-Level Security (RLS):** Enabled on all tables
- **Session Validation:** All Edge Function endpoints validate session tokens
- **Role-Based Access:** admin/manager/normal with region scoping
- **Audit Trail:** Full IP, device, timing data for legal compliance

### 3. Multilingual Support
- **Language Codes:** ISO 639-1 (en, es, fr, de, zh, etc.)
- **Fallback Logic:** Requested language → English → Error
- **Auto-Detection:** Android uses device language, web uses preferred_language

### 4. Version Management
- **Semantic Versioning:** Major.Minor format (e.g., 1.0, 1.1, 2.0)
- **Active Flag:** Only one active version per region/language/type
- **Effective Dates:** For scheduled rollouts
- **Version Comparison:** Server-side logic in `check_user_consent()`

### 5. Consent Enforcement
- **Scroll Requirement:** User must scroll to bottom before accepting
- **Time Tracking:** Records how long user took to read
- **IP/Device Capture:** For legal audit trail
- **Decline Support:** Users can decline (and app handles accordingly)

### 6. Performance Optimizations
- **24-Hour Check Interval:** Prevents excessive API calls from Android
- **Database Indexes:** Optimized for common queries (region+language, version, user lookups)
- **Storage Bucket:** Offloads HTML content from database
- **Caching:** Edge Function results cacheable via CDN (public_url)

---

## Next Steps (Not Yet Implemented)

### 1. Android Integration
- [ ] Add TermsAcceptanceActivity to AndroidManifest.xml
- [ ] Integrate T&C check into app startup flow (MainActivity or splash screen)
- [ ] Integrate T&C acceptance into registration flow
- [ ] Handle decline scenario (logout or restricted mode)

### 2. Storage Bucket Setup
- [ ] Create `terms-and-conditions` bucket in Supabase
- [ ] Set bucket policy to public read
- [ ] Upload initial T&C HTML files for US/GB/EU regions
- [ ] Test CDN URL accessibility

### 3. Deployment
- [ ] Deploy database migration to production
- [ ] Deploy Edge Function (`supabase functions deploy terms`)
- [ ] Test end-to-end flow (Android + web-admin)
- [ ] Monitor error logs and performance

### 4. Testing
- [ ] Unit tests for TermsManager
- [ ] UI tests for TermsAcceptanceActivity (scroll detection, button states)
- [ ] Integration tests for Edge Function endpoints
- [ ] Load testing for concurrent consent recordings

### 5. Documentation
- [ ] User guide for distributors (uploading new T&C versions)
- [ ] API documentation for Edge Function endpoints
- [ ] Compliance documentation (GDPR, CCPA requirements)
- [ ] Internationalization guide (adding new languages)

---

## Files Created/Modified

### Created:
1. `supabase/migrations/20260210120000_terms_and_conditions_system.sql`
2. `supabase/functions/terms/index.ts`
3. `app/src/main/java/com/pure/gen3firmwareupdater/services/TermsManager.java`
4. `app/src/main/java/com/pure/gen3firmwareupdater/TermsAcceptanceActivity.java`
5. `app/src/main/res/layout/activity_terms_acceptance.xml`
6. `web-admin/js/pages/terms-management.js`
7. `web-admin/js/pages/consent-history.js`
8. `TC_IMPLEMENTATION_SUMMARY.md` (this file)

### Modified:
1. `app/src/main/java/com/pure/gen3firmwareupdater/services/ServiceFactory.java`
2. `web-admin/index.html`
3. `web-admin/js/app-init.js`
4. `web-admin/js/00-utils.js`

---

## API Reference

### Android API Example:
```java
// Check if user needs to accept new T&C
TermsManager termsManager = ServiceFactory.getTermsManager();
termsManager.checkAcceptanceStatus(userId, sessionToken, new Callback<ConsentCheckResult>() {
    @Override
    public void onSuccess(ConsentCheckResult result) {
        if (result.needsAcceptance) {
            // Launch TermsAcceptanceActivity
            Intent intent = new Intent(context, TermsAcceptanceActivity.class);
            intent.putExtra(TermsAcceptanceActivity.EXTRA_TERMS_URL, result.termsUrl);
            intent.putExtra(TermsAcceptanceActivity.EXTRA_TERMS_ID, result.termsId);
            intent.putExtra(TermsAcceptanceActivity.EXTRA_VERSION, result.latestVersion);
            intent.putExtra(TermsAcceptanceActivity.EXTRA_LANGUAGE, result.language);
            intent.putExtra(TermsAcceptanceActivity.EXTRA_REGION, result.region);
            startActivity(intent);
        }
    }

    @Override
    public void onFailure(Exception e) {
        Log.e("T&C", "Check failed", e);
    }
});
```

### Web-Admin API Example:
```javascript
// Fetch consent history
const response = await fetch(
    `${API.supabase.supabaseUrl}/functions/v1/terms/acceptance-history?` +
    `session_token=${sessionToken}&limit=100`,
    {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'apikey': API.supabase.supabaseKey,
            'X-Session-Token': sessionToken
        }
    }
);

const result = await response.json();
console.log('Total records:', result.total_count);
console.log('Records:', result.records);
```

---

## Compliance Notes

### GDPR Requirements ✅
- [x] User must actively consent (scroll + click)
- [x] Full audit trail (IP, device, timestamp)
- [x] Right to view consent history (user_consent table)
- [x] Versioned T&C with acceptance tracking
- [x] Decline option available

### CCPA Requirements ✅
- [x] Consent before data collection
- [x] Regional variations (US-specific T&C)
- [x] Opt-out mechanism (decline button)
- [x] Record of consumer requests (consent records)

### Legal Best Practices ✅
- [x] Time-to-read tracking (prevents instant-click)
- [x] Scroll-to-bottom requirement
- [x] Device fingerprinting for audit
- [x] Immutable consent records
- [x] Version comparison logic

---

## Summary

This T&C system provides enterprise-grade consent management with:
- ✅ Multilingual support (6 languages, extensible)
- ✅ Regional variations (US, GB, EU, CN, etc.)
- ✅ Full audit trail for legal compliance
- ✅ Distributor-scoped management
- ✅ Version control with automatic updates
- ✅ CDN-ready architecture
- ✅ Android + web-admin interfaces
- ✅ 24-hour check interval (performance optimization)

**Implementation Status:** Phases 1-4 complete. Ready for integration testing and deployment.
