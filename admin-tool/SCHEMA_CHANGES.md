# Database Schema Changes for Multi-HW and Public Access

## Overview
This document outlines the database schema changes needed to support:
- Multiple hardware versions per firmware
- Public vs. distributor-only firmware access
- Anonymous telemetry tracking
- Two-tier authentication system

## Schema Changes

### 1. `firmware_versions` Table - Modified

**Changes:**
- Remove `target_hw_version` column (moved to junction table)
- Add `access_level` column: `'public'` or `'distributor'`

**New Schema:**
```sql
firmware_versions
├── id (uuid, primary key)
├── version_label (text, e.g., "V2.3")
├── file_path (text, storage path)
├── file_size_bytes (integer)
├── min_sw_version (text, nullable)
├── release_notes (text, nullable)
├── is_active (boolean)
├── access_level (text) -- NEW: 'public' or 'distributor'
├── created_at (timestamp)
└── updated_at (timestamp)
```

### 2. `firmware_hw_targets` Table - NEW (Junction Table)

Maps firmware versions to multiple hardware versions.

```sql
firmware_hw_targets
├── id (uuid, primary key)
├── firmware_version_id (uuid, foreign key → firmware_versions.id)
├── hw_version (text, e.g., "V1.0", "V1.1", "V2.0")
├── created_at (timestamp)
└── UNIQUE(firmware_version_id, hw_version)
```

### 3. `scooters` Table - Modified

**Changes:**
- Add `hw_version` column to track hardware version
- Keep `zyd_serial` for authentication lookup

**New Schema:**
```sql
scooters
├── id (uuid, primary key)
├── zyd_serial (text, unique, indexed)
├── distributor_id (uuid, foreign key → distributors.id)
├── model (text, nullable)
├── hw_version (text, nullable) -- NEW: e.g., "V1.0"
├── notes (text, nullable)
├── created_at (timestamp)
└── updated_at (timestamp)
```

### 4. `telemetry_snapshots` Table - NEW

Anonymous telemetry data captured during firmware updates.

```sql
telemetry_snapshots
├── id (uuid, primary key)
├── zyd_serial (text, indexed but NOT foreign key for privacy)
├── firmware_upload_id (uuid, foreign key → firmware_uploads.id, nullable)
├── hw_version (text)
├── sw_version (text)
├── odometer_km (decimal, nullable)
├── battery_cycles (integer, nullable)
├── captured_at (timestamp)
└── notes (text, nullable)
```

**Privacy Note:** `zyd_serial` is stored as text for tracking purposes but NOT linked via foreign key to the `scooters` table. This allows public users to remain anonymous while still providing usage data.

### 5. `firmware_uploads` Table - No Changes

Existing table remains the same, tracks update attempts.

## Authentication Flows

### Flow 1: Public User (No Login)
1. User enters their ZYD serial number
2. App reads HW version from scooter controller
3. Query returns firmware where:
   - `access_level = 'public'`
   - `is_active = true`
   - HW version matches via `firmware_hw_targets` table
4. User can download and install
5. Telemetry snapshot created (no user identification)

### Flow 2: Distributor User (Activation Code Login)
1. User enters activation code
2. System validates against `distributors` table
3. User optionally enters ZYD serial for specific scooter
4. Query returns firmware where:
   - `access_level IN ('public', 'distributor')`
   - `is_active = true`
   - If ZYD provided: scooter belongs to distributor
   - HW version matches via `firmware_hw_targets`
5. User can download and install
6. Telemetry snapshot created
7. Record created in `firmware_uploads` table

## API Endpoint Changes

### New Endpoint: `POST /api/auth/validate-activation`
```json
Request:
{
  "activation_code": "PURE-ABCD-1234"
}

Response (success):
{
  "valid": true,
  "distributor_id": "uuid",
  "distributor_name": "Acme Scooters"
}

Response (failure):
{
  "valid": false,
  "error": "Invalid or inactive code"
}
```

### New Endpoint: `POST /api/firmware/query`
```json
Request:
{
  "hw_version": "V1.0",
  "current_sw_version": "V2.1",
  "access_level": "public",  // or "distributor"
  "distributor_id": "uuid"   // optional, required for distributor access
}

Response:
{
  "available_updates": [
    {
      "id": "uuid",
      "version_label": "V2.3",
      "file_path": "controller_v2_3.bin",
      "file_size_bytes": 245760,
      "release_notes": "Bug fixes and improvements",
      "download_url": "signed_url_here"
    }
  ]
}
```

### New Endpoint: `POST /api/telemetry/snapshot`
```json
Request:
{
  "zyd_serial": "ZYD12345",
  "hw_version": "V1.0",
  "sw_version": "V2.3",
  "odometer_km": 1234.5,
  "battery_cycles": 42,
  "firmware_upload_id": "uuid"  // optional, if this is during an update
}

Response:
{
  "success": true,
  "snapshot_id": "uuid"
}
```

## RLS (Row Level Security) Policies

### `firmware_versions`
```sql
-- Public read access for active public firmware
CREATE POLICY "Public firmware readable by anyone"
  ON firmware_versions FOR SELECT
  USING (is_active = true AND access_level = 'public');

-- Distributor firmware readable with valid distributor_id in JWT
CREATE POLICY "Distributor firmware readable by authenticated distributors"
  ON firmware_versions FOR SELECT
  USING (is_active = true AND access_level = 'distributor' AND
         auth.uid() IN (SELECT id FROM distributors WHERE is_active = true));
```

### `firmware_hw_targets`
```sql
-- Anyone can read HW targets for active firmware
CREATE POLICY "HW targets readable for active firmware"
  ON firmware_hw_targets FOR SELECT
  USING (firmware_version_id IN (
    SELECT id FROM firmware_versions WHERE is_active = true
  ));
```

### `telemetry_snapshots`
```sql
-- Anyone can insert telemetry (anonymous)
CREATE POLICY "Anyone can submit telemetry"
  ON telemetry_snapshots FOR INSERT
  WITH CHECK (true);

-- Only service role can read telemetry
CREATE POLICY "Only admins can read telemetry"
  ON telemetry_snapshots FOR SELECT
  USING (auth.jwt()->>'role' = 'service_role');
```

## Migration Notes

1. Existing firmware records need to be migrated:
   - Extract `target_hw_version` from each firmware
   - Create corresponding record in `firmware_hw_targets`
   - Set default `access_level = 'distributor'` (safer default)

2. Existing scooters should have `hw_version` populated:
   - Default to `NULL` initially
   - Update as data becomes available

3. Storage bucket (`firmware-binaries`) permissions remain unchanged
   - Use signed URLs for downloads
   - Expire after reasonable time (e.g., 1 hour)
