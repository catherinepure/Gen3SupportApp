# Unified Registration System - Redesign Specification
**Date:** 2026-02-10
**Objective:** Create a single, streamlined registration path for all users

---

## Executive Summary

**Current Problem:**
- Separate user/distributor registration paths (confusing)
- No location capture during registration
- No T&C acceptance flow
- PIN management exists in database but not in registration flow
- No multilingual support

**New Vision:**
Single unified registration flow where:
1. All users register the same way (no separate paths)
2. Users scan scooters → auto-register if not in DB → become owner
3. Set PIN during registration (optional but recommended)
4. Accept T&Cs (multilingual, regional variations)
5. Capture accurate location (GPS + network + IP + reverse geocoding)
6. Roles assigned by administrators post-registration (not during registration)

---

## 1. NEW UNIFIED REGISTRATION FLOW

### User Experience:

```
1. Welcome Screen
   ↓
2. Email & Password
   ↓
3. Profile Information
   ↓
4. Location Permission Request
   ↓
5. Location Capture (GPS + Network + IP)
   ↓
6. Connect to Scooter (BLE Scan)
   ↓
7. Scooter Connected → Read Telemetry
   ↓
8. Set PIN for Scooter (Optional)
   ↓
9. Terms & Conditions Acceptance
   ↓
10. Review & Submit
   ↓
11. Email Verification Sent
   ↓
12. User Checks Email → Clicks Link
   ↓
13. Account Verified → Can Login
```

### Key Changes from Current:
- ❌ No more "Register as User" vs "Register as Distributor" choice
- ✅ Single registration path for everyone
- ✅ Location captured automatically with multiple fallbacks
- ✅ PIN setup integrated into registration
- ✅ T&C acceptance required before submit
- ✅ Roles assigned after registration by admin (not during)

---

## 2. DATABASE SCHEMA CHANGES

### 2.1 Add Location Tracking

```sql
-- Add to user_scooters table (registration location)
ALTER TABLE user_scooters
ADD COLUMN registration_latitude DECIMAL(10, 8),
ADD COLUMN registration_longitude DECIMAL(11, 8),
ADD COLUMN registration_accuracy_meters DECIMAL(8, 2),
ADD COLUMN registration_location_method TEXT, -- 'gps', 'network', 'ip', 'manual'
ADD COLUMN registration_country TEXT,
ADD COLUMN registration_region TEXT,
ADD COLUMN registration_city TEXT,
ADD COLUMN registration_ip_address INET;

CREATE INDEX idx_user_scooters_registration_location
ON user_scooters(registration_latitude, registration_longitude);

COMMENT ON COLUMN user_scooters.registration_location_method IS
'Method used to determine location: gps, network, ip, manual';
```

### 2.2 Add Terms & Conditions Tables

```sql
-- Terms & Conditions versions
CREATE TABLE terms_conditions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version TEXT NOT NULL,  -- e.g., "1.0", "1.1", "2.0"
  language_code TEXT NOT NULL,  -- ISO 639-1: 'en', 'es', 'fr', 'de', 'zh', etc.
  region_code TEXT,  -- ISO 3166-1: 'US', 'GB', 'EU', 'CN', etc.
  title TEXT NOT NULL,
  content TEXT NOT NULL,  -- HTML or Markdown
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(version, language_code, region_code)
);

CREATE INDEX idx_terms_active ON terms_conditions(is_active, effective_date DESC);
CREATE INDEX idx_terms_language ON terms_conditions(language_code, region_code);

-- User consent tracking
CREATE TABLE user_consent (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy', 'marketing', 'data_processing')),
  language_code TEXT NOT NULL,
  region_code TEXT,
  accepted BOOLEAN NOT NULL DEFAULT true,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address INET,
  user_agent TEXT,
  device_info TEXT,
  UNIQUE(user_id, terms_version, consent_type)
);

CREATE INDEX idx_user_consent_user ON user_consent(user_id);
CREATE INDEX idx_user_consent_version ON user_consent(terms_version);
CREATE INDEX idx_user_consent_type ON user_consent(consent_type, accepted);

COMMENT ON TABLE user_consent IS
'Tracks user acceptance of terms, privacy policies, and other legal agreements';

-- Privacy Policy (separate from T&C)
CREATE TABLE privacy_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version TEXT NOT NULL,
  language_code TEXT NOT NULL,
  region_code TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(version, language_code, region_code)
);

CREATE INDEX idx_privacy_active ON privacy_policies(is_active, effective_date DESC);
```

### 2.3 Add User Language Preference

```sql
ALTER TABLE users
ADD COLUMN preferred_language TEXT DEFAULT 'en',
ADD COLUMN detected_country TEXT,
ADD COLUMN detected_region TEXT;

CREATE INDEX idx_users_language ON users(preferred_language);
CREATE INDEX idx_users_country ON users(detected_country);

COMMENT ON COLUMN users.preferred_language IS
'User''s preferred language for UI and communications (ISO 639-1 code)';
```

---

## 3. LOCATION CAPTURE SYSTEM

### 3.1 Multi-Method Location Detection

**Strategy:** Use multiple methods in parallel, prioritize by accuracy

```
Priority 1: GPS (Fused Location Provider)
  ↓ (if unavailable or low accuracy)
Priority 2: Network Location (Cell towers + WiFi)
  ↓ (if unavailable)
Priority 3: IP-based Geolocation (MaxMind or similar)
  ↓ (if all fail)
Priority 4: Manual Entry (Country/Region dropdown)
```

### 3.2 Android Implementation

**New Class:** `LocationCaptureManager.java`

```java
public class LocationCaptureManager {
    private FusedLocationProviderClient fusedLocationClient;
    private Context context;

    public interface LocationCallback {
        void onLocationCaptured(LocationResult result);
        void onLocationError(String error);
    }

    public static class LocationResult {
        public double latitude;
        public double longitude;
        public float accuracy; // meters
        public String method; // "gps", "network", "ip", "manual"
        public long timestamp;
        public String country;
        public String region;
        public String city;
        public String ipAddress;
    }

    // Capture location using all available methods
    public void captureLocation(LocationCallback callback) {
        // 1. Try GPS first (most accurate)
        requestGPSLocation(callback);

        // 2. Fallback to network location
        // 3. Fallback to IP geolocation
        // 4. Manual entry as last resort
    }

    // Reverse geocoding to get address from coordinates
    private void reverseGeocode(double lat, double lng, LocationResult result) {
        Geocoder geocoder = new Geocoder(context, Locale.getDefault());
        try {
            List<Address> addresses = geocoder.getFromLocation(lat, lng, 1);
            if (!addresses.isEmpty()) {
                Address addr = addresses.get(0);
                result.country = addr.getCountryCode();
                result.region = addr.getAdminArea();
                result.city = addr.getLocality();
            }
        } catch (IOException e) {
            Log.e(TAG, "Reverse geocoding failed", e);
        }
    }
}
```

**Permissions Required:**

```xml
<!-- AndroidManifest.xml -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.INTERNET" />
```

**Runtime Permission Request:**

```java
// In RegisterUserActivity.java
private void requestLocationPermission() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            != PackageManager.PERMISSION_GRANTED) {

        ActivityCompat.requestPermissions(this,
                new String[]{Manifest.permission.ACCESS_FINE_LOCATION},
                LOCATION_PERMISSION_REQUEST_CODE);
    } else {
        captureLocation();
    }
}

@Override
public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode == LOCATION_PERMISSION_REQUEST_CODE) {
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            captureLocation();
        } else {
            // Permission denied - fallback to IP or manual
            showLocationPermissionRationale();
        }
    }
}
```

---

## 4. TERMS & CONDITIONS SYSTEM

### 4.1 T&C Management Service

**New Class:** `TermsAndConditionsManager.java`

```java
public class TermsAndConditionsManager {

    public interface TermsCallback {
        void onTermsLoaded(Terms terms);
        void onError(String error);
    }

    public static class Terms {
        public String version;
        public String languageCode;
        public String regionCode;
        public String title;
        public String content; // HTML or Markdown
        public long effectiveDate;
    }

    // Fetch latest T&C for user's language and region
    public void getLatestTerms(String languageCode, String regionCode, TermsCallback callback) {
        // Call edge function: /functions/v1/terms
        // GET /terms?language=en&region=US
    }

    // Record user consent
    public void recordConsent(String userId, String termsVersion, String consentType,
                             String languageCode, String regionCode,
                             String ipAddress, String userAgent, ConsentCallback callback) {
        // Call edge function: POST /functions/v1/consent
    }

    // Check if user has accepted current T&C version
    public void checkConsent(String userId, ConsentCheckCallback callback) {
        // Returns: { has_accepted: true/false, version: "1.0", requires_reaccept: false }
    }
}
```

### 4.2 T&C Acceptance Screen

**New Activity:** `TermsAcceptanceActivity.java`

**Layout:** `activity_terms_acceptance.xml`

```xml
<ScrollView>
    <LinearLayout orientation="vertical">

        <!-- Header -->
        <TextView
            text="Terms & Conditions"
            textSize="24sp"
            textStyle="bold" />

        <!-- Language Selector -->
        <Spinner id="@+id/spinnerLanguage"
            entries="@array/languages" />

        <!-- T&C Content (WebView or TextView) -->
        <WebView id="@+id/webviewTerms"
            layout_height="400dp" />

        <!-- Acceptance Checkbox -->
        <CheckBox id="@+id/cbAcceptTerms"
            text="I have read and agree to the Terms & Conditions" />

        <!-- Privacy Policy Checkbox -->
        <CheckBox id="@+id/cbAcceptPrivacy"
            text="I have read and agree to the Privacy Policy" />

        <!-- Optional: Marketing Consent -->
        <CheckBox id="@+id/cbMarketingConsent"
            text="I agree to receive promotional emails (optional)" />

        <!-- Continue Button (disabled until checkboxes checked) -->
        <Button id="@+id/btnContinue"
            text="Continue"
            enabled="false" />

    </LinearLayout>
</ScrollView>
```

**Logic:**

```java
cbAcceptTerms.setOnCheckedChangeListener((buttonView, isChecked) -> {
    updateContinueButton();
});

cbAcceptPrivacy.setOnCheckedChangeListener((buttonView, isChecked) -> {
    updateContinueButton();
});

private void updateContinueButton() {
    boolean termsAccepted = cbAcceptTerms.isChecked();
    boolean privacyAccepted = cbAcceptPrivacy.isChecked();
    btnContinue.setEnabled(termsAccepted && privacyAccepted);
}

private void recordConsent() {
    String termsVersion = currentTerms.version;
    String languageCode = selectedLanguage;
    String regionCode = detectedRegion;
    String ipAddress = getIPAddress();
    String userAgent = System.getProperty("http.agent");

    // Record terms acceptance
    termsManager.recordConsent(userId, termsVersion, "terms",
        languageCode, regionCode, ipAddress, userAgent, callback);

    // Record privacy acceptance
    termsManager.recordConsent(userId, termsVersion, "privacy",
        languageCode, regionCode, ipAddress, userAgent, callback);

    // Optional: Marketing consent
    if (cbMarketingConsent.isChecked()) {
        termsManager.recordConsent(userId, termsVersion, "marketing",
            languageCode, regionCode, ipAddress, userAgent, callback);
    }
}
```

---

## 5. PIN SETUP INTEGRATION

### 5.1 PIN Entry Dialog

**New Class:** `PINSetupDialog.java`

```java
public class PINSetupDialog extends DialogFragment {

    public interface PINSetupListener {
        void onPINSet(String pin);
        void onSkipped();
    }

    @Override
    public Dialog onCreateDialog(Bundle savedInstanceState) {
        AlertDialog.Builder builder = new AlertDialog.Builder(getActivity());

        View view = getLayoutInflater().inflate(R.layout.dialog_pin_setup, null);

        EditText etPIN = view.findViewById(R.id.etPIN);
        EditText etPINConfirm = view.findViewById(R.id.etPINConfirm);
        TextView tvPINStrength = view.findViewById(R.id.tvPINStrength);

        etPIN.addTextChangedListener(new TextWatcher() {
            @Override
            public void onTextChanged(CharSequence s, int start, int before, int count) {
                validatePIN(s.toString(), tvPINStrength);
            }
        });

        builder.setView(view)
            .setTitle("Set Scooter PIN")
            .setMessage("Set a 6-digit PIN to lock/unlock your scooter")
            .setPositiveButton("Set PIN", (dialog, which) -> {
                String pin = etPIN.getText().toString();
                String confirm = etPINConfirm.getText().toString();

                if (validateAndConfirm(pin, confirm)) {
                    listener.onPINSet(pin);
                }
            })
            .setNegativeButton("Skip", (dialog, which) -> {
                listener.onSkipped();
            });

        return builder.create();
    }

    private void validatePIN(String pin, TextView strengthView) {
        if (pin.length() < 6) {
            strengthView.setText("PIN must be 6 digits");
            strengthView.setTextColor(Color.RED);
        } else if (pin.equals("000000") || pin.equals("123456") || pin.equals("111111")) {
            strengthView.setText("Weak PIN - Try a different pattern");
            strengthView.setTextColor(Color.ORANGE);
        } else {
            strengthView.setText("Good PIN");
            strengthView.setTextColor(Color.GREEN);
        }
    }

    private boolean validateAndConfirm(String pin, String confirm) {
        if (!pin.matches("\\d{6}")) {
            Toast.makeText(getContext(), "PIN must be 6 digits", Toast.LENGTH_SHORT).show();
            return false;
        }

        if (!pin.equals(confirm)) {
            Toast.makeText(getContext(), "PINs do not match", Toast.LENGTH_SHORT).show();
            return false;
        }

        return true;
    }
}
```

### 5.2 PIN Storage via Edge Function

**API Call:**

```java
// In RegisterUserActivity after scooter connected
private void setPINForScooter(String scooterId, String pin) {
    // Call edge function: POST /functions/v1/admin
    JsonObject payload = new JsonObject();
    payload.addProperty("session_token", sessionToken);
    payload.addProperty("resource", "scooter-pins");
    payload.addProperty("action", "set-pin");
    payload.addProperty("scooter_id", scooterId);
    payload.addProperty("pin", pin);

    // Make HTTP request to edge function
    // Edge function will encrypt and store PIN
}
```

---

## 6. MULTILINGUAL SUPPORT

### 6.1 Language Detection

**Strategy:**

```java
// Detect device language
String deviceLanguage = Locale.getDefault().getLanguage(); // "en", "es", etc.

// Detect region from location
String detectedRegion = locationResult.country; // "US", "GB", "ES", etc.

// Combine for regional variations
String languageRegion = deviceLanguage + "_" + detectedRegion; // "en_US", "es_MX"
```

### 6.2 Supported Languages (Initial)

```
Priority 1 (Launch):
- English (en)
- Spanish (es)
- French (fr)
- German (de)
- Chinese Simplified (zh)

Priority 2 (Post-Launch):
- Portuguese (pt)
- Italian (it)
- Japanese (ja)
- Korean (ko)
- Dutch (nl)
```

### 6.3 T&C Translation Workflow

1. **Admin creates T&C in English** (base version)
2. **Translations added via web-admin** for each language/region
3. **Edge function returns appropriate T&C** based on user's language preference
4. **Fallback to English** if translation not available

### 6.4 Android Strings Localization

```
/res/values/strings.xml (English - default)
/res/values-es/strings.xml (Spanish)
/res/values-fr/strings.xml (French)
/res/values-de/strings.xml (German)
/res/values-zh/strings.xml (Chinese)
```

**Example:**

```xml
<!-- values/strings.xml -->
<string name="registration_title">Create Your Account</string>
<string name="accept_terms">I accept the Terms & Conditions</string>
<string name="set_pin_title">Set Scooter PIN</string>

<!-- values-es/strings.xml -->
<string name="registration_title">Crear Tu Cuenta</string>
<string name="accept_terms">Acepto los Términos y Condiciones</string>
<string name="set_pin_title">Establecer PIN del Scooter</string>
```

---

## 7. UPDATED REGISTRATION FLOW (DETAILED)

### Step-by-Step Implementation:

#### Step 1: Welcome & Language Selection
**Screen:** `RegistrationChoiceActivity.java` (modified)

```
[Logo]

Welcome to Pure eScooter!

Select your language:
[Dropdown: English, Spanish, French, German, Chinese]

[Continue Button]
```

#### Step 2: Email & Password
**Screen:** `RegisterUserActivity.java` (updated)

```
Create Your Account

Email: [____________]
Password: [____________]
Confirm Password: [____________]

[Next Button]
```

#### Step 3: Profile Information
**Screen:** Continue in `RegisterUserActivity.java`

```
Tell Us About You

First Name: [____________]
Last Name: [____________]

Age Range: [Dropdown: <18, 18-24, 25-34, ...]
Gender: [Dropdown: Male, Female, Other, Prefer not to say]
Scooter Use: [Dropdown: Business, Pleasure, Both]

[Next Button]
```

#### Step 4: Location Permission
**Screen:** System permission dialog

```
[System Dialog]
Pure eScooter needs your location to:
- Register your scooter in your region
- Show regional terms & conditions
- Provide local support

[Allow] [Don't Allow]
```

#### Step 5: Location Capture (Background)
**Screen:** Progress indicator

```
Detecting your location...
[Progress Spinner]

Detected: San Francisco, CA, USA
```

#### Step 6: Connect to Scooter
**Screen:** BLE Scan

```
Connect Your Scooter

Turn on Bluetooth and stand near your scooter.

[Scan for Scooters Button]

Nearby Scooters:
- ZYD-123456
- ZYD-789012

[Select scooter]
```

#### Step 7: Scooter Connected
**Screen:** Telemetry Display

```
Scooter Connected!

Serial: ZYD-123456
Model: Gen3 Pro
Battery: 85%
Range: 35 km

[Continue Button]
```

#### Step 8: Set PIN (Optional)
**Screen:** `PINSetupDialog`

```
Set Scooter PIN

Enter 6-digit PIN: [______]
Confirm PIN: [______]

PIN Strength: Good

[Set PIN] [Skip]
```

#### Step 9: Terms & Conditions
**Screen:** `TermsAcceptanceActivity`

```
Terms & Conditions

[Language Selector: English (US)]

[Scrollable T&C Content]

☐ I have read and agree to the Terms & Conditions
☐ I have read and agree to the Privacy Policy
☐ I agree to receive promotional emails (optional)

[Continue Button - disabled until checkboxes checked]
```

#### Step 10: Review & Submit
**Screen:** Summary

```
Review Your Information

Email: user@example.com
Name: John Doe
Scooter: ZYD-123456
Location: San Francisco, CA, USA
PIN: Set ✓
T&C: Accepted ✓

[Submit Registration Button]
```

#### Step 11: Verification Email Sent
**Screen:** Confirmation

```
Check Your Email!

We've sent a verification link to:
user@example.com

Click the link to activate your account.

[Resend Email] [Back to Login]
```

#### Step 12: Email Verified
**Screen:** Success

```
Account Verified!

Your account is now active.

[Login Button]
```

---

## 8. EDGE FUNCTION CHANGES NEEDED

### 8.1 New Edge Function: Terms & Conditions

**File:** `supabase/functions/terms/index.ts`

```typescript
serve(async (req) => {
  if (req.method === 'GET') {
    // Fetch latest T&C
    const { language, region } = Object.fromEntries(new URL(req.url).searchParams)

    const { data, error } = await supabaseAdmin
      .from('terms_conditions')
      .select('*')
      .eq('language_code', language || 'en')
      .eq('region_code', region || null)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      // Fallback to English
      return fetchEnglishTerms()
    }

    return new Response(JSON.stringify(data), { status: 200 })
  }
})
```

### 8.2 New Edge Function: Consent Recording

**File:** `supabase/functions/consent/index.ts`

```typescript
serve(async (req) => {
  if (req.method === 'POST') {
    const { user_id, terms_version, consent_type, language_code, region_code, ip_address, user_agent } = await req.json()

    const { error } = await supabaseAdmin
      .from('user_consent')
      .insert({
        user_id,
        terms_version,
        consent_type,
        language_code,
        region_code,
        ip_address,
        user_agent,
        accepted: true,
        accepted_at: new Date().toISOString()
      })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 })
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 })
  }
})
```

### 8.3 Update Register User Endpoint

**File:** `supabase/functions/register-user/index.ts`

**Add to payload:**
```typescript
// New fields to accept
{
  // ... existing fields ...

  // Location
  registration_latitude: number,
  registration_longitude: number,
  registration_accuracy_meters: number,
  registration_location_method: string,
  registration_country: string,
  registration_region: string,
  registration_city: string,
  registration_ip_address: string,

  // Consent
  terms_version: string,
  terms_language: string,
  terms_region: string,
  accepted_terms: boolean,
  accepted_privacy: boolean,
  accepted_marketing: boolean,

  // Language
  preferred_language: string,

  // PIN (optional)
  scooter_pin?: string
}
```

**Update database inserts** to include these new fields.

---

## 9. WEB-ADMIN UPDATES NEEDED

### 9.1 T&C Management Page

**New Page:** `web-admin/js/pages/terms.js`

**Features:**
- List all T&C versions
- Create new T&C version
- Add translations for existing versions
- Mark versions as active/inactive
- Preview T&C in different languages
- Track consent statistics (how many users accepted each version)

### 9.2 Consent Audit Log

**New Page:** `web-admin/js/pages/consent-audit.js`

**Features:**
- View all consent records
- Filter by user, date, type
- Export consent history for compliance
- Show which users need to re-consent (when T&C updated)

---

## 10. IMPLEMENTATION ROADMAP

### Phase 1: Database Schema (1 day)
- [ ] Create migration for location columns
- [ ] Create migration for T&C tables
- [ ] Create migration for user language preference
- [ ] Test migrations on dev database

### Phase 2: Location Capture (2 days)
- [ ] Implement `LocationCaptureManager.java`
- [ ] Add runtime permission request flow
- [ ] Test GPS, network, and IP fallbacks
- [ ] Add reverse geocoding
- [ ] Update registration endpoint to accept location data

### Phase 3: T&C System (3 days)
- [ ] Create `TermsAndConditionsManager.java`
- [ ] Build `TermsAcceptanceActivity`
- [ ] Create terms edge function
- [ ] Create consent edge function
- [ ] Add multilingual T&C support
- [ ] Test with different languages/regions

### Phase 4: PIN Setup (1 day)
- [ ] Create `PINSetupDialog`
- [ ] Integrate into registration flow
- [ ] Test PIN validation and encryption
- [ ] Handle skip/later scenarios

### Phase 5: Registration Flow Integration (2 days)
- [ ] Update `RegisterUserActivity` with new steps
- [ ] Add progress indicator/stepper UI
- [ ] Wire all components together
- [ ] Test end-to-end registration flow

### Phase 6: Multilingual Support (2 days)
- [ ] Add string resources for all languages
- [ ] Translate T&C content
- [ ] Test language switching
- [ ] Add language selector

### Phase 7: Web-Admin Updates (2 days)
- [ ] Build T&C management page
- [ ] Build consent audit page
- [ ] Test T&C versioning
- [ ] Test consent tracking

### Phase 8: Testing & Polish (2 days)
- [ ] End-to-end testing
- [ ] Edge case handling
- [ ] Error message improvements
- [ ] UI/UX polish

**Total Estimated Time:** 15 days (3 weeks)

---

## 11. SUCCESS METRICS

### User Experience:
- ✅ Registration completion rate > 80%
- ✅ Average registration time < 5 minutes
- ✅ PIN setup rate > 60%
- ✅ Location capture success rate > 90%

### Legal Compliance:
- ✅ 100% of users accept T&C before registration
- ✅ Consent records include IP, timestamp, version
- ✅ Multilingual T&C available for all supported regions
- ✅ Audit trail for all consent changes

### Technical:
- ✅ Location accuracy < 100 meters for 90% of users
- ✅ Registration API success rate > 99%
- ✅ T&C loading time < 2 seconds
- ✅ Zero data loss in consent records

---

## 12. NEXT STEPS

### Immediate Actions:
1. ✅ Review this specification
2. ✅ Confirm approach and priorities
3. ✅ Create database migrations
4. ✅ Start with Location Capture implementation
5. ✅ Then T&C System
6. ✅ Then PIN Setup
7. ✅ Finally integrate all components

### Questions to Resolve:
- Which languages should be supported initially?
- Should PIN be required or optional?
- How often should T&C be updated?
- Should we support manual location entry as fallback?
- Should we capture device info for consent tracking?

---

**Ready to start implementation?**

Let me know if you want to:
1. Create the database migrations first
2. Start with a specific component (location, T&C, or PIN)
3. Adjust the specification
4. Discuss the roadmap

