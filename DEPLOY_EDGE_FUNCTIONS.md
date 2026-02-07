# Deploying Edge Functions to Fix CORS Issue

## Problem
The web admin is getting "Failed to fetch" because the Edge Functions don't allow the `apikey` header in CORS preflight requests.

## Solution
All Edge Functions have been updated locally to include `apikey` in the CORS allowed headers:
```typescript
'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
```

## Files Updated
- ✅ supabase/functions/login/index.ts
- ✅ supabase/functions/admin/index.ts (already had it)
- ✅ supabase/functions/logout/index.ts
- ✅ supabase/functions/register/index.ts
- ✅ supabase/functions/register-user/index.ts
- ✅ supabase/functions/register-distributor/index.ts
- ✅ supabase/functions/validate-session/index.ts
- ✅ supabase/functions/verify/index.ts
- ✅ supabase/functions/resend-verification/index.ts
- ✅ supabase/functions/service-jobs/index.ts
- ✅ supabase/functions/workshops/index.ts
- ✅ supabase/functions/activity-events/index.ts

## Deployment Options

### Option 1: Supabase CLI (Recommended - Monday when available)

1. Install Homebrew (if not already):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. Install Supabase CLI:
   ```bash
   brew install supabase/tap/supabase
   ```

3. Login to Supabase:
   ```bash
   supabase login
   ```

4. Link to your project:
   ```bash
   supabase link --project-ref hhpxmlrpdharhhzwjxuc
   ```

5. Deploy all functions at once:
   ```bash
   cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater
   supabase functions deploy
   ```

   Or deploy individually:
   ```bash
   supabase functions deploy login
   supabase functions deploy admin
   # ... etc
   ```

### Option 2: Supabase Dashboard (Manual - Available Now)

You can deploy Edge Functions manually through the Supabase dashboard, but it's tedious for 12 functions.

1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/functions
2. For each function:
   - Click on the function name
   - Click "Edit"
   - Copy/paste the updated code from `supabase/functions/{name}/index.ts`
   - Click "Deploy"

**Note:** This is time-consuming for 12 functions. Option 1 is much faster.

### Option 3: Quick Test (Login Only)

If you just want to test the web admin quickly, deploy only the critical functions:

1. Login function (required for web admin):
   - Dashboard > Functions > login > Edit
   - Copy from `supabase/functions/login/index.ts`
   - Deploy

2. Admin function (already correct, but verify it's deployed):
   - Dashboard > Functions > admin
   - Check if it exists and is deployed

## Verification

After deployment, test with curl:
```bash
curl -X OPTIONS https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/login \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type,authorization,apikey" \
  -v 2>&1 | grep "access-control-allow-headers"
```

Should see:
```
access-control-allow-headers: Content-Type, Authorization, apikey
```

Then try the web admin again at http://localhost:8000

## After Deployment

Once working, you can access the web admin at:
- **Local testing:** http://localhost:8000 (with `./serve.sh` running)
- **Production:** Upload to HostingUK shared hosting

The connection test tool is also available at:
- http://localhost:8000/test-connection.html
