# Activation Codes Testing Checklist

**Date:** 2026-02-09
**Status:** Ready for Testing

---

## ✅ What's Been Fixed

1. **"worker not defined" error** - Switched to bcryptjs (pure JS, no workers)
2. **Activation codes visible** - Now stored as plaintext for admin viewing
3. **Both distributors AND workshops** - Same functionality

---

## 🧪 Testing Steps

### Prerequisites
Run this SQL in Supabase Dashboard first:
```sql
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS activation_code_plaintext TEXT;
ALTER TABLE workshops ADD COLUMN IF NOT EXISTS activation_code_plaintext TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_distributors_activation_code_plaintext
  ON distributors(activation_code_plaintext)
  WHERE activation_code_plaintext IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_activation_code_plaintext
  ON workshops(activation_code_plaintext)
  WHERE activation_code_plaintext IS NOT NULL;
```

**Go to:** https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/sql/new

---

### Test 1: Create New Distributor

1. Go to https://ives.org.uk/app2026
2. Login as admin
3. Navigate to **Distributors** page
4. Click **"Create Distributor"** button
5. Fill in:
   - Name: `Test Distributor ${Date.now()}`
   - Email: `test@example.com`
   - Phone: `+44 123 456789`
   - Countries: Select **GB, DE, FR**
6. Click **Submit**

**Expected Results:**
- ✅ No "worker not defined" error
- ✅ Modal shows: "Activation Code Generated"
- ✅ Code displayed: `PURE-XXXX-XXXX` format
- ✅ Success toast appears

**If Failed:**
- ❌ "worker not defined" → bcryptjs not deployed properly
- ❌ No modal → check browser console for errors
- ❌ No code → backend not returning `activation_code`

---

### Test 2: View Distributor Activation Code

1. In Distributors table, **click on the row** you just created
2. Detail modal opens

**Expected Results:**
- ✅ Green box shows: `PURE-XXXX-XXXX`
- ✅ Message: "Share this code with the distributor for registration"
- ✅ Created date shown
- ✅ Expires date shown with "Valid" badge

**If Failed:**
- ❌ Shows "Secured" instead → `activation_code_plaintext` is NULL (run migration SQL)
- ❌ No code section → UI not updated

---

### Test 3: Regenerate Distributor Code

1. In the detail modal, click **"Regenerate Code"** button
2. Confirm the dialog

**Expected Results:**
- ✅ No "worker not defined" error
- ✅ New modal shows: "New Activation Code Generated"
- ✅ NEW code displayed (different from original)
- ✅ Yellow warning box
- ✅ Message: "Save this code immediately!"

**Then:**
3. Close modal
4. Click distributor row again
5. Detail modal opens

**Expected Results:**
- ✅ Green box shows the NEW code
- ✅ Created timestamp updated
- ✅ Expires date reset to 90 days from now

---

### Test 4: Create New Workshop

1. Navigate to **Workshops** page
2. Click **"Create Workshop"** button
3. Fill in:
   - Name: `Test Workshop ${Date.now()}`
   - Email: `workshop@example.com`
   - Phone: `+44 987 654321`
   - Parent Distributor: Select one (or leave as Independent)
   - Service Area Countries: Select **GB, IE, DE**
4. Click **Submit**

**Expected Results:**
- ✅ No "worker not defined" error
- ✅ Modal shows: "Activation Code Generated"
- ✅ Code displayed: `WORK-XXXX-XXXX` format
- ✅ Success toast appears

---

### Test 5: View Workshop Activation Code

1. In Workshops table, **click on the row** you just created
2. Detail modal opens

**Expected Results:**
- ✅ Green box shows: `WORK-XXXX-XXXX`
- ✅ Message: "Share this code with the workshop for registration"
- ✅ Created date shown
- ✅ Expires date shown with "Valid" badge

---

### Test 6: Regenerate Workshop Code

1. In the detail modal, click **"Regenerate Code"** button
2. Confirm the dialog

**Expected Results:**
- ✅ No "worker not defined" error
- ✅ New modal shows: "New Activation Code Generated"
- ✅ NEW code displayed: `WORK-YYYY-ZZZZ`
- ✅ Yellow warning box

**Then:**
3. Close modal
4. Click workshop row again
5. Detail modal shows NEW code

---

### Test 7: Edit Multi-Country Support

**For Distributor:**
1. Click distributor row → detail modal
2. Click **"Edit Distributor"** button
3. In Countries field, select 5 different countries (hold Ctrl/Cmd)
4. Click **Save**

**Expected Results:**
- ✅ Success toast
- ✅ Detail modal shows all 5 countries in Territory Coverage
- ✅ Table view shows comma-separated list

**For Workshop:**
1. Click workshop row → detail modal
2. Click **"Edit Workshop"** button
3. In Service Area Countries, select 4 countries
4. Click **Save**

**Expected Results:**
- ✅ Success toast
- ✅ Detail modal shows all 4 countries in Service Coverage

---

### Test 8: Old Entities (Created Before Plaintext)

**If you have OLD distributors/workshops:**
1. Click on an old entity row
2. Detail modal opens

**Expected Results:**
- ⚠️ Shows: "Code was created before plaintext storage"
- ⚠️ Message: "Use 'Regenerate Code' button below to create a new one"
- ✅ Has "Regenerate Code" button

**Then:**
3. Click "Regenerate Code"
4. Confirm
5. New code generated and stored as plaintext
6. Click row again → now shows green code box ✅

---

## 🐛 Common Issues

### Issue: "worker not defined"
**Cause:** bcrypt library using workers
**Fix:** Already deployed bcryptjs - clear browser cache, hard refresh (Ctrl+Shift+R)

### Issue: Codes not showing (shows "Secured")
**Cause:** Database migration not run
**Fix:** Run the SQL migration above in Supabase Dashboard

### Issue: Create works but regenerate fails
**Cause:** Edge Function not deployed
**Fix:** All 3 functions deployed (admin, register-distributor, register-workshop)

### Issue: Countries not saving
**Cause:** Array conversion issue
**Fix:** Already fixed in both JS files

---

## 📊 Current Deployment Status

**Database:**
- ⏳ Migration SQL needs to be run manually (see Prerequisites above)

**Backend (Edge Functions):**
- ✅ admin - Deployed with bcryptjs
- ✅ register-distributor - Deployed with bcryptjs
- ✅ register-workshop - Deployed with bcryptjs

**Frontend (Web Admin):**
- ✅ index.html - Cache v=20260209-6
- ✅ distributors.js - Shows plaintext codes
- ✅ workshops.js - Shows plaintext codes

---

## 🎯 Expected Behavior Summary

| Action | What Happens |
|--------|--------------|
| **Create distributor/workshop** | Modal shows code once, then stored as plaintext |
| **View detail modal** | Green box shows plaintext code anytime |
| **Regenerate code** | New code generated, old invalidated, shown once then stored |
| **Edit countries** | Multi-select works, saved as array |
| **Mobile app registration** | Validates against bcrypt hash (not plaintext) |

---

## ✅ Success Criteria

All tests pass:
- ✅ No "worker not defined" errors
- ✅ Codes visible in detail modals
- ✅ Regenerate works without errors
- ✅ Multi-country selection works
- ✅ Same behavior for distributors and workshops

---

**Tester:** Catherine Ives
**Environment:** Production (ives.org.uk/app2026)
**Browser:** Chrome (recommended), clear cache before testing
