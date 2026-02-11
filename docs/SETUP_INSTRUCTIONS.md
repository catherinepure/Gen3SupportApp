# Setup Instructions - Before First Use

The registration system requires Supabase backend setup before the app can function. Follow these steps:

---

## Prerequisites

✓ SendGrid API Key: Set via `SENDGRID_API_KEY` environment variable

---

## Step 1: Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New Project"
3. Enter project details:
   - Name: `Pure Electric Registration`
   - Database password: (choose a secure password)
   - Region: Choose closest to your users
4. Click "Create new project" (takes ~2 minutes)
5. **Save your project reference ID** from Settings → General

---

## Step 2: Get Your Supabase URL

Once your project is created:
1. Go to Settings → API
2. Copy your **Project URL** (looks like: `https://abcdefghijk.supabase.co`)
3. You'll need this for Step 5

---

## Step 3: Deploy Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Click **New Query**
3. Open the file: `user_scooter_registration_schema.sql` (in this project)
4. Copy entire contents and paste into SQL Editor
5. Click **Run** (or Cmd+Enter)
6. Verify success - should see: "Success. No rows returned"

---

## Step 4: Install Supabase CLI & Deploy Functions

### Install CLI

**macOS:**
```bash
brew install supabase/tap/supabase
```

**Windows:**
```bash
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Alternative (No Homebrew/Scoop):**
Download from: https://github.com/supabase/cli/releases

### Link Project & Deploy

```bash
# Login
supabase login

# Link to your project
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater
supabase link --project-ref YOUR-PROJECT-REF

# Deploy all functions
./deploy-functions-only.sh
```

---

## Step 5: Configure SendGrid Email

### Update Edge Functions with Verified Sender

Your SendGrid API key is already available. Now update the sender email in these 3 files:

**File 1:** `supabase/functions/register-user/index.ts`
```typescript
// Line 14
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change to your verified email
```

**File 2:** `supabase/functions/register-distributor/index.ts`
```typescript
// Line 8
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change to your verified email
```

**File 3:** `supabase/functions/resend-verification/index.ts`
```typescript
// Line 8
const FROM_EMAIL = "noreply@pureelectric.com"  // ← Change to your verified email
```

### Verify Sender in SendGrid

1. Go to: https://app.sendgrid.com/settings/sender_auth
2. Click "Verify a Single Sender"
3. Enter your sender email (e.g., `noreply@pureelectric.com`)
4. Check email and click verification link

### Redeploy Functions

```bash
supabase functions deploy register-user --no-verify-jwt
supabase functions deploy register-distributor --no-verify-jwt
supabase functions deploy resend-verification --no-verify-jwt
```

---

## Step 6: Update Android App with Supabase URL

**File:** `app/src/main/java/com/pure/gen3firmwareupdater/AuthClient.java`

Find line 21 and replace with your Supabase URL from Step 2:

```java
// Line 21
private static final String BASE_URL = "https://YOUR-PROJECT-REF.supabase.co/functions/v1";
```

**Example:**
```java
private static final String BASE_URL = "https://abcdefghijk.supabase.co/functions/v1";
```

---

## Step 7: Build & Test

### Build APK

```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater
./gradlew assembleDebug
```

### Install on Device

```bash
adb install app/build/outputs/apk/debug/app-debug.apk
```

### Test Flow

1. **App opens** → See "Choose Registration Type" screen
2. **Test User Registration:**
   - Click "Register as Owner"
   - Click "Connect to Scooter" (requires actual ZYD scooter)
   - Enter email/password
   - Register
   - Check email for verification link
3. **Test Distributor Registration:**
   - Click "Register as Distributor"
   - Enter email/password/activation code
   - Register
   - Check email for verification link

---

## Step 8: Create Test Distributor Activation Code

Before distributors can register, you need activation codes in the database.

Run this in Supabase SQL Editor:

```sql
-- Create a test distributor with activation code
INSERT INTO distributors (name, activation_code, is_active)
VALUES ('Test Distributor', 'TEST-DIST-2024', true);

-- View all distributors
SELECT id, name, activation_code, is_active FROM distributors;
```

Now distributors can register with code: `TEST-DIST-2024`

---

## Current Status

✓ Android app built successfully
✓ Registration UI complete (2 paths: user + distributor)
✓ BLE connection working
✓ SendGrid API key available
⏳ **Need to:** Create Supabase project & deploy backend
⏳ **Need to:** Update AuthClient.java with Supabase URL

---

## Quick Reference

### SendGrid API Key
Set via `SENDGRID_API_KEY` environment variable.

### Edge Functions to Deploy
1. `register-user` - User registration with scooter
2. `register-distributor` - Distributor registration with code
3. `login` - User/distributor login
4. `verify` - Email verification
5. `validate-session` - Session validation
6. `resend-verification` - Resend verification email

### Files to Update After Supabase Setup
1. `AuthClient.java` line 21 - Supabase URL
2. `supabase/functions/register-user/index.ts` line 14 - Sender email
3. `supabase/functions/register-distributor/index.ts` line 8 - Sender email
4. `supabase/functions/resend-verification/index.ts` line 8 - Sender email

---

## Need Help?

See detailed guides:
- `DEPLOYMENT_GUIDE.md` - Complete step-by-step deployment
- `QUICK_START.md` - 10-minute quick start
- `NEW_REGISTRATION_SYSTEM.md` - System architecture overview
