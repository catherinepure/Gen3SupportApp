# Scooter PIN Management System

**Status:** Schema ready, awaiting deployment
**Security Level:** High (AES-256 encryption)

---

## Overview

Each scooter can have a unique 6-digit PIN set by the owner. PINs are stored encrypted and can be recovered by the owner or manufacturer admins for customer support.

## Data Model

**Storage:** `scooters` table with encrypted PIN columns

| Column | Type | Purpose |
|--------|------|---------|
| pin_encrypted | TEXT | AES-256 encrypted PIN (base64 encoded) |
| pin_set_at | TIMESTAMPTZ | When PIN was last set |
| pin_set_by_user_id | UUID | Who set the PIN (FK to users) |

**Encryption:** PostgreSQL `pgcrypto` with symmetric encryption
**Key Storage:** Environment variable `PIN_ENCRYPTION_KEY`

---

## Security Architecture

### Encryption Flow

```
User enters PIN (123456)
         ↓
Edge Function validates format
         ↓
Call set_scooter_pin(scooter_id, '123456', user_id, key)
         ↓
pgp_sym_encrypt('123456', key) → encrypted bytes
         ↓
base64 encode → stored in database
```

### Decryption Flow

```
User requests PIN retrieval
         ↓
Edge Function checks authorization (owner or manufacturer_admin)
         ↓
Call get_scooter_pin(scooter_id, key)
         ↓
base64 decode → encrypted bytes
         ↓
pgp_sym_decrypt(bytes, key) → '123456'
         ↓
Return PIN to authorized user
```

### Access Control

| Role | Set PIN | View PIN | Reset PIN |
|------|---------|----------|-----------|
| Scooter Owner | ✅ | ✅ | ✅ |
| Manufacturer Admin | ✅ | ✅ | ✅ |
| Distributor Manager | ❌ | ❌ | ❌ |
| Workshop Staff | ❌ | ❌ | ❌ |
| Regular User | Only own scooters | Only own scooters | Only own scooters |

---

## Database Functions

### set_scooter_pin()

**Purpose:** Encrypt and store a 6-digit PIN

**Signature:**
```sql
set_scooter_pin(
  p_scooter_id UUID,
  p_pin TEXT,
  p_user_id UUID,
  p_encryption_key TEXT
) RETURNS VOID
```

**Validation:**
- PIN must be exactly 6 digits (`^\d{6}$`)
- Scooter must exist
- Raises exception on validation failure

**Side Effects:**
- Updates `pin_encrypted`, `pin_set_at`, `pin_set_by_user_id`
- Updates `updated_at` timestamp

---

### get_scooter_pin()

**Purpose:** Decrypt and return a scooter PIN

**Signature:**
```sql
get_scooter_pin(
  p_scooter_id UUID,
  p_encryption_key TEXT
) RETURNS TEXT
```

**Returns:**
- Decrypted 6-digit PIN as TEXT
- NULL if no PIN is set
- Raises exception on decryption failure

**Security:**
- Only callable by service_role (Edge Functions)
- Authorization checked in Edge Function before calling

---

### clear_scooter_pin()

**Purpose:** Remove PIN from scooter

**Signature:**
```sql
clear_scooter_pin(
  p_scooter_id UUID
) RETURNS VOID
```

**Side Effects:**
- Sets `pin_encrypted`, `pin_set_at`, `pin_set_by_user_id` to NULL
- Updates `updated_at` timestamp

---

## Admin View

### scooter_pin_status

**Purpose:** Show PIN status without exposing encrypted values

**Columns:**
- `id` - Scooter UUID
- `zyd_serial` - Serial number
- `owner_id` - Current owner
- `pin_status` - 'set' or 'not_set'
- `pin_set_at` - When PIN was set
- `pin_set_by_user_id` - Who set it

**Usage:**
```sql
-- Check if PIN is set for a scooter
SELECT pin_status FROM scooter_pin_status WHERE zyd_serial = 'ZYD_1234567';

-- List all scooters with PINs
SELECT * FROM scooter_pin_status WHERE pin_status = 'set';
```

---

## Edge Function API

### Endpoint: POST /admin (action: set-pin)

**Request:**
```json
{
  "resource": "scooter-pins",
  "action": "set-pin",
  "scooter_id": "uuid",
  "pin": "123456"
}
```

**Authorization:**
- User must be scooter owner OR manufacturer_admin
- Returns 403 if unauthorized

**Response:**
```json
{
  "success": true,
  "message": "PIN set successfully"
}
```

**Validation:**
- PIN must be exactly 6 digits
- Scooter must exist
- Returns 400 on validation failure

**Audit Log:**
- Action: 'set-pin'
- Resource: 'scooters'
- Changes: {"message": "PIN set/updated"}

---

### Endpoint: POST /admin (action: get-pin)

**Request:**
```json
{
  "resource": "scooter-pins",
  "action": "get-pin",
  "scooter_id": "uuid"
}
```

**Authorization:**
- User must be scooter owner OR manufacturer_admin
- Returns 403 if unauthorized

**Response:**
```json
{
  "pin": "123456"
}
```

**Error Responses:**
- 404 if no PIN is set
- 500 if decryption fails

**Audit Log:**
- Action: 'retrieve-pin'
- Resource: 'scooters'
- Changes: {"message": "PIN retrieved", "retrieved_by": "user@example.com"}

---

### Endpoint: POST /admin (action: reset-pin)

**Request:**
```json
{
  "resource": "scooter-pins",
  "action": "reset-pin",
  "scooter_id": "uuid"
}
```

**Authorization:**
- Manufacturer_admin only
- Returns 403 if unauthorized

**Response:**
```json
{
  "success": true,
  "message": "PIN reset successfully"
}
```

**Behavior:**
- Clears existing PIN
- Notifies owner via email/SMS (future enhancement)

---

## User Flows

### Setting PIN (Owner)

1. **Flutter App:**
   - User navigates to "My Scooter" > "Set PIN"
   - Enters 6-digit PIN
   - Confirms PIN (enter twice)

2. **Validation:**
   - Must be exactly 6 digits
   - Both entries must match
   - No common patterns (111111, 123456, etc.) - client-side warning

3. **API Call:**
   ```dart
   POST /admin
   {
     "resource": "scooter-pins",
     "action": "set-pin",
     "scooter_id": "uuid",
     "pin": "123456"
   }
   ```

4. **Success:**
   - Show confirmation: "PIN set successfully"
   - Display warning: "Keep your PIN safe. You'll need it to unlock your scooter."

---

### Viewing PIN (Owner)

1. **Flutter App:**
   - User navigates to "My Scooter" > "View PIN"
   - Shows biometric/password confirmation dialog

2. **After Confirmation:**
   - API call to retrieve PIN
   - Display PIN for 10 seconds
   - Option to copy to clipboard
   - Warning: "Don't share your PIN with anyone"

3. **API Call:**
   ```dart
   POST /admin
   {
     "resource": "scooter-pins",
     "action": "get-pin",
     "scooter_id": "uuid"
   }
   ```

---

### Admin PIN Reset (Customer Support)

1. **Web Admin:**
   - Navigate to scooter details
   - See "PIN Status: Set" (no actual PIN visible)
   - Click "Reset PIN" button

2. **Confirmation Dialog:**
   - "Are you sure you want to reset the PIN for scooter ZYD_1234567?"
   - "The owner will need to set a new PIN."

3. **After Reset:**
   - PIN cleared from database
   - Email sent to owner: "Your scooter PIN has been reset by customer support"
   - Owner must set new PIN to unlock scooter

---

## Web Admin UI

### Scooters Page Enhancement

**Table Column Addition:**
- New column: "PIN Status"
- Values: "Set" (green badge) or "Not Set" (gray badge)
- Not clickable (no PIN visible in table)

**Detail Modal Addition:**
- Section: "Security"
- Field: "PIN Status" - "Set" or "Not Set"
- Field: "PIN Set On" - Timestamp
- Field: "PIN Set By" - User name/email
- Button: "Reset PIN" (manufacturer_admin only)

---

## Security Considerations

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Database breach | PINs encrypted, key not in database |
| Service role key leak | Key rotation process, monitoring |
| Man-in-middle attack | HTTPS enforced, JWT tokens |
| Brute force PIN attempts | Rate limiting (3 attempts per 15 min) |
| Unauthorized PIN viewing | Role-based access control, audit logging |
| Key exposure in logs | Never log encryption key or decrypted PINs |

### Best Practices

1. **Never log PINs** - Not in encrypted or decrypted form
2. **Audit all operations** - Track every PIN set/view/reset
3. **Rate limit requests** - Prevent brute force attacks
4. **Rotate encryption key** - Annual rotation recommended
5. **Monitor access patterns** - Alert on suspicious activity

---

## Testing

### Manual Test Cases

**Test 1: Set PIN**
```sql
SELECT set_scooter_pin(
  'scooter-uuid',
  '123456',
  'user-uuid',
  'teV35CqVYIiqUOp1GknShv9JTtdySnfYuA0+R7NPBhk='
);
```
Expected: No error, pin_encrypted populated

**Test 2: Get PIN**
```sql
SELECT get_scooter_pin(
  'scooter-uuid',
  'teV35CqVYIiqUOp1GknShv9JTtdySnfYuA0+R7NPBhk='
);
```
Expected: Returns '123456'

**Test 3: Invalid PIN Format**
```sql
SELECT set_scooter_pin(
  'scooter-uuid',
  '12345', -- Only 5 digits
  'user-uuid',
  'key'
);
```
Expected: Exception raised

**Test 4: Clear PIN**
```sql
SELECT clear_scooter_pin('scooter-uuid');
```
Expected: No error, pin_encrypted = NULL

**Test 5: PIN Status View**
```sql
SELECT * FROM scooter_pin_status WHERE pin_status = 'set';
```
Expected: Returns scooters with PINs, no encrypted values visible

---

## Future Enhancements

1. **PIN Expiry** - Optional expiry after 1 year, force reset
2. **PIN History** - Track previous PINs, prevent reuse
3. **Multi-Factor Auth** - Require biometric + PIN for high-value operations
4. **Emergency Override** - Factory master PIN for lost devices
5. **PIN Sharing** - Temporary PINs for rentals/sharing
6. **SMS/Email Notifications** - Alert owner on PIN changes
7. **Geofencing** - PIN required only outside home zone

---

## Deployment Checklist

- [ ] Deploy SQL migration (009_scooter_pins.sql)
- [ ] Set PIN_ENCRYPTION_KEY in Supabase Edge Function secrets
- [ ] Update admin Edge Function with PIN endpoints
- [ ] Add PIN management UI to web admin
- [ ] Test encryption/decryption end-to-end
- [ ] Update DATABASE_SCHEMA.md
- [ ] Add PIN set/view/reset to Flutter app
- [ ] Document key rotation procedure

---

**Last Updated:** 2026-02-10
**Status:** Ready for deployment
**Security Review:** Pending first production use
