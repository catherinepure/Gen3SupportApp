# Terms & Conditions System - Deployment Checklist

## Pre-Deployment Checklist

### ✅ 1. Code Compilation
- [x] Android app compiles successfully (`./gradlew assembleDebug`)
- [ ] No lint warnings or errors
- [ ] All unit tests pass (if applicable)

### ✅ 2. Database Migration
**File:** `supabase/migrations/20260210120000_terms_and_conditions_system.sql`

**Steps:**
```bash
# Deploy to production
supabase db push

# Verify tables created
supabase db remote ls
```

**Verify:**
- [ ] `terms_conditions` table exists
- [ ] `user_consent` table exists
- [ ] `users` table has new columns: `preferred_language`, `detected_region`, `current_terms_version`, `last_terms_check`
- [ ] Functions exist: `get_latest_terms()`, `check_user_consent()`
- [ ] RLS policies enabled and working

### ✅ 3. Edge Function Deployment
**File:** `supabase/functions/terms/index.ts`

**Steps:**
```bash
# Deploy function
supabase functions deploy terms

# Test endpoints
curl -X GET "https://YOUR_PROJECT.supabase.co/functions/v1/terms/latest?region=US&language=en" \
  -H "apikey: YOUR_ANON_KEY"
```

**Verify:**
- [ ] Function deployed successfully
- [ ] `/latest` endpoint works
- [ ] `/check-acceptance` endpoint works (requires session)
- [ ] `/record-consent` endpoint works (requires session)
- [ ] `/upload` endpoint works (requires admin session)
- [ ] `/acceptance-history` endpoint works (requires admin session)

### 4. Storage Bucket Setup
**Bucket Name:** `terms-and-conditions`

**Steps:**
```bash
# Create bucket via Supabase Dashboard or CLI
# Set bucket to public read

# Upload initial T&C files
# Structure: {region}/terms-{version}-{language}.html
# Examples:
#   US/terms-1.0-en.html
#   GB/terms-1.0-en.html
#   EU/terms-1.0-en.html
```

**Verify:**
- [ ] Bucket `terms-and-conditions` exists
- [ ] Bucket has public read policy
- [ ] Test file upload works
- [ ] Public URL is accessible
- [ ] CDN caching works (if configured)

### 5. Android App Integration
**Files to modify:**

#### AndroidManifest.xml
Add TermsAcceptanceActivity:
```xml
<activity
    android:name=".TermsAcceptanceActivity"
    android:label="Terms & Conditions"
    android:theme="@style/Theme.Gen3FirmwareUpdater" />
```

#### App Startup Flow
Integrate T&C check in `MainActivity.onCreate()` or splash screen:
```java
TermsManager termsManager = ServiceFactory.getTermsManager();
String userId = session.getUserId();
String sessionToken = session.getToken();

if (termsManager.shouldCheckForUpdate()) {
    termsManager.checkAcceptanceStatus(userId, sessionToken, new TermsManager.TermsCallback<ConsentCheckResult>() {
        @Override
        public void onSuccess(ConsentCheckResult result) {
            if (result.needsAcceptance) {
                // Launch TermsAcceptanceActivity
                Intent intent = new Intent(MainActivity.this, TermsAcceptanceActivity.class);
                intent.putExtra(TermsAcceptanceActivity.EXTRA_TERMS_URL, result.termsUrl);
                intent.putExtra(TermsAcceptanceActivity.EXTRA_TERMS_ID, result.termsId);
                intent.putExtra(TermsAcceptanceActivity.EXTRA_VERSION, result.latestVersion);
                intent.putExtra(TermsAcceptanceActivity.EXTRA_LANGUAGE, result.language);
                intent.putExtra(TermsAcceptanceActivity.EXTRA_REGION, result.region);
                startActivityForResult(intent, REQUEST_CODE_TERMS);
            }
        }

        @Override
        public void onError(String error) {
            Log.e(TAG, "T&C check failed: " + error);
        }
    });
}
```

**Verify:**
- [ ] TermsAcceptanceActivity added to AndroidManifest.xml
- [ ] App checks for T&C on startup
- [ ] T&C check respects 24-hour interval
- [ ] Accept button only enabled after scrolling to bottom
- [ ] Consent recorded with full audit trail
- [ ] User can decline (handle accordingly)
- [ ] Back button shows confirmation dialog

### 6. Web-Admin Testing
**Pages to test:**

#### Terms Management (`/index.html#terms-management`)
- [ ] Page loads without errors
- [ ] T&C versions table displays correctly
- [ ] Upload dialog opens
- [ ] File upload works (HTML file → Storage bucket)
- [ ] Metadata created via Edge Function
- [ ] Activate/deactivate toggles work
- [ ] View button opens T&C in new tab
- [ ] Acceptance statistics load correctly
- [ ] Progress bars show accurate percentages

#### Consent History (`/index.html#consent-history`)
- [ ] Page loads without errors
- [ ] Records table displays correctly
- [ ] Filters work (version, email, region, status)
- [ ] CSV export works
- [ ] Device info extracted correctly
- [ ] Time to read displayed correctly
- [ ] Scroll status shows correctly

### 7. Initial T&C Content Creation

#### Create T&C HTML Files
Create HTML files for each region/language combination:
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Terms & Conditions</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; line-height: 1.6; }
        h1 { color: #333; }
        h2 { color: #555; margin-top: 30px; }
        p { margin-bottom: 15px; }
    </style>
</head>
<body>
    <h1>Terms & Conditions</h1>
    <p><strong>Effective Date:</strong> January 1, 2025</p>
    <p><strong>Version:</strong> 1.0</p>

    <h2>1. Acceptance of Terms</h2>
    <p>By using this application, you agree to these terms...</p>

    <!-- Add your full T&C content here -->

    <h2>10. Contact Information</h2>
    <p>For questions about these terms, contact us at legal@example.com</p>
</body>
</html>
```

**Upload via Web-Admin:**
1. Login to web-admin
2. Navigate to Terms Management
3. Click "Upload New Version"
4. Fill in form:
   - Version: 1.0
   - Language: English
   - Region: US (or GB, EU, etc.)
   - Title: Terms & Conditions
   - Effective Date: 2025-01-01
   - HTML File: Upload your HTML file
5. Submit

**Verify:**
- [ ] US English T&C uploaded (version 1.0)
- [ ] GB English T&C uploaded (version 1.0)
- [ ] EU English T&C uploaded (version 1.0)
- [ ] All versions marked as active
- [ ] Public URLs accessible

### 8. Testing Scenarios

#### Scenario 1: New User Registration
1. [ ] New user registers
2. [ ] Region detected (GPS/IP)
3. [ ] T&C check triggered
4. [ ] Latest T&C for region/language displayed
5. [ ] User scrolls to bottom
6. [ ] Accept button enabled
7. [ ] User clicks accept
8. [ ] Consent recorded with audit trail
9. [ ] User proceeds to app

#### Scenario 2: Existing User - New T&C Version
1. [ ] Admin uploads new T&C version (1.1)
2. [ ] Existing user opens app (24 hours since last check)
3. [ ] T&C check triggered
4. [ ] New version detected
5. [ ] User sees new T&C
6. [ ] User accepts
7. [ ] Consent recorded
8. [ ] User proceeds to app

#### Scenario 3: User Declines
1. [ ] User sees T&C
2. [ ] User clicks decline
3. [ ] App handles decline (logout or restricted mode)
4. [ ] Decline recorded in user_consent

#### Scenario 4: Admin Views History
1. [ ] Admin logs into web-admin
2. [ ] Navigates to Consent History
3. [ ] Sees all acceptance records
4. [ ] Filters by version
5. [ ] Exports to CSV
6. [ ] CSV contains full audit trail

### 9. Performance Testing
- [ ] Load test: 1000 concurrent T&C checks
- [ ] Database query performance (should use indexes)
- [ ] Storage bucket download speed
- [ ] Edge Function response time (<500ms)
- [ ] Android app T&C load time (<2s)

### 10. Security Testing
- [ ] RLS policies prevent unauthorized access
- [ ] Session tokens validated correctly
- [ ] Admin endpoints require admin/manager role
- [ ] Managers can only access their region
- [ ] SQL injection attempts blocked
- [ ] XSS attempts blocked (sanitize HTML)
- [ ] CORS configured correctly

### 11. Compliance Verification
#### GDPR
- [ ] User actively consents (scroll + click)
- [ ] Full audit trail recorded
- [ ] Right to view consent history
- [ ] Versioned T&C with acceptance tracking
- [ ] Decline option available

#### CCPA
- [ ] Consent before data collection
- [ ] Regional variations (US-specific)
- [ ] Opt-out mechanism
- [ ] Record of consumer requests

### 12. Monitoring & Logging
- [ ] Set up error monitoring (Sentry, Rollbar)
- [ ] Track acceptance rates by region
- [ ] Monitor Edge Function errors
- [ ] Alert on low acceptance rates
- [ ] Alert on API failures

### 13. Documentation
- [ ] User guide for distributors (uploading T&C)
- [ ] API documentation for developers
- [ ] Compliance documentation (legal)
- [ ] Troubleshooting guide
- [ ] Internationalization guide

---

## Deployment Steps (Production)

### Step 1: Database Migration
```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater/supabase
supabase db push
```

### Step 2: Edge Function Deployment
```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater/supabase
supabase functions deploy terms
```

### Step 3: Storage Bucket Setup
1. Go to Supabase Dashboard → Storage
2. Create bucket: `terms-and-conditions`
3. Set policy: Public read, authenticated write
4. Test upload via web-admin

### Step 4: Initial Content Upload
1. Login to web-admin
2. Navigate to Terms Management
3. Upload T&C files for each region

### Step 5: Android App Update
1. Update `AndroidManifest.xml`
2. Integrate T&C check in `MainActivity`
3. Test locally
4. Build release APK
5. Deploy to Google Play or distribute internally

### Step 6: Web-Admin Update
1. Already deployed (no server-side build needed)
2. Clear browser cache
3. Test new pages load correctly

### Step 7: Smoke Testing
1. Test new user registration flow
2. Test existing user sees new version
3. Test admin can upload new version
4. Test consent history displays correctly

---

## Rollback Plan

If issues arise:

### Database Rollback
```bash
# Revert migration
supabase db reset

# Or manually drop tables
DROP TABLE IF EXISTS user_consent CASCADE;
DROP TABLE IF EXISTS terms_conditions CASCADE;
ALTER TABLE users DROP COLUMN IF EXISTS preferred_language;
ALTER TABLE users DROP COLUMN IF EXISTS detected_region;
ALTER TABLE users DROP COLUMN IF EXISTS current_terms_version;
ALTER TABLE users DROP COLUMN IF EXISTS last_terms_check;
```

### Edge Function Rollback
```bash
# Redeploy previous version or delete
supabase functions delete terms
```

### Android App Rollback
- Revert to previous APK version
- Or disable T&C check with feature flag

---

## Post-Deployment Monitoring (First 48 Hours)

### Metrics to Watch
- [ ] Acceptance rate (should be >95%)
- [ ] Average time to accept (baseline)
- [ ] API error rate (should be <1%)
- [ ] Android app crash rate
- [ ] Web-admin page load errors

### Known Issues & Workarounds
- None yet (document as discovered)

---

## Contact Information

**Technical Lead:** Catherine Ives
**Deployment Date:** TBD
**Version:** 1.0.0

---

## Sign-Off

- [ ] Code reviewed
- [ ] Tests passed
- [ ] Security audit completed
- [ ] Legal approval obtained
- [ ] Deployment plan approved
- [ ] Rollback plan tested

**Approved by:** _______________
**Date:** _______________
