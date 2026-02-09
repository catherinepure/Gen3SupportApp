# 🎉 Secure Activation Codes - DEPLOYMENT COMPLETE

**Date:** 2026-02-09  
**Feature:** Secure activation codes with bcrypt hashing for distributors and workshops

---

## ✅ What Was Deployed

### 1. Database Migration
**File:** `supabase/migrations/20260209000002_secure_activation_codes.sql`  
**Status:** ✅ Deployed to Supabase  
**Changes:**
- Added `activation_code_hash` columns to distributors and workshops tables
- Added `activation_code_expires_at` for 90-day expiry
- Added `activation_code_created_at` for tracking
- Added `activation_code_used_at` to users table
- All columns properly indexed and constrained

### 2. Edge Functions
**Status:** ✅ All 3 functions deployed to Supabase

#### admin (index.ts)
- Added bcrypt utilities for hashing/verification
- New action: `regenerate-code` for distributors
- New action: `regenerate-code` for workshops
- Updated create actions to return plaintext code once, then hash
- 90-day expiry on all new codes

#### register-distributor (index.ts)
- Upgraded password hashing from SHA-256 to bcrypt
- Dual-mode validation: checks hashed codes first, falls back to legacy plaintext
- Validates expiry dates on hashed codes
- Backward compatible during migration period

#### register-workshop (index.ts)
- Same updates as register-distributor
- Dual-mode validation for workshops
- Bcrypt password hashing

### 3. Web Admin Files
**Status:** ✅ Uploaded to ives.org.uk/app2026

#### index.html
- Cache version bumped to v=20260209-3

#### js/pages/distributors.js
- Shows "Encrypted" badge instead of plaintext codes
- Displays code creation date and expiry status
- "Regenerate Code" button with modal display
- Shows new code once in large, copy-friendly format

#### js/pages/workshops.js
- Same updates as distributors.js
- Consistent UI/UX across both pages

---

## 🔐 Security Improvements

1. **Bcrypt Hashing:** Activation codes now hashed with 10 rounds (was plaintext)
2. **Password Security:** User passwords now use bcrypt with salt (was unsalted SHA-256)
3. **Code Expiry:** All codes expire after 90 days (configurable)
4. **One-Time Display:** New codes shown once, then encrypted forever
5. **Regeneration:** Compromised codes can be regenerated instantly
6. **Audit Trail:** Tracks when codes created and when used

---

## 🛠️ Tools & Setup

### Required Tools (Now Installed)
- ✅ **Homebrew** (package manager)
- ✅ **Node.js v20.20.0** (was v18.18.2)
- ✅ **npm v10.8.2** (was v9.8.1)
- ✅ **Supabase CLI v2.76.6** (via npx)

### Credentials Stored in .env
```bash
SUPABASE_URL=https://hhpxmlrpdharhhzwjxuc.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...
SUPABASE_ACCESS_TOKEN=sbp_b12b2af971c591f407ccccc515d9a2f5f2be008b
```

### FTP Credentials (in .ftp-credentials)
```bash
FTP_HOST=217.194.210.33
FTP_USER=susieive
FTP_PASS='jcjlb12rEl$eg00d'
FTP_PATH=/httpdocs/app2026
```

---

## 📝 How to Deploy Future Updates

### Database Migrations
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
export SUPABASE_ACCESS_TOKEN=sbp_b12b2af971c591f407ccccc515d9a2f5f2be008b
npx supabase db push
```

### Edge Functions
```bash
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
export SUPABASE_ACCESS_TOKEN=sbp_b12b2af971c591f407ccccc515d9a2f5f2be008b
npx supabase functions deploy <function-name> --project-ref hhpxmlrpdharhhzwjxuc
```

### Web Admin Files
```bash
cd web-admin
./deploy.sh all                    # Deploy everything
./deploy.sh index.html             # Deploy specific file
./deploy.sh js/pages/users.js      # Deploy with path
```

---

## 🧪 Testing Checklist

- [ ] Create new distributor → see activation code once
- [ ] Refresh page → code shows as "Encrypted"
- [ ] Click "Regenerate Code" → see new code, expiry reset
- [ ] Register user with new code → should work
- [ ] Try expired code → should fail
- [ ] Check users table → activation_code_used_at populated
- [ ] Same tests for workshops

---

## 📊 Migration Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ Complete | All columns added |
| Edge Functions | ✅ Complete | All 3 functions updated |
| Web admin UI | ✅ Complete | All files uploaded |
| Android app | ⏳ Pending | Will automatically use new bcrypt validation |
| Legacy codes | ✅ Supported | Dual-mode validation active |

---

## 🔄 Backward Compatibility

- **Legacy plaintext codes** still work (dual-mode validation)
- **Old password hashes** don't need migration (bcrypt handles comparison)
- **Android app** doesn't need updates (server-side change only)
- **Migration period:** Can run indefinitely, no forced migration

---

## 🎯 Next Steps (Optional)

1. Monitor usage for 1-2 weeks
2. Regenerate all legacy plaintext codes via admin panel
3. Remove plaintext `activation_code` columns (after all codes hashed)
4. Update documentation for distributors/workshops
5. Consider shortening expiry to 30 days for higher security

---

**Deployment Dashboard:**  
https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc

**Live Web Admin:**  
https://ives.org.uk/app2026

**Git Commit:**  
74ab185 "Implement secure activation codes with bcrypt hashing"
