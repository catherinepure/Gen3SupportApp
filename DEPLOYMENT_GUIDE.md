# Deployment Guide - Pure Electric Registration System

## Quick Start (5 Steps)

### Prerequisites
- Supabase project created
- Supabase CLI installed
- SendGrid account with verified sender email

---

## Step 1: Install Supabase CLI

### macOS
```bash
brew install supabase/tap/supabase
```

### Windows
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

### Linux
```bash
brew install supabase/tap/supabase
```

Or download from: https://github.com/supabase/cli/releases

**Verify installation:**
```bash
supabase --version
```

---

## Step 2: Link to Your Supabase Project

```bash
# Navigate to project directory
cd /path/to/Gen3FirmwareUpdater

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref
```

**Find your project ref:**
1. Go to Supabase Dashboard
2. Project Settings → General
3. Copy "Reference ID"

---

## Step 3: Deploy Database Schema

**This must be done manually in Supabase Dashboard** (can't be automated via CLI for safety)

### Steps:
1. Open Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** (left sidebar)
4. Click **New Query**
5. Open the file: `user_scooter_registration_schema.sql`
6. Copy entire contents
7. Paste into SQL Editor
8. Click **Run** (or press Cmd+Enter)

### What this creates:
- ✅ `users` table with profile fields
- ✅ `user_scooters` relationship table
- ✅ `scooter_telemetry` table
- ✅ `user_sessions` table
- ✅ `password_reset_tokens` table
- ✅ `user_audit_log` table
- ✅ Helper functions (add_scooter_to_user, get_user_scooters, etc.)

### Verify it worked:
In SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('users', 'user_scooters', 'scooter_telemetry');
```

Should return 3 rows.

---

## Step 4: Deploy Edge Functions

### Option A: Automated (Recommended)
```bash
./deploy-functions-only.sh
```

### Option B: Manual
```bash
supabase functions deploy register-user --no-verify-jwt
supabase functions deploy register-distributor --no-verify-jwt
supabase functions deploy login --no-verify-jwt
supabase functions deploy verify --no-verify-jwt
supabase functions deploy validate-session --no-verify-jwt
supabase functions deploy resend-verification --no-verify-jwt
```

### Verify deployment:
```bash
supabase functions list
```

Should show all 6 functions as "deployed".

---

## Step 5: Configure SendGrid

### 5a. Verify Sender Email

1. Go to SendGrid Dashboard: https://app.sendgrid.com
2. Navigate to **Settings → Sender Authentication**
3. Click **Verify a Single Sender**
4. Enter your sender email (e.g., `noreply@pureelectric.com`)
5. Check your email and click verification link

### 5b. Update Edge Functions with Sender Email

Edit these 3 files and update `FROM_EMAIL`:

**File 1:** `supabase/functions/register-user/index.ts`
```typescript
// Line 14
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change this
```

**File 2:** `supabase/functions/register-distributor/index.ts`
```typescript
// Line 8
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change this
```

**File 3:** `supabase/functions/resend-verification/index.ts`
```typescript
// Line 8
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change this
```

**Then redeploy:**
```bash
supabase functions deploy register-user --no-verify-jwt
supabase functions deploy register-distributor --no-verify-jwt
supabase functions deploy resend-verification --no-verify-jwt
```

---

## Step 6: Update Android App

### 6a. Update AuthClient.java

**File:** `app/src/main/java/com/pure/gen3firmwareupdater/AuthClient.java`

Find line 21 and update with your Supabase URL:
```java
// Line 21
private static final String BASE_URL = "https://your-project.supabase.co/functions/v1";
```

Replace `your-project` with your actual project reference ID.

### 6b. Update AndroidManifest.xml

**File:** `app/src/main/AndroidManifest.xml`

Make `RegistrationChoiceActivity` the launcher activity:

```xml
<activity
    android:name=".RegistrationChoiceActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>

<activity
    android:name=".RegisterUserActivity"
    android:exported="false" />

<activity
    android:name=".RegisterDistributorActivity"
    android:exported="false" />

<activity
    android:name=".LoginActivity"
    android:exported="false" />

<activity
    android:name=".FirmwareUpdaterActivity"
    android:exported="false"
    android:screenOrientation="portrait" />
```

### 6c. Add Missing Layouts (if needed)

You still need to create:
- `activity_register_distributor.xml` (similar to user registration, but no scooter connection section)

---

## Step 7: Build and Test

### Build APK
```bash
cd app
./gradlew assembleDebug
```

### Install on Device
```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Test User Registration
1. Open app
2. Click "Register as Owner"
3. Click "Connect to Scooter"
4. Wait for connection
5. Enter email/password
6. Click Register
7. Check email for verification link
8. Click link
9. Return to app and login

### Test Distributor Registration
1. Open app
2. Click "Register as Distributor"
3. Enter email/password/activation code
4. Click Register
5. Check email for verification link
6. Click link
7. Return to app and login

---

## Testing Edge Functions Directly

### Test User Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/register-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "scooter_serial": "ZYD-TEST-001",
    "telemetry": {
      "odometer_km": 100.5,
      "battery_soc": 90,
      "controller_hw_version": "V5.9"
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "user_id": "uuid-here"
}
```

### Test Distributor Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/register-distributor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dist@example.com",
    "password": "distpass123",
    "activation_code": "YOUR-ACTIVATION-CODE"
  }'
```

### Test Login
```bash
curl -X POST https://your-project.supabase.co/functions/v1/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "device_info": "Test Device"
  }'
```

---

## Troubleshooting

### "Function not found"
```bash
# Check deployed functions
supabase functions list

# Redeploy specific function
supabase functions deploy register-user --no-verify-jwt
```

### "Invalid activation code"
- Check `distributors` table has activation codes
- Ensure code is uppercase
- Verify `is_active = true`

```sql
-- Check distributors
SELECT name, activation_code, is_active FROM distributors;
```

### "Email not sending"
1. Check SendGrid activity log: https://app.sendgrid.com/email_activity
2. Verify sender email is verified
3. Check function logs:
```bash
supabase functions logs register-user
```

### "Database schema error"
```sql
-- Check if tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Drop and recreate if needed (⚠️ DELETES DATA)
DROP TABLE IF EXISTS user_scooters CASCADE;
DROP TABLE IF EXISTS users CASCADE;
-- Then re-run schema
```

### View Function Logs
```bash
# View recent logs
supabase functions logs register-user

# Follow logs in real-time
supabase functions logs register-user --follow

# View all functions
supabase functions logs
```

---

## Verification Checklist

Before going live:

- [ ] Database schema deployed successfully
- [ ] All 6 Edge Functions deployed
- [ ] SendGrid sender email verified
- [ ] FROM_EMAIL updated in functions
- [ ] AuthClient.java BASE_URL updated
- [ ] AndroidManifest.xml updated with launcher activity
- [ ] App builds without errors
- [ ] Test user registration works
- [ ] Test distributor registration works
- [ ] Test login works
- [ ] Verification emails arrive
- [ ] Verification links work

---

## Production Checklist

Additional steps for production:

- [ ] Update SendGrid to paid plan (if needed)
- [ ] Set up custom domain for emails (optional)
- [ ] Configure Supabase auth settings
- [ ] Enable row-level security (RLS) policies
- [ ] Set up monitoring/alerts
- [ ] Create admin user accounts
- [ ] Backup database
- [ ] Test on multiple Android devices
- [ ] Prepare App Store listing

---

## Support

### Supabase Issues
- Docs: https://supabase.com/docs
- Logs: `supabase functions logs <function-name>`
- Community: https://github.com/supabase/supabase/discussions

### SendGrid Issues
- Dashboard: https://app.sendgrid.com
- Activity log: Check email delivery status
- Docs: https://docs.sendgrid.com

### App Issues
- Check logcat: `adb logcat | grep -i "register\|auth"`
- Database: Query tables directly in Supabase
- Edge Functions: Check function logs

---

## Quick Reference

### Essential Commands
```bash
# Deploy all functions
./deploy-functions-only.sh

# Deploy single function
supabase functions deploy register-user --no-verify-jwt

# View logs
supabase functions logs register-user

# List deployed functions
supabase functions list

# Build Android app
./gradlew assembleDebug

# Install on device
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Essential Files
- Database: `user_scooter_registration_schema.sql`
- Functions: `supabase/functions/*/index.ts`
- Auth Client: `app/src/main/java/.../AuthClient.java`
- Manifest: `app/src/main/AndroidManifest.xml`

### Essential URLs
- Supabase Dashboard: https://supabase.com/dashboard
- SendGrid Dashboard: https://app.sendgrid.com
- Your Functions: `https://your-project.supabase.co/functions/v1/`

---

**You're all set! 🎉**

If you encounter issues, check the troubleshooting section or refer to:
- `NEW_REGISTRATION_SYSTEM.md` - System overview
- `COMPLETE_IMPLEMENTATION_SUMMARY.md` - Full implementation details
