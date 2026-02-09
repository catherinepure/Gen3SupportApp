# Quick Deploy Guide - Secure Activation Codes

## ✅ All Code Ready - Just Need to Deploy!

All changes are committed (commit: 74ab185). Here's the quickest way to deploy:

---

## Option 1: Manual Deploy (Recommended - No CLI Issues)

### Step 1: Apply Database Migration (5 minutes)

1. **Open Supabase SQL Editor:**
   - Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor
   - Click "SQL Editor" in left sidebar

2. **Copy Migration SQL:**
   - Open file: `supabase/migrations/20260209000002_secure_activation_codes.sql`
   - Copy ALL contents (Cmd+A, Cmd+C)

3. **Run Migration:**
   - Paste into SQL Editor
   - Click "Run" button
   - Wait for "Success" message

4. **Verify:**
   ```sql
   -- Run this to verify columns added
   SELECT column_name, data_type
   FROM information_schema.columns
   WHERE table_name = 'distributors'
   AND column_name LIKE 'activation_code%';
   ```
   Should show: `activation_code`, `activation_code_hash`, `activation_code_expires_at`, `activation_code_created_at`

---

### Step 2: Deploy Edge Functions (10 minutes)

#### Function 1: Admin Function
1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/functions
2. Click on **"admin"** function
3. Click **"Deploy new version"** or **"Edit"**
4. In the editor, replace ALL code with contents from:
   `supabase/functions/admin/index.ts`
5. Click **"Deploy"** or **"Save"**

#### Function 2: Register Distributor
1. Click on **"register-distributor"** function
2. Click **"Deploy new version"** or **"Edit"**
3. Replace code with contents from:
   `supabase/functions/register-distributor/index.ts`
4. Click **"Deploy"** or **"Save"**

#### Function 3: Register Workshop
1. Click on **"register-workshop"** function
2. Click **"Deploy new version"** or **"Edit"**
3. Replace code with contents from:
   `supabase/functions/register-workshop/index.ts`
4. Click **"Deploy"** or **"Save"**

---

### Step 3: Upload Web Admin (5 minutes)

Upload these files to **ives.org.uk/app2026**:

**Changed files:**
- `index.html` (cache version updated)
- `js/pages/distributors.js` (regenerate button added)
- `js/pages/workshops.js` (regenerate button added)

**Using FTP/SFTP:**
```bash
# Example using rsync (adjust for your setup)
cd web-admin
rsync -avz --update \
  index.html \
  js/pages/distributors.js \
  js/pages/workshops.js \
  user@ives.org.uk:/path/to/app2026/
```

---

## Option 2: Using Supabase CLI (If Available)

If you can locate the Supabase CLI binary:

```bash
# Apply migration
/path/to/supabase db push

# Deploy functions
/path/to/supabase functions deploy admin
/path/to/supabase functions deploy register-distributor
/path/to/supabase functions deploy register-workshop
```

**Common CLI locations:**
- `~/.local/bin/supabase`
- `/usr/local/bin/supabase`
- Check: `find ~ -name supabase -type f 2>/dev/null`

---

## ✅ Quick Test After Deployment

### Test 1: Create Distributor (2 minutes)
1. Login to web admin: https://ives.org.uk/app2026
2. Go to **Distributors** page
3. Click **"Create Distributor"**
4. Fill in:
   - Name: "Test Distributor"
   - Countries: GB
5. Click **Create**
6. **✅ Expected:** Modal shows activation code (e.g., `PURE-A3K9-X7M2`)
7. Copy this code for next test
8. Close modal and refresh page
9. Click on the new distributor
10. **✅ Expected:** Shows "Encrypted" instead of plaintext code

### Test 2: Regenerate Code (1 minute)
1. Open the distributor you just created
2. Click **"Regenerate Code"** button
3. Confirm
4. **✅ Expected:** New code shown in modal
5. Try using the OLD code → should fail
6. Try using the NEW code → should work

---

## 🔥 If Something Goes Wrong

### Edge Function Not Deploying?
**Error:** "bcrypt import fails"

**Fix:** Deno will auto-install bcrypt on first run. Just deploy and wait 30 seconds for cold start.

### Migration Fails?
**Error:** "column already exists"

**Fix:** Migration is idempotent (safe to re-run). Just continue - columns won't be duplicated.

### Web Admin Shows Old Version?
**Fix:** Hard refresh browser:
- Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Safari: Cmd+Option+R

---

## 📊 Check Deployment Success

Run these queries in Supabase SQL Editor:

### 1. Verify Migration Applied
```sql
-- Should return 4 rows (4 new columns)
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'distributors'
AND column_name LIKE 'activation_code%';
```

### 2. Check Function Versions
```sql
-- Go to Functions page, check "Last Deployed" timestamp
-- Should be recent (today's date)
```

### 3. Test Registration Endpoint
```bash
# Test with curl (use any existing activation code)
curl -X POST \
  'https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/register-distributor' \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "activation_code": "PURE-TEST-1234"
  }'

# Expected: Either success or "Invalid activation code" (both mean function is running)
```

---

## 📝 After Deployment Checklist

- [ ] Database migration applied successfully
- [ ] All 3 Edge Functions deployed
- [ ] Web admin files uploaded
- [ ] Test 1 (Create distributor) passed
- [ ] Test 2 (Regenerate code) passed
- [ ] Browser hard-refresh done
- [ ] No errors in Supabase Functions logs

---

## 🎯 Next Steps After Deployment

1. **Week 1 (Now):**
   - Monitor for any registration errors
   - Test thoroughly with different scenarios
   - Keep legacy codes working (backward compatible)

2. **Week 2:**
   - Regenerate ALL existing codes via web admin
   - Email new codes to distributors/workshops
   - Monitor adoption

3. **Week 3:**
   - Verify all codes migrated
   - Drop plaintext columns (final cleanup)

---

**Total Time:** ~20 minutes manual deploy
**Files to Deploy:** 8 files (3 Edge Functions, 3 web admin, 1 SQL migration)
**Risk:** Low (backward compatible, can rollback easily)

See **DEPLOYMENT.md** for detailed testing scenarios and monitoring queries.
