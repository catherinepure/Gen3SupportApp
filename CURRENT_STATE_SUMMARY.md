# Current State Summary - Gen3 Firmware Updater

**Date**: 2026-02-06
**Status**: Telemetry separation implemented but not saving to database

## 🎯 What We're Building

A comprehensive scooter/user/distributor management tool for Gen3 electric scooters that:
- Scans scooters via BLE
- Captures telemetry (voltage, current, battery health, odometer, etc.)
- Tracks distributor scans and user registrations
- Separates telemetry tracking from firmware update operations

## ✅ What's Implemented

### 1. Scan Flow (ScanScooterActivity)
- ✅ BLE scanning for ZYD scooters
- ✅ Device selection dialog
- ✅ Connection management
- ✅ Telemetry capture from BLE packets:
  - 0xA0: Running data (voltage, current, speed, odometer, temps)
  - 0xA1: BMS data (SOC, health, charge cycles, capacity)
  - 0xB0: Version info (HW/SW versions, serial number)
- ✅ Registration status check
- ✅ Auto-create scooter in database if doesn't exist

### 2. Details Display (ScooterDetailsActivity)
- ✅ Current telemetry display (live data in gray box)
- ✅ Registration status ("Registered to" or "Not registered")
- ✅ Customer details button (when registered)
- ✅ Firmware version display
- ✅ Telemetry history list (should load from database)

### 3. Database Structure

#### scooters table
```sql
CREATE TABLE scooters (
    id UUID PRIMARY KEY,
    zyd_serial VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### scooter_telemetry table (NEW)
```sql
CREATE TABLE scooter_telemetry (
    id UUID PRIMARY KEY,
    scooter_id UUID NOT NULL,
    distributor_id UUID,
    user_id UUID,

    -- Versions
    hw_version VARCHAR(50),
    sw_version VARCHAR(50),
    embedded_serial VARCHAR(50),

    -- 0xA0 Running Data
    voltage DOUBLE PRECISION,
    current DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION,
    odometer_km INTEGER,
    motor_temp INTEGER,
    battery_temp INTEGER,

    -- 0xA1 BMS Data
    battery_soc INTEGER,
    battery_health INTEGER,
    battery_charge_cycles INTEGER,
    battery_discharge_cycles INTEGER,
    remaining_capacity_mah INTEGER,
    full_capacity_mah INTEGER,

    -- Metadata
    scan_type VARCHAR(20) DEFAULT 'distributor_scan',
    notes TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. Code Structure

#### SupabaseClient.java - New Methods
- `createScooterRecord(serial, hw, sw)` - Auto-creates scooter (line 533)
- `createTelemetryRecord(...)` - Saves telemetry to scooter_telemetry table (line 788)
- `getScooterTelemetry(serial, limit, offset)` - Retrieves telemetry history (line 928)
- `getScooterRegistrationStatus(serial)` - Checks if scooter registered to user (line 704)

#### ScanScooterActivity.java
- Changed from `createScanRecord()` to `createTelemetryRecord()` (line 301)
- Passes scan_type as "distributor_scan"

#### ScooterDetailsActivity.java
- Changed from `getScooterUpdateHistory()` to `getScooterTelemetry()` (line 196)
- Converts TelemetryRecord to UpdateRecord for display compatibility

## ❌ Current Problem

### Telemetry Not Saving to Database

**Symptom**:
- Scan completes successfully
- Telemetry captured from BLE
- ScooterDetailsActivity shows current telemetry
- But history shows "No previous scans found"

**Root Cause** (from logcat):
```
Failed to create telemetry record: Scooter not found and could not be created:
Failed to create scooter: HTTP 400 - Could not find the 'status' column of 'scooters'
in the schema cache
```

**Latest Fix Attempted**:
- Removed extra columns from `createScooterRecord()`
- Now only inserts `zyd_serial` (line 535)
- But still not working (needs testing after rebuild)

## 🔍 What Needs Investigation

### 1. Database Schema Verification
**Question**: What columns actually exist in the `scooters` table?

**Check in Supabase SQL Editor**:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'scooters'
ORDER BY ordinal_position;
```

### 2. Row Level Security (RLS)
**Question**: Are RLS policies blocking the inserts?

**Current RLS on scooter_telemetry**:
```sql
CREATE POLICY "Distributors can insert telemetry" ON scooter_telemetry
    FOR INSERT
    WITH CHECK (auth.uid() = distributor_id);
```

**Potential Issue**:
- App uses `service_role` key (bypasses RLS)
- Or uses `anon` key (subject to RLS)
- Need to verify which key is in `BuildConfig.SUPABASE_ANON_KEY`

**Check**:
```java
// In SupabaseClient.java line 106
supabase = new SupabaseClient(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_ANON_KEY);
```

### 3. Foreign Key Constraints
**Question**: Does the upgrade script (003) add foreign keys that might be failing?

**If scooters table doesn't exist with proper structure**, the foreign key from:
```sql
scooter_id UUID REFERENCES scooters(id)
```
Would fail.

### 4. API Key Permissions
**Question**: Does the Supabase anon key have INSERT permission on both tables?

**Need to verify**:
- Can the key INSERT into `scooters`?
- Can the key INSERT into `scooter_telemetry`?
- Are there RLS policies blocking it?

## 📋 Data Flow (Expected)

1. **Distributor scans scooter** (ZYD_0726800)
2. **BLE connection** established
3. **Telemetry captured** from 0xA0, 0xA1, 0xB0 packets
4. **createTelemetryRecord() called**:
   - Query scooters for ZYD_0726800
   - If not found → createScooterRecord()
     - INSERT INTO scooters (zyd_serial) VALUES ('ZYD_0726800')
     - Returns scooter_id UUID
   - Query user_scooters for user_id (NULL if not registered)
   - INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, voltage, current, ...)
5. **ScooterDetailsActivity opens**
6. **getScooterTelemetry() called**:
   - Query scooters for ZYD_0726800 → get scooter_id
   - SELECT * FROM scooter_telemetry WHERE scooter_id = ? ORDER BY scanned_at DESC
7. **Display history** in RecyclerView

## 🔧 Files to Review

### Java Files
- `app/src/main/java/com/pure/gen3firmwareupdater/SupabaseClient.java`
  - Line 533: createScooterRecord()
  - Line 788: createTelemetryRecord()
  - Line 928: getScooterTelemetry()

- `app/src/main/java/com/pure/gen3firmwareupdater/ScanScooterActivity.java`
  - Line 301: Calls createTelemetryRecord()

- `app/src/main/java/com/pure/gen3firmwareupdater/ScooterDetailsActivity.java`
  - Line 196: Calls getScooterTelemetry()

### SQL Files
- `sql/002_create_telemetry_table_simple.sql` ✅ Run successfully
- `sql/003_upgrade_telemetry_table.sql` ❓ Status unknown

### Data Classes
- `TelemetryRecord.java` - New data class for telemetry
- `ScooterRegistrationInfo.java` - For user registration data
- `UpdateRecord` (in ScooterDetailsActivity) - Legacy, should migrate to TelemetryRecord

## 🎬 Recent Logcat Evidence

```
02-06 12:42:41.414 W ScanScooter: Failed to create telemetry record:
Scooter not found and could not be created:
Failed to create scooter: HTTP 400 -
Could not find the 'status' column of 'scooters' in the schema cache

02-06 12:42:41.528 D SupabaseClient: Getting scooter ID for telemetry query: ZYD_0726800
```

**Analysis**:
1. Telemetry record creation failed
2. Attempted to create scooter
3. HTTP 400 because 'status' column doesn't exist
4. Then tried to query telemetry anyway (failed because scooter doesn't exist)

## 🚀 Next Steps for New Chat

1. **Verify Database Schema**:
   ```sql
   -- What columns exist?
   \d scooters
   \d scooter_telemetry

   -- What foreign keys exist?
   SELECT * FROM information_schema.table_constraints
   WHERE table_name IN ('scooters', 'scooter_telemetry');

   -- What RLS policies exist?
   SELECT * FROM pg_policies
   WHERE tablename IN ('scooters', 'scooter_telemetry');
   ```

2. **Check API Key Type**:
   - Is it `anon` key or `service_role` key?
   - Does it have INSERT permissions?
   - Are RLS policies blocking it?

3. **Test Direct Insert**:
   ```sql
   -- Try manual insert
   INSERT INTO scooters (zyd_serial) VALUES ('TEST_12345');
   INSERT INTO scooter_telemetry (scooter_id, voltage, scan_type)
   VALUES ((SELECT id FROM scooters WHERE zyd_serial = 'TEST_12345'), 107.4, 'test');
   ```

4. **Review Code Flow**:
   - Trace through SupabaseClient.createTelemetryRecord()
   - Add more logging
   - Verify HTTP request/response

5. **Consider Simplification**:
   - Maybe disable RLS temporarily for testing?
   - Maybe use service_role key instead of anon key?
   - Maybe add missing columns to scooters table?

## 📚 Documentation Created

- `DATABASE_RESTRUCTURE.md` - Design for telemetry separation
- `TELEMETRY_SEPARATION_COMPLETE.md` - Implementation summary
- `AUTO_SCOOTER_REGISTRATION.md` - Auto-create scooter feature
- `SCOOTER_DETAILS_IMPROVEMENTS.md` - UI enhancements
- `SCOOTER_MANAGEMENT_UX_DESIGN.md` - Three-path UX design
- `NEW_SCAN_FLOW_IMPLEMENTATION.md` - Phase 1 implementation

## 🎯 Goal

Get telemetry saving to `scooter_telemetry` table and displaying in history list after each scan.
