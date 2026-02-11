# Quick Start - Deploy in 10 Minutes

## 1. Install Supabase CLI (1 min)
```bash
brew install supabase/tap/supabase
supabase login
```

## 2. Link Project (1 min)
```bash
cd Gen3FirmwareUpdater
supabase link --project-ref YOUR-PROJECT-REF
```
Get project ref from: Supabase Dashboard → Settings → General

## 3. Deploy Database (2 min)
1. Go to https://supabase.com/dashboard
2. SQL Editor → New Query
3. Copy/paste `user_scooter_registration_schema.sql`
4. Run (Cmd+Enter)

## 4. Deploy Functions (3 min)
```bash
./deploy-functions-only.sh
```

## 5. Update SendGrid Email (1 min)
Edit these files, change `FROM_EMAIL`:
- `supabase/functions/register-user/index.ts` (line 14)
- `supabase/functions/register-distributor/index.ts` (line 8)
- `supabase/functions/resend-verification/index.ts` (line 8)

Then redeploy:
```bash
supabase functions deploy register-user --no-verify-jwt
supabase functions deploy register-distributor --no-verify-jwt
supabase functions deploy resend-verification --no-verify-jwt
```

## 6. Update Android App (2 min)
**File:** `app/src/main/java/.../AuthClient.java` (line 21)
```java
private static final String BASE_URL = "https://YOUR-PROJECT.supabase.co/functions/v1";
```

**File:** `app/src/main/AndroidManifest.xml`
```xml
<activity android:name=".RegistrationChoiceActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>
```

## 7. Test (Optional)
```bash
curl -X POST https://YOUR-PROJECT.supabase.co/functions/v1/register-user \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test1234","scooter_serial":"TEST"}'
```

---

**Done! 🎉**

For detailed instructions, see: `DEPLOYMENT_GUIDE.md`
