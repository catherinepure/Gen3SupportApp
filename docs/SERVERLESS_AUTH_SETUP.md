# Serverless User Registration Setup (Supabase Edge Functions)

This guide explains how to set up user registration using **Supabase Edge Functions** - no separate Python server needed!

## Why This Approach?

✅ **No separate server needed** - runs on Supabase infrastructure
✅ **Serverless** - scales automatically, pay per use
✅ **Built-in with Supabase** - integrates directly with your database
✅ **Free tier available** - 500K requests/month free
✅ **Easy deployment** - single command to deploy

## Architecture

```
┌─────────────┐                    ┌──────────────────────┐
│  Android    │                    │   Supabase Edge      │
│    App      │ ────────HTTP────►  │   Functions          │
│             │                    │   (Serverless)       │
└─────────────┘                    └──────────┬───────────┘
                                              │
                                              ├─► Database
                                              │
                                              └─► SendGrid Email
```

## Setup Instructions

### 1. Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase
```

Or download from: https://github.com/supabase/cli/releases

### 2. Login to Supabase CLI

```bash
supabase login
```

This will open your browser to authenticate.

### 3. Link to Your Supabase Project

```bash
cd Gen3FirmwareUpdater
supabase link --project-ref your-project-ref
```

Get your project ref from: Supabase Dashboard → Project Settings → General → Reference ID

### 4. Run Database Migration

In Supabase Dashboard → SQL Editor, run:
```sql
-- Copy and paste contents of user_registration_schema.sql
```

### 5. Verify SendGrid Sender Email

1. Go to SendGrid Dashboard: https://app.sendgrid.com
2. Navigate to Settings → Sender Authentication
3. Click "Verify a Single Sender"
4. Enter your sender email: `noreply@pureelectric.com` (or your domain)
5. Verify the email via link sent to your inbox

**Important:** Update the `FROM_EMAIL` constant in these files:
- `supabase/functions/register/index.ts` (line 14)
- `supabase/functions/resend-verification/index.ts` (line 8)

### 6. Deploy Edge Functions

Deploy all 5 functions with these commands:

```bash
# Deploy registration function
supabase functions deploy register

# Deploy login function
supabase functions deploy login

# Deploy email verification function
supabase functions deploy verify

# Deploy session validation function
supabase functions deploy validate-session

# Deploy resend verification function
supabase functions deploy resend-verification
```

**Deployment happens in seconds!** Each function is automatically available at:
- `https://your-project.supabase.co/functions/v1/register`
- `https://your-project.supabase.co/functions/v1/login`
- `https://your-project.supabase.co/functions/v1/verify`
- `https://your-project.supabase.co/functions/v1/validate-session`
- `https://your-project.supabase.co/functions/v1/resend-verification`

### 7. Update Android App

Update the BASE_URL in `AuthClient.java` (line 14):

```java
private static final String BASE_URL = "https://your-project.supabase.co/functions/v1";
```

Replace `your-project` with your actual Supabase project URL.

### 8. Update AndroidManifest.xml

Make LoginActivity the launcher:

```xml
<activity
    android:name=".LoginActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
</activity>

<activity
    android:name=".RegisterActivity"
    android:exported="false" />

<activity
    android:name=".FirmwareUpdaterActivity"
    android:exported="false" />
```

## Testing the Functions

### Test Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123"}'
```

Expected response:
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

### Test Login (after verifying email)
```bash
curl -X POST https://your-project.supabase.co/functions/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass123","device_info":"Test Device"}'
```

Expected response:
```json
{
  "success": true,
  "session_token": "long_random_token_here",
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "role": "user",
    "distributor_id": null
  }
}
```

### Test Session Validation
```bash
curl -X POST https://your-project.supabase.co/functions/v1/validate-session \
  -H "Content-Type: application/json" \
  -d '{"session_token":"your_session_token_from_login"}'
```

## Viewing Function Logs

```bash
# View logs for a specific function
supabase functions logs register

# Follow logs in real-time
supabase functions logs register --follow
```

Or view in Supabase Dashboard → Edge Functions → Select function → Logs

## Edge Functions Overview

### `/register` (POST)
- Creates new user account
- Sends verification email via SendGrid
- Returns success message

### `/login` (POST)
- Validates email/password
- Checks if email is verified
- Creates 30-day session token
- Returns session token and user info

### `/verify` (GET or POST)
- Validates verification token
- Marks user as verified
- Returns HTML success page (for email links)

### `/validate-session` (POST)
- Checks if session token is valid
- Returns user info if valid
- Updates last activity timestamp

### `/resend-verification` (POST)
- Generates new verification token
- Sends new email
- Doesn't reveal if email exists (security)

## SendGrid API Key

Set the SendGrid API key as a Supabase secret:
```
supabase secrets set SENDGRID_API_KEY="your-sendgrid-api-key"
```

Located in:
- `supabase/functions/register/index.ts` (line 9)
- `supabase/functions/resend-verification/index.ts` (line 7)

## Security Notes

1. **Service Role Key:** Edge Functions automatically have access to `SUPABASE_SERVICE_ROLE_KEY` via environment variables
2. **CORS:** All functions have CORS enabled with `Access-Control-Allow-Origin: *`
3. **Password Hashing:** Uses SHA-256 (consider upgrading to bcrypt for production)
4. **Token Generation:** Uses `crypto.getRandomValues()` for secure tokens
5. **Email Verification Required:** Users cannot login until email is verified

## Updating Functions

After making changes to function code:

```bash
# Redeploy a single function
supabase functions deploy register

# Or deploy all at once
supabase functions deploy register && \
supabase functions deploy login && \
supabase functions deploy verify && \
supabase functions deploy validate-session && \
supabase functions deploy resend-verification
```

Changes are live immediately!

## Cost Estimate

Supabase Edge Functions pricing:
- **Free tier:** 500,000 requests/month
- **Pro tier:** $25/month (500K requests included, then $2 per 1M additional)

For a small to medium app with 1000 users:
- ~3,000 logins/month = **Well within free tier**
- Even 100K requests/month = **Free**

SendGrid pricing:
- **Free tier:** 100 emails/day = 3,000/month
- **Essentials:** $19.95/month for 50K emails

## Troubleshooting

### "Function not found" error
- Check deployment: `supabase functions list`
- Verify URL matches your project
- Redeploy: `supabase functions deploy function-name`

### "SendGrid authentication failed"
- Verify API key is correct
- Check sender email is verified in SendGrid
- View logs: `supabase functions logs register`

### Email not arriving
- Check spam/junk folder
- Verify FROM_EMAIL matches verified sender
- Check SendGrid activity log
- View function logs for errors

### "Invalid session" error
- Session may have expired (30 days)
- Check user_sessions table in database
- User may need to login again

## Monitoring

View function metrics in Supabase Dashboard:
- Go to Edge Functions
- Select a function
- View: Invocations, Errors, Response times

## Files Structure

```
Gen3FirmwareUpdater/
├── supabase/
│   └── functions/
│       ├── register/
│       │   └── index.ts              # User registration
│       ├── login/
│       │   └── index.ts              # User login
│       ├── verify/
│       │   └── index.ts              # Email verification
│       ├── validate-session/
│       │   └── index.ts              # Session validation
│       └── resend-verification/
│           └── index.ts              # Resend verification
├── user_registration_schema.sql      # Database schema
├── app/src/main/java/.../
│   ├── LoginActivity.java            # Android login UI
│   ├── RegisterActivity.java         # Android registration UI
│   └── AuthClient.java               # API client (updated for Edge Functions)
└── SERVERLESS_AUTH_SETUP.md          # This file
```

## Advantages Over Flask Backend

| Feature | Flask Backend | Supabase Edge Functions |
|---------|--------------|------------------------|
| Deployment | Requires server hosting | Instant, serverless |
| Scaling | Manual scaling needed | Auto-scales |
| Cost | $5-20+/month | Free for 500K req/month |
| Maintenance | Server updates, monitoring | Fully managed |
| Integration | Separate from database | Built into Supabase |
| Cold starts | N/A | <100ms |

## Next Steps

1. ☐ Install Supabase CLI
2. ☐ Link to your project
3. ☐ Run database migration
4. ☐ Verify SendGrid sender
5. ☐ Update FROM_EMAIL in functions
6. ☐ Deploy all 5 functions
7. ☐ Update AuthClient.java BASE_URL
8. ☐ Update AndroidManifest.xml
9. ☐ Build and test app

## Support

- Supabase Docs: https://supabase.com/docs/guides/functions
- SendGrid Docs: https://docs.sendgrid.com
- Edge Functions Examples: https://github.com/supabase/supabase/tree/master/examples/edge-functions
