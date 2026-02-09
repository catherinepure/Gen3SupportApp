# Secure Activation Codes - Deployment Guide

## Summary

✅ **All code changes committed** - Commit: 74ab185

This implementation adds secure, encrypted activation codes with bcrypt hashing for both distributors and workshops.

## Changes Made

### Backend (Edge Functions)
- ✅ `supabase/functions/admin/index.ts` - Added bcrypt utilities, code generation/hashing, regenerate-code action
- ✅ `supabase/functions/register-distributor/index.ts` - Hash validation, expiry checking, bcrypt passwords
- ✅ `supabase/functions/register-workshop/index.ts` - Hash validation, expiry checking, bcrypt passwords

### Frontend (Web Admin)
- ✅ `web-admin/js/pages/distributors.js` - Hide encrypted codes, show regenerate button, status badges
- ✅ `web-admin/js/pages/workshops.js` - Hide encrypted codes, show regenerate button, status badges
- ✅ `web-admin/index.html` - Cache version updated to v=20260209-3

### Database
- ✅ `supabase/migrations/20260209000002_secure_activation_codes.sql` - Ready to apply

---

## Deployment Steps

### Step 1: Apply Database Migration

The migration SQL is in `supabase/migrations/20260209000002_secure_activation_codes.sql`

**Option A: Via Supabase CLI (if PATH is configured)**
```bash
# Add Supabase CLI to PATH first, then:
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater
supabase db push
```

**Option B: Via Supabase Dashboard (Manual)**
1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor
2. Click "SQL Editor"
3. Copy the contents of `supabase/migrations/20260209000002_secure_activation_codes.sql`
4. Paste and click "Run"
5. Verify: Check that `distributors` and `workshops` tables now have `activation_code_hash`, `activation_code_expires_at`, and `activation_code_created_at` columns

**Migration adds:**
- `distributors.activation_code_hash` (TEXT UNIQUE) - Bcrypt hash
- `distributors.activation_code_expires_at` (TIMESTAMPTZ) - Expiry date
- `distributors.activation_code_created_at` (TIMESTAMPTZ) - Creation timestamp
- Same 3 columns for `workshops` table
- `users.activation_code_used_at` (TIMESTAMPTZ) - Usage tracking
- View: `unmigrated_activation_codes` - Helps track migration progress

### Step 2: Deploy Edge Functions

**Option A: Via Supabase CLI**
```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater

# Deploy all 3 updated functions
supabase functions deploy admin
supabase functions deploy register-distributor
supabase functions deploy register-workshop
```

**Option B: Via Supabase Dashboard**
1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/functions
2. For each function (admin, register-distributor, register-workshop):
   - Click the function name
   - Click "Deploy new version"
   - Upload the corresponding folder from `supabase/functions/`

### Step 3: Upload Web Admin to Hosting

```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater/web-admin

# Upload to your hosting (ives.org.uk/app2026)
# Method depends on your hosting setup - FTP, rsync, etc.
```

Files that changed:
- `index.html` (cache version updated)
- `js/pages/distributors.js` (regenerate button, encrypted display)
- `js/pages/workshops.js` (regenerate button, encrypted display)

---

## Testing After Deployment

### Test 1: Create New Distributor
1. Login to web admin: https://ives.org.uk/app2026
2. Go to Distributors page
3. Click "Create Distributor"
4. Fill in name, countries, etc.
5. Click Create
6. ✅ **Expected**: Modal shows activation code ONCE (e.g., `PURE-A3K9-X7M2`)
7. Save this code for testing
8. Refresh page and view distributor details
9. ✅ **Expected**: Code shows as "Encrypted" with creation/expiry dates

### Test 2: Regenerate Activation Code
1. View a distributor's details
2. Click "Regenerate Code" button
3. Confirm the action
4. ✅ **Expected**: Modal shows new code ONCE
5. ✅ **Expected**: Old code is now invalid

### Test 3: Register with New Code
1. Open Android app (or test via API)
2. Choose "Register as Distributor"
3. Enter email/password and the activation code from Test 1
4. Submit registration
5. ✅ **Expected**: Registration succeeds, user created with `activation_code_used_at` timestamp

### Test 4: Try Expired Code
1. In SQL Editor, update a distributor's expiry:
   ```sql
   UPDATE distributors
   SET activation_code_expires_at = now() - interval '1 day'
   WHERE name = 'Test Distributor';
   ```
2. Try registering with that distributor's code
3. ✅ **Expected**: Error message "Activation code expired"

### Test 5: Legacy Code Support (During Migration)
1. Find a distributor with old plaintext code (if any exist)
2. Try registering with the plaintext code
3. ✅ **Expected**: Registration still works (backward compatibility)
4. Regenerate the code via web admin
5. ✅ **Expected**: New hashed code created, old plaintext code invalidated

---

## Security Improvements

### Before (Insecure)
- ❌ Activation codes stored as plaintext in database
- ❌ Passwords hashed with unsalted SHA-256
- ❌ No code expiry
- ❌ No regeneration capability

### After (Secure)
- ✅ Activation codes hashed with bcrypt (10 rounds)
- ✅ Passwords hashed with bcrypt + salt
- ✅ Codes expire after 90 days
- ✅ Admins can regenerate codes anytime
- ✅ Usage tracking with timestamps
- ✅ Legacy support during migration period

---

## Migration Timeline

### Week 1 (Current)
- ✅ Deploy database migration
- ✅ Deploy Edge Functions
- ✅ Deploy web admin
- ⚠️ **Legacy plaintext codes still work** (backward compatibility)

### Week 2
1. Notify all distributors/workshops: "Your activation code will be regenerated"
2. Use web admin to regenerate all codes (click "Regenerate Code" for each)
3. Email new codes to each organization
4. Monitor registration errors (check Edge Function logs)

### Week 3
1. Verify all codes migrated:
   ```sql
   SELECT * FROM unmigrated_activation_codes;
   -- Should return 0 rows
   ```
2. Remove plaintext fallback from Edge Functions (update validation logic)
3. Drop plaintext columns:
   ```sql
   ALTER TABLE distributors DROP COLUMN activation_code;
   ALTER TABLE workshops DROP COLUMN activation_code;
   DROP VIEW unmigrated_activation_codes;
   ```

---

## Rollback Plan (If Issues Occur)

### Quick Rollback - Revert Edge Functions
```bash
git checkout HEAD~1 supabase/functions/admin/index.ts
git checkout HEAD~1 supabase/functions/register-distributor/index.ts
git checkout HEAD~1 supabase/functions/register-workshop/index.ts

supabase functions deploy admin
supabase functions deploy register-distributor
supabase functions deploy register-workshop
```

### Full Rollback - Revert Database Changes
```sql
-- Remove new columns (does NOT break existing codes)
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_hash;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_expires_at;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_created_at;

ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_hash;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_expires_at;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_created_at;

ALTER TABLE users DROP COLUMN IF EXISTS activation_code_used_at;

DROP VIEW IF EXISTS unmigrated_activation_codes;
```

---

## Monitoring

### Check Edge Function Logs
```bash
supabase functions logs admin --tail
supabase functions logs register-distributor --tail
supabase functions logs register-workshop --tail
```

### Check Migration Status
```sql
-- How many codes are migrated?
SELECT
  (SELECT COUNT(*) FROM distributors WHERE activation_code_hash IS NOT NULL) AS dist_migrated,
  (SELECT COUNT(*) FROM distributors WHERE activation_code IS NOT NULL AND activation_code_hash IS NULL) AS dist_legacy,
  (SELECT COUNT(*) FROM workshops WHERE activation_code_hash IS NOT NULL) AS ws_migrated,
  (SELECT COUNT(*) FROM workshops WHERE activation_code IS NOT NULL AND activation_code_hash IS NULL) AS ws_legacy;
```

### Check Code Usage
```sql
-- Recent registrations using activation codes
SELECT
  email,
  registration_type,
  activation_code_used,
  activation_code_used_at,
  created_at
FROM users
WHERE activation_code_used_at IS NOT NULL
ORDER BY activation_code_used_at DESC
LIMIT 20;
```

---

## Support

If issues arise:
1. Check Edge Function logs for errors
2. Verify database migration applied successfully
3. Test registration flow manually
4. Check browser console for JavaScript errors
5. Refer to rollback plan above

## Next Steps After Deployment

1. Test all 5 test scenarios above
2. Regenerate codes for all existing distributors/workshops
3. Monitor registration success rate
4. After 2 weeks, drop plaintext columns (final migration step)

---

**Deployment Date:** 2026-02-09
**Implemented By:** Claude Sonnet 4.5
**Commit:** 74ab185
