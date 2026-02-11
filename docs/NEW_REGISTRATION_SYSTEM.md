# New User Registration System - Complete Guide

## Overview

Two separate registration flows:
1. **User Registration** - Register with a scooter (capture telemetry)
2. **Distributor Registration** - Register with activation code (no scooter needed)

## Registration Flows

### User Registration Flow
```
1. Connect to scooter via BLE
2. App captures telemetry (odometer, battery, versions, etc.)
3. Click "Register as User"
4. Enter email + password
5. (Optional) Enter profile details
6. Send verification email
7. User clicks link in email
8. Registration complete → Scooter linked to account
9. User can login and upload firmware
```

### Distributor Registration Flow
```
1. Click "Register as Distributor"
2. Enter email + password
3. Enter activation code (from admin)
4. (Optional) Enter profile details
5. Send verification email
6. User clicks link in email
7. Registration complete → Distributor access granted
8. User can login and manage scooters
```

## Database Schema

### New/Updated Tables

**users** table:
- Profile fields: `first_name`, `last_name`, `age_range`, `gender`, `scooter_use_type`
- Access: `user_level` (user/distributor/maintenance/admin)
- Registration: `registration_type` (user/distributor), `activation_code_used`

**user_scooters** table (many-to-many):
- Links users to their scooters
- Captures initial telemetry at registration
- Tracks which is primary scooter
- Allows user-assigned nicknames

**scooter_telemetry** table:
- Historical telemetry snapshots
- Captured each time user connects
- Stores: odometer, battery SOC, charge cycles, faults, config data

### Profile Options

**Age Range:**
- `<18`, `18-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65+`

**Gender:**
- `Male`, `Female`, `Other`, `Prefer not to say`

**Scooter Use:**
- `Business`, `Pleasure`, `Both`

## Telemetry Captured

When user registers or connects to scooter:
- Odometer (km)
- Battery State of Charge (%)
- Charge cycles
- Discharge cycles
- Battery voltage
- Controller HW/SW versions
- BMS HW/SW versions
- Fault codes (if any)
- Config data from 0x01 packet

## Edge Functions

### `/register-user` (POST)
Register as a user with scooter

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "first_name": "John",
  "last_name": "Doe",
  "age_range": "25-34",
  "gender": "Male",
  "scooter_use_type": "Pleasure",
  "scooter_serial": "ZYD-12345",
  "telemetry": {
    "odometer_km": 1250.5,
    "battery_soc": 85,
    "charge_cycles": 45,
    "discharge_cycles": 50,
    "controller_hw_version": "V5.9",
    "controller_sw_version": "V2.78",
    "bms_hw_version": "V3.2",
    "bms_sw_version": "V1.5"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "user_id": "uuid-here"
}
```

### `/register-distributor` (POST)
Register as distributor with activation code

**Request:**
```json
{
  "email": "distributor@example.com",
  "password": "password123",
  "activation_code": "DIST-ABC-123",
  "first_name": "Jane",
  "last_name": "Smith",
  "age_range": "35-44",
  "gender": "Female"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Distributor registration successful. Please check your email to verify your account.",
  "user_id": "uuid-here",
  "distributor_name": "Pure Electric London"
}
```

### `/login` (POST) - UPDATED
Now returns user level and scooters

**Response:**
```json
{
  "success": true,
  "session_token": "token-here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "user_level": "user",
    "distributor_id": null,
    "first_name": "John",
    "last_name": "Doe",
    "scooters": [
      {
        "user_scooter_id": "uuid",
        "scooter_id": "uuid",
        "zyd_serial": "ZYD-12345",
        "nickname": "My Scooter",
        "is_primary": true,
        "registered_at": "2026-02-05T...",
        "last_connected_at": "2026-02-05T...",
        "initial_odometer_km": 1250.5,
        "controller_hw_version": "V5.9",
        "controller_sw_version": "V2.78"
      }
    ]
  }
}
```

## User Levels & Permissions

| Level | Registration | Can Register Scooters | Can Upload Firmware | Can Reset PINs | Can Manage Scooters |
|-------|-------------|----------------------|-------------------|----------------|---------------------|
| `user` | With scooter | ✅ Own only | ✅ Own only | ❌ | ❌ |
| `distributor` | With activation code | ❌ | ✅ All in distributor | ✅ | ✅ |
| `maintenance` | Set by admin | TBD | TBD | TBD | TBD |
| `admin` | Set by admin | ✅ Any | ✅ Any | ✅ | ✅ |

## Database Functions

### `add_scooter_to_user(p_user_id, p_scooter_id, p_zyd_serial, p_telemetry)`
Automatically called during registration
- Creates user_scooters record
- Stores initial telemetry
- Sets as primary if first scooter
- Updates last_connected_at

### `get_user_scooters(p_user_id)`
Returns all scooters for a user
- Ordered by primary first, then registration date
- Includes telemetry and version info

### `user_can_access_scooter(p_user_id, p_scooter_id)`
Check if user has permission to access a scooter
- Users can access their own registered scooters
- Distributors can access scooters in their distributor account
- Admins can access everything

## Setup Instructions

### 1. Run Database Migration
```sql
-- In Supabase SQL Editor:
-- Run user_scooter_registration_schema.sql
```

This creates:
- Updated `users` table with profile fields
- `user_scooters` relationship table
- `scooter_telemetry` table
- Helper functions

### 2. Deploy New Edge Functions
```bash
supabase functions deploy register-user
supabase functions deploy register-distributor

# Redeploy login with updates
supabase functions deploy login
```

### 3. Update Android App
- New `RegisterChoiceActivity` - Choose user vs distributor
- Updated `RegisterActivity` - Capture profile fields
- New `RegisterDistributorActivity` - Activation code entry
- Update `AuthClient` with new endpoints
- Capture telemetry during registration

### 4. Update Admin Tool
- Add user management section
- View registered users
- Change user levels
- View user-scooter relationships

## Adding Scooters to Existing Users

Users can add more scooters after registration:

1. Connect to new scooter via BLE
2. App detects scooter not in user's account
3. Show "Add this scooter to your account?"
4. If yes, call backend to link scooter
5. Capture telemetry
6. Scooter added to user's account

## Telemetry Viewing

Future feature - users can:
- View their scooter telemetry history
- See odometer growth over time
- Track battery health (charge cycles)
- View fault history
- Compare multiple scooters

## Admin Features

### Managing User Levels
```sql
-- Promote user to distributor
UPDATE users SET user_level = 'distributor' WHERE email = 'user@example.com';

-- Add user to distributor account
UPDATE users
SET distributor_id = (SELECT id FROM distributors WHERE name = 'Pure Electric London')
WHERE email = 'user@example.com';

-- Promote to maintenance
UPDATE users SET user_level = 'maintenance' WHERE email = 'tech@example.com';
```

### View User Scooters
```sql
SELECT * FROM get_user_scooters('user-uuid-here');
```

### Check Access
```sql
SELECT user_can_access_scooter('user-uuid', 'scooter-uuid');
```

## Security

- ✅ Email verification required before login
- ✅ Password hashing (SHA-256)
- ✅ Activation code validation for distributors
- ✅ User-level access control
- ✅ Scooter access permissions enforced
- ✅ Audit logging for distributor registrations
- ✅ Session management (30-day tokens)

## What's Next

After this registration system:
1. ✅ Users can register and link scooters
2. ✅ Distributors can register with activation codes
3. ✅ Telemetry captured and stored
4. ⏭️ Password reset flow
5. ⏭️ Scooter PIN reset (for distributors)
6. ⏭️ Telemetry viewing UI
7. ⏭️ User profile management
8. ⏭️ Multiple scooter management UI

## Files Created

```
supabase/functions/
├── register-user/index.ts          # User registration with scooter
├── register-distributor/index.ts   # Distributor registration with code
└── login/index.ts                  # Updated to return scooters

Database:
└── user_scooter_registration_schema.sql

Documentation:
└── NEW_REGISTRATION_SYSTEM.md (this file)
```

## Testing

### Test User Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/register-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "testpass123",
    "scooter_serial": "ZYD-TEST-001",
    "first_name": "Test",
    "last_name": "User",
    "age_range": "25-34",
    "gender": "Male",
    "scooter_use_type": "Pleasure",
    "telemetry": {
      "odometer_km": 100.5,
      "battery_soc": 90,
      "charge_cycles": 10,
      "controller_hw_version": "V5.9",
      "controller_sw_version": "V2.78"
    }
  }'
```

### Test Distributor Registration
```bash
curl -X POST https://your-project.supabase.co/functions/v1/register-distributor \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dist@example.com",
    "password": "distpass123",
    "activation_code": "YOUR-ACTIVATION-CODE",
    "first_name": "Distributor",
    "last_name": "User"
  }'
```

---

**Ready to implement Android UI next!** 🚀
