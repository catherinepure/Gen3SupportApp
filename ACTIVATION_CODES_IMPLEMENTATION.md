# Activation Codes Implementation Guide

**Date:** 2026-02-09
**Status:** ✅ Backend Complete, SQL Migration Pending

---

## Overview

Implemented unique activation code system for distributors and workshops. Each organization gets a unique code that staff must use during registration to be automatically assigned to the correct organization.

---

## Database Schema Changes

### SQL Migration Required

**File:** `sql/006_workshop_activation_codes.sql`

**Apply this SQL manually in Supabase Dashboard:**
1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/sql
2. Click "New Query"
3. Copy and paste the SQL below
4. Click "Run"

```sql
-- Migration: Add activation codes for workshops
-- Date: 2026-02-09
-- Purpose: Enable workshop staff to register using unique activation codes

-- Add activation_code to workshops table
ALTER TABLE workshops
ADD COLUMN IF NOT EXISTS activation_code TEXT UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_workshops_activation_code
ON workshops(activation_code)
WHERE activation_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN workshops.activation_code IS 'Unique code for workshop staff registration (format: WORK-XXXX-XXXX)';

-- Generate activation codes for existing workshops that don't have one
-- Using format WORK-XXXX-XXXX (similar to distributor codes but with WORK prefix)
UPDATE workshops
SET activation_code = 'WORK-' ||
  upper(substring(md5(random()::text || id::text) from 1 for 4)) || '-' ||
  upper(substring(md5(random()::text || id::text || now()::text) from 1 for 4))
WHERE activation_code IS NULL;

-- Update users table to track which activation code was used
ALTER TABLE users
ADD COLUMN IF NOT EXISTS workshop_activation_code_used TEXT;

COMMENT ON COLUMN users.workshop_activation_code_used IS 'Activation code used during workshop staff registration';
```

---

## Activation Code Formats

### Distributors
- **Format:** `PURE-XXXX-XXXX`
- **Example:** `PURE-A3K9-X7M2`
- **Table:** `distributors.activation_code` (UNIQUE constraint)
- **Characters:** Uppercase alphanumeric (A-Z, 0-9)

### Workshops
- **Format:** `WORK-XXXX-XXXX`
- **Example:** `WORK-B5T8-M4N7`
- **Table:** `workshops.activation_code` (UNIQUE constraint)
- **Characters:** Uppercase alphanumeric (A-Z, 0-9)

---

## How It Works

### 1. Organization Creation

**When creating a distributor:**
- Admin creates distributor in web admin dashboard
- Backend generates unique `PURE-XXXX-XXXX` code
- Code is displayed to admin immediately after creation
- Code is stored in `distributors.activation_code`

**When creating a workshop:**
- Admin creates workshop in web admin dashboard
- Backend generates unique `WORK-XXXX-XXXX` code
- Code is displayed to admin immediately after creation
- Code is stored in `workshops.activation_code`

### 2. Staff Registration

**Distributor staff registration:**
1. Staff member uses mobile app or web registration
2. Selects "Register as Distributor Staff"
3. Enters email, password, and activation code
4. Backend validates code via `/functions/v1/register-distributor`
5. User is created with:
   - `user_level: 'distributor'`
   - `roles: ['distributor_staff']`
   - `distributor_id: [matched from code]`
   - `activation_code_used: [the code they entered]`
6. Verification email sent

**Workshop staff registration:**
1. Staff member uses mobile app or web registration
2. Selects "Register as Workshop Staff"
3. Enters email, password, and activation code
4. Backend validates code via `/functions/v1/register-workshop`
5. User is created with:
   - `user_level: 'maintenance'`
   - `roles: ['workshop_staff']`
   - `workshop_id: [matched from code]`
   - `distributor_id: [parent distributor if workshop is linked]`
   - `workshop_activation_code_used: [the code they entered]`
6. Verification email sent

### 3. Validation Rules

**Both endpoints validate:**
- ✅ Code exists in database
- ✅ Organization is active (`is_active = true`)
- ✅ Code matches case-insensitively (user can enter lowercase)
- ✅ Email not already registered
- ✅ Password minimum 8 characters

**Security:**
- Codes are unique per organization
- Cannot register without valid code
- Audit trail tracks which code was used
- Only active organizations can register staff

---

## Backend Implementation

### Edge Functions Deployed

**1. `/functions/v1/register-distributor`** ✅ Already existed
- Validates `PURE-XXXX-XXXX` codes
- Creates distributor staff users
- Sends verification email

**2. `/functions/v1/register-workshop`** ✅ Newly created
- Validates `WORK-XXXX-XXXX` codes
- Creates workshop staff users
- Inherits parent distributor if workshop is linked
- Sends verification email

**3. `/functions/v1/admin`** ✅ Updated
- `distributors/create` action generates `PURE-XXXX-XXXX` code
- `workshops/create` action generates `WORK-XXXX-XXXX` code

---

## Testing

### Test Distributor Activation Code

After applying the SQL migration, existing distributors will have codes. Create a new test distributor:

```javascript
// Via web admin
POST /functions/v1/admin
{
  "resource": "distributors",
  "action": "create",
  "session_token": "[your token]",
  "name": "Test Distributor",
  "countries": ["US"],
  "email": "test@example.com",
  "phone": "+1 555-0100"
}

// Response will include activation_code
```

### Test Workshop Activation Code

After applying the SQL migration, create a new test workshop:

```javascript
// Via web admin
POST /functions/v1/admin
{
  "resource": "workshops",
  "action": "create",
  "session_token": "[your token]",
  "name": "Test Workshop",
  "service_area_countries": ["US"],
  "email": "workshop@example.com",
  "phone": "+1 555-0200"
}

// Response will include activation_code
```

### Test Registration

**Test distributor staff registration:**
```bash
curl -X POST https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/register-distributor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "staff@test.com",
    "password": "testpass123",
    "activation_code": "PURE-XXXX-XXXX",
    "first_name": "Test",
    "last_name": "Staff"
  }'
```

**Test workshop staff registration:**
```bash
curl -X POST https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/register-workshop \
  -H "Content-Type: application/json" \
  -d '{
    "email": "mechanic@test.com",
    "password": "testpass123",
    "activation_code": "WORK-XXXX-XXXX",
    "first_name": "Test",
    "last_name": "Mechanic"
  }'
```

---

## Web Admin Changes Needed

The web admin dashboard already shows activation codes when creating distributors. After applying the SQL migration, it will also show codes when creating workshops.

**No code changes needed** - the backend already returns the `activation_code` in the response.

---

## Audit Trail

All registrations are logged in `user_audit_log`:

```sql
-- Distributor staff registration
INSERT INTO user_audit_log (user_id, action, details) VALUES
  ('[user_id]', 'distributor_registration', {
    "distributor_name": "Test Distributor",
    "activation_code": "PURE-XXXX-XXXX"
  });

-- Workshop staff registration
INSERT INTO user_audit_log (user_id, action, details) VALUES
  ('[user_id]', 'workshop_staff_registration', {
    "workshop_name": "Test Workshop",
    "activation_code": "WORK-XXXX-XXXX",
    "parent_distributor_id": "[id or null]"
  });
```

---

## Summary

✅ **Implemented:**
- Unique activation codes for distributors (PURE-XXXX-XXXX)
- Unique activation codes for workshops (WORK-XXXX-XXXX)
- Registration endpoints validate codes
- Automatic org assignment on registration
- Audit logging
- Email verification flow

⚠️ **Pending:**
- Apply SQL migration manually in Supabase Dashboard
- Test registration flow with mobile app

🎯 **Next Steps:**
1. Apply SQL migration from this document
2. Test creating distributor/workshop in web admin
3. Test staff registration with activation codes
4. Update mobile app to include registration UI
