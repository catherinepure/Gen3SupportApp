# Session Summary: Security Hardening & Admin-Managed User Creation

**Date:** 2026-02-09 (Session 2)
**Session Focus:** Remove activation codes, implement admin-managed users, bcrypt migration, security hardening
**Previous Session:** `2026-02-09_database-improvements-and-detailmodal.md`

---

## Objectives Completed

### 1. Activation Code System Removed

**Problem:** Distributors and workshops had self-registration via activation codes — complex, insecure, and unnecessary since admins should manage staff accounts.

**Solution:** Replaced with admin-managed user creation.

**Files Removed:**
- `supabase/functions/register-distributor/` (entire Edge Function)
- `supabase/functions/register-workshop/` (entire Edge Function)

**Database Changes (Migration 011):**
- Dropped `activation_code`, `activation_code_hash`, `activation_code_plaintext`, `activation_code_expires_at`, `activation_code_created_at` from `distributors`
- Dropped same columns from `workshops`
- Removed `activation_code_used` from `users`
- Added `created_by UUID` to `users` (tracks who created the account)

**Web Admin Changes:**
- Removed activation code columns/sections from distributors and workshops pages
- Removed `regenerateActivationCode` functions
- Removed `activationCodeSection()` from `detail-modal.js`

**Android App:**
- `RegisterDistributorActivity.java` → Informational screen directing users to contact their admin
- `activity_register_distributor.xml` → Replaced form with info card

---

### 2. Three-Tier Permission System

**Old:** `admin`, `distributor`, `maintenance`, `user`
**New:** `admin`, `manager`, `normal`

**Migration 011 mapping:**
```sql
UPDATE users SET user_level = 'admin' WHERE user_level = 'admin';
UPDATE users SET user_level = 'manager' WHERE user_level IN ('distributor', 'maintenance');
UPDATE users SET user_level = 'normal' WHERE user_level = 'user';
```

**Access control:**
- `admin` — Global access, can create users of any level
- `manager` — Territory-scoped (distributor countries or workshop service area), can create `normal` users only
- `normal` — No admin panel access

**Updated files:**
- `supabase/functions/admin/index.ts` — `authenticateAdmin()` checks new levels
- `web-admin/js/02-api.js` — Login role check uses `admin`/`manager`
- `web-admin/index.html` — User level filter dropdown updated
- `web-admin/js/pages/users.js` — Create/edit forms use new levels

---

### 3. Admin-Managed User Creation

**New `users.create` action in admin Edge Function:**
- Generates bcrypt-hashed temp password
- Creates 72-hour password reset token
- Logs `user_created_by_admin` event
- Returns reset token URL for admin to share with new user
- Permission hierarchy enforced (managers can only create `normal` users)

**Web admin UI:**
- "Create User" button on Users page
- Form: email, name, level, roles, country, distributor, workshop
- On success: shows password reset URL in a modal

---

### 4. Bcrypt Password Migration

**Problem:** All passwords stored as SHA-256 hashes (weak, no salt).

**Solution:** Bcrypt with auto-migration on login.

**Login function (`login/index.ts`):**
```typescript
if (user.password_hash.startsWith('$2')) {
  passwordValid = await bcrypt.compare(password, user.password_hash)
} else {
  const sha256 = await sha256Hash(password)
  passwordValid = sha256 === user.password_hash
  if (passwordValid) needsMigration = true
}
// Auto-migrate on successful login
if (needsMigration) {
  const bcryptHash = await bcrypt.hash(password, await bcrypt.genSalt(10))
  await supabase.from('users').update({ password_hash: bcryptHash }).eq('id', user.id)
}
```

**Updated to bcrypt:**
- `register-user/index.ts`
- `password-reset/index.ts`
- `admin/index.ts` (user creation)

---

### 5. CASCADE Delete Fix (Migration 012)

**Problem:** Several FKs used `ON DELETE CASCADE`, silently destroying audit trails when parent records deleted.

**Fix:**

| Table | FK Column | Old | New | Reason |
|-------|-----------|-----|-----|--------|
| `scooter_telemetry` | `user_id` | CASCADE | SET NULL | Preserve telemetry |
| `scooter_telemetry` | `scooter_id` | CASCADE | SET NULL | Preserve telemetry |
| `scooter_telemetry` | `user_scooter_id` | CASCADE | SET NULL | Preserve telemetry |
| `activity_events` | `user_id` | CASCADE | SET NULL | Preserve audit trail |
| `service_jobs` | `scooter_id` | CASCADE | RESTRICT | Don't delete scooter with jobs |
| `service_jobs` | `workshop_id` | CASCADE | SET NULL | Keep job history |
| `service_jobs` | `customer_id` | CASCADE | SET NULL | Keep job history |
| `service_jobs` | `technician_id` | CASCADE | SET NULL | Keep job history |
| `scooter_batteries` | `scooter_id` | CASCADE | RESTRICT | Don't delete scooter with components |
| `scooter_motors` | `scooter_id` | CASCADE | RESTRICT | Same |
| `scooter_frames` | `scooter_id` | CASCADE | RESTRICT | Same |
| `scooter_controllers` | `scooter_id` | CASCADE | RESTRICT | Same |

---

### 6. Rate Limiting on Admin Edge Function

**Implementation:** In-memory sliding window rate limiter.

- **Limit:** 120 requests/minute per session token
- **Response:** `429 Too Many Requests` with `Retry-After` header
- **Fallback key:** `x-forwarded-for` IP for unauthenticated requests
- **Cleanup:** Stale entries purged every 5 minutes

---

### 7. Session Token Moved to Header

**Before:** Session token sent in POST body alongside resource/action data.
**After:** Session token sent via `X-Session-Token` HTTP header.

**Advantages:**
- Token no longer in request payload (avoids proxy/access log exposure)
- Cleaner separation of auth from business data
- Backward compatible (server accepts both, prefers header)

**Files changed:**
- `web-admin/js/02-api.js` — `call()` and `logout()` send `X-Session-Token` header
- `supabase/functions/admin/index.ts` — Reads from header, falls back to body
- `supabase/functions/logout/index.ts` — Same header support

---

### 8. Origin Validation on Edge Functions

**Implementation:** All auth-related Edge Functions validate `Origin`/`Referer` headers.

**Configuration:** `ALLOWED_ORIGINS` environment variable (comma-separated).
- When not set: allows all origins (dev mode, no breaking change)
- When set: rejects requests from unauthorized origins with `403`
- Mobile apps / server calls (no Origin header): always allowed

**Functions updated:**
- `admin/index.ts`
- `login/index.ts`
- `logout/index.ts`
- `password-reset/index.ts`
- `register-user/index.ts`

**Production deployment:** Set `ALLOWED_ORIGINS=https://ives.org.uk` in Supabase Edge Function secrets.

---

## Files Modified/Created

### Database Migrations
- `supabase/migrations/20260209000011_remove_activation_codes_and_update_user_levels.sql` (NEW)
- `supabase/migrations/20260209000012_fix_cascade_delete_behavior.sql` (NEW)

### Edge Functions
- `supabase/functions/admin/index.ts` (MODIFIED — rate limiting, origin validation, session header, user create, permission levels)
- `supabase/functions/login/index.ts` (MODIFIED — bcrypt + SHA-256 fallback, origin validation)
- `supabase/functions/logout/index.ts` (MODIFIED — session header, origin validation)
- `supabase/functions/password-reset/index.ts` (MODIFIED — bcrypt, origin validation)
- `supabase/functions/register-user/index.ts` (MODIFIED — bcrypt, origin validation)
- `supabase/functions/register-distributor/` (DELETED)
- `supabase/functions/register-workshop/` (DELETED)

### Web Admin
- `web-admin/index.html` (MODIFIED — user level filters, create button)
- `web-admin/js/02-api.js` (MODIFIED — session header, role check)
- `web-admin/js/pages/users.js` (MODIFIED — createUser function, edit form levels)
- `web-admin/js/pages/distributors.js` (MODIFIED — removed activation code UI)
- `web-admin/js/pages/workshops.js` (MODIFIED — removed activation code UI)
- `web-admin/js/components/detail-modal.js` (MODIFIED — removed activationCodeSection)

### Android App
- `app/src/main/java/com/pure/gen3firmwareupdater/RegisterDistributorActivity.java` (REWRITTEN)
- `app/src/main/res/layout/activity_register_distributor.xml` (REWRITTEN)

---

## Deployment Checklist

### Database
```bash
# Apply migrations in order
supabase db push
# Or manually:
# Migration 011: Remove activation codes, update user levels
# Migration 012: Fix CASCADE delete behavior
```

### Edge Functions
```bash
supabase functions deploy admin
supabase functions deploy login
supabase functions deploy logout
supabase functions deploy password-reset
supabase functions deploy register-user
# Delete old functions:
supabase functions delete register-distributor
supabase functions delete register-workshop
```

### Environment Variables (for production)
```bash
# Set allowed origins for CORS/origin validation
supabase secrets set ALLOWED_ORIGINS=https://ives.org.uk
```

### Web Admin
Deploy updated files to web host (all JS/HTML files listed above).

---

## Testing Checklist

### Authentication
- [ ] Login with existing SHA-256 password → auto-migrates to bcrypt
- [ ] Login after migration → bcrypt works
- [ ] Manager login → gets admin panel access
- [ ] Normal user login → rejected from admin panel
- [ ] Password reset → new password stored as bcrypt

### User Management
- [ ] Admin creates user → gets password reset token
- [ ] Manager creates normal user → succeeds
- [ ] Manager creates admin user → rejected
- [ ] Created user sets password via reset link → can log in

### Security
- [ ] Rate limit: >120 requests/minute → 429 response
- [ ] Origin validation: request from unlisted origin → 403 (when ALLOWED_ORIGINS set)
- [ ] Session token in header → works
- [ ] Session token in body (legacy) → still works
- [ ] Delete scooter with service jobs → RESTRICT prevents it
- [ ] Delete user → telemetry/events preserved with NULL user_id

### Web Admin UI
- [ ] Distributors page → no activation code column/section
- [ ] Workshops page → no activation code column/section
- [ ] Users page → Create User button works
- [ ] Users page → user level filter shows normal/manager/admin

---

## Summary

All security recommendations implemented:
1. Activation codes removed, replaced with admin-managed user creation
2. Three-tier permission system (admin/manager/normal)
3. Bcrypt password hashing with SHA-256 auto-migration
4. CASCADE deletes fixed on audit/history tables
5. Rate limiting (120 req/min) on admin API
6. Session token moved from body to X-Session-Token header
7. Origin validation on all auth Edge Functions (configurable via ALLOWED_ORIGINS env var)
