# Deploy Admin Edge Function - Manual Steps

The admin Edge Function needs to be redeployed to include the country filter fix.

## Option 1: Via Supabase Dashboard (Easiest)

1. Go to https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/functions
2. Click on the `admin` function
3. Click "Deploy new version"
4. Copy the contents of `supabase/functions/admin/index.ts`
5. Paste into the editor
6. Click "Deploy"

## Option 2: Via Supabase CLI (Requires CLI installed)

```bash
# Install CLI first (if not installed)
brew install supabase/tap/supabase

# Login
supabase login

# Deploy
supabase functions deploy admin --project-ref hhpxmlrpdharhhzwjxuc
```

## What This Fixes

The deployed version of the admin function is missing the `home_country` filter support that was added in commit 9ed3d90. The code on line 278 of the local file has:

```typescript
if (body.home_country) query = query.eq('home_country', body.home_country)
```

But the deployed version doesn't have this, so country filtering doesn't work.

## Verification After Deployment

After deploying, test the country filter:

1. Go to https://ives.org.uk/app2026
2. Login as admin@pure.com
3. Go to Users page
4. Select "IT" from the Country dropdown
5. You should see ONLY Italian users (home_country = 'IT')
6. Check the console - you should see fewer total users returned

Expected behavior:
- Before filter: ~82 total users
- With IT filter: ~2-5 users (only those with home_country='IT')
