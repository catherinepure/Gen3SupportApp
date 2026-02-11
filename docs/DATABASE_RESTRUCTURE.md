# Database Restructure: Separating Telemetry from Firmware Updates

## Problem
Currently using `firmware_uploads` table to store both:
- Actual firmware update operations
- Scooter scan/telemetry snapshots (status="scanned")

This conflates two different purposes and makes the system confusing.

## Solution
Separate telemetry tracking from firmware operations.

## New Database Schema

### 1. scooters (Inventory)
Basic scooter information - the source of truth for what scooters exist.

```sql
CREATE TABLE scooters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zyd_serial VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(50),
    hw_version VARCHAR(50),          -- Latest known HW version
    sw_version VARCHAR(50),          -- Latest known SW version
    status VARCHAR(20),               -- 'active', 'inactive', 'stolen', etc.
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2. scooter_telemetry (NEW - Telemetry Snapshots)
Every scan/connection creates a telemetry record. This is the history of all interactions.

```sql
CREATE TABLE scooter_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID REFERENCES scooters(id) NOT NULL,
    distributor_id UUID REFERENCES distributors(id),  -- Who scanned it
    user_id UUID REFERENCES users(id),                -- NULL if not registered yet

    -- Version info at time of scan
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
    scan_type VARCHAR(20),            -- 'distributor_scan', 'user_connection', 'firmware_update'
    notes TEXT,
    scanned_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_scooter_telemetry_scooter (scooter_id, scanned_at DESC),
    INDEX idx_scooter_telemetry_distributor (distributor_id, scanned_at DESC),
    INDEX idx_scooter_telemetry_user (user_id, scanned_at DESC)
);
```

### 3. firmware_uploads (Updates Only)
ONLY for actual firmware update operations. Links to telemetry for before/after snapshots.

```sql
CREATE TABLE firmware_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID REFERENCES scooters(id) NOT NULL,
    distributor_id UUID REFERENCES distributors(id) NOT NULL,
    firmware_version_id UUID REFERENCES firmware_versions(id) NOT NULL,

    -- Version tracking
    old_sw_version VARCHAR(50),
    new_sw_version VARCHAR(50),

    -- Status tracking
    status VARCHAR(20),               -- 'pending', 'uploading', 'completed', 'failed'
    progress_percent INTEGER,

    -- Telemetry snapshots (optional references)
    before_telemetry_id UUID REFERENCES scooter_telemetry(id),  -- State before update
    after_telemetry_id UUID REFERENCES scooter_telemetry(id),   -- State after update

    -- Timing
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,

    -- Error handling
    error_message TEXT,
    error_code VARCHAR(50),

    INDEX idx_firmware_uploads_scooter (scooter_id, started_at DESC),
    INDEX idx_firmware_uploads_status (status, started_at DESC)
);
```

### 4. user_scooters (Registration - UNCHANGED)
Links users to scooters they own.

```sql
CREATE TABLE user_scooters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) NOT NULL,
    scooter_id UUID REFERENCES scooters(id) NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    nickname VARCHAR(100),
    registered_at TIMESTAMP DEFAULT NOW(),
    last_connected_at TIMESTAMP,
    UNIQUE(user_id, scooter_id)
);
```

## Data Flow Examples

### Example 1: Distributor Scans New Scooter

1. **Create scooter** (if doesn't exist):
```json
POST /rest/v1/scooters
{
  "zyd_serial": "ZYD_0726800",
  "model": "GEN3",
  "hw_version": "V0.3",
  "sw_version": "V4.0",
  "status": "active"
}
```

2. **Create telemetry record**:
```json
POST /rest/v1/scooter_telemetry
{
  "scooter_id": "abc-123",
  "distributor_id": "dist-456",
  "user_id": null,
  "hw_version": "V0.3",
  "sw_version": "V4.0",
  "voltage": 107.4,
  "current": 7.68,
  "odometer_km": 2228,
  "battery_soc": 85,
  "battery_health": 95,
  "charge_cycles": 45,
  "discharge_cycles": 353,
  "scan_type": "distributor_scan"
}
```

3. **No firmware_uploads record** - this was just a scan

### Example 2: Customer Registers Scooter

1. **Scooter already exists** in `scooters` table (from distributor scan)

2. **Create user_scooters link**:
```json
POST /rest/v1/user_scooters
{
  "user_id": "user-789",
  "scooter_id": "abc-123",
  "is_primary": true,
  "nickname": "My Daily Ride"
}
```

3. **Future telemetry records** will include `user_id`

### Example 3: Distributor Performs Firmware Update

1. **Create "before" telemetry**:
```json
POST /rest/v1/scooter_telemetry
{
  "scooter_id": "abc-123",
  "distributor_id": "dist-456",
  "user_id": "user-789",  // If registered
  "sw_version": "V4.0",
  "voltage": 108.2,
  "battery_soc": 90,
  "scan_type": "firmware_update"
}
// Returns: telemetry_id = "tel-before-001"
```

2. **Create firmware upload record**:
```json
POST /rest/v1/firmware_uploads
{
  "scooter_id": "abc-123",
  "distributor_id": "dist-456",
  "firmware_version_id": "fw-v5-001",
  "old_sw_version": "V4.0",
  "new_sw_version": "V5.0",
  "status": "uploading",
  "before_telemetry_id": "tel-before-001"
}
```

3. **Update firmware_uploads** when complete:
```json
PATCH /rest/v1/firmware_uploads?id=eq.upload-123
{
  "status": "completed",
  "progress_percent": 100,
  "completed_at": "2026-02-06T10:30:00Z",
  "after_telemetry_id": "tel-after-001"
}
```

4. **Create "after" telemetry**:
```json
POST /rest/v1/scooter_telemetry
{
  "scooter_id": "abc-123",
  "distributor_id": "dist-456",
  "user_id": "user-789",
  "sw_version": "V5.0",  // Updated!
  "voltage": 107.8,
  "battery_soc": 88,
  "scan_type": "firmware_update"
}
```

5. **Update scooter record** with new version:
```json
PATCH /rest/v1/scooters?id=eq.abc-123
{
  "sw_version": "V5.0",
  "updated_at": "2026-02-06T10:30:00Z"
}
```

## Code Changes Required

### SupabaseClient.java

**New Methods**:
```java
// Create telemetry record
void createTelemetryRecord(String scooterSerial, String distributorId,
                          String hwVersion, String swVersion,
                          RunningDataInfo runningData, BMSDataInfo bmsData,
                          String scanType, Callback<String> callback)

// Get telemetry history
void getScooterTelemetry(String scooterSerial, int limit, int offset,
                        Callback<List<TelemetryRecord>> callback)

// Get user ID for registered scooter (for linking telemetry)
void getUserIdForScooter(String scooterSerial, Callback<String> callback)
```

**Remove/Modify**:
```java
// REMOVE: createScanRecord() - replace with createTelemetryRecord()
// RENAME: getScooterUpdateHistory() -> getScooterTelemetry()
```

### ScanScooterActivity.java

**Change**:
```java
// OLD:
supabase.createScanRecord(connectedSerial, distributorId, hwVersion, swVersion,
                         runningData, bmsData, embeddedSerial, callback)

// NEW:
supabase.createTelemetryRecord(connectedSerial, distributorId, hwVersion, swVersion,
                              runningData, bmsData, "distributor_scan", callback)
```

### ScooterDetailsActivity.java

**Change**:
```java
// OLD:
supabase.getScooterUpdateHistory(scooterSerial, distributorId, 50, 0, callback)

// NEW:
supabase.getScooterTelemetry(scooterSerial, 50, 0, callback)
```

**Display**:
- Show all telemetry records (scans + updates)
- Filter by scan_type if needed
- Show distributor who performed scan
- Show user if scooter was registered at time of scan

## Benefits

1. **Clear Separation**: Telemetry vs firmware operations
2. **Better History**: See all scooter interactions, not just updates
3. **User Tracking**: Know which user owned scooter at time of each scan
4. **Distributor Attribution**: Track which distributor serviced the scooter
5. **Before/After Comparison**: Link firmware updates to telemetry snapshots
6. **Flexible Queries**:
   - "Show all scans by this distributor"
   - "Show health trend for this scooter"
   - "Show all scooters this user has owned"
   - "Show firmware update success rate"

## Migration Strategy

### Option A: Fresh Start (Recommended for Development)
1. Drop `firmware_uploads` table
2. Create `scooter_telemetry` table
3. Recreate `firmware_uploads` with new schema
4. Update all code to use new structure

### Option B: Gradual Migration (Production)
1. Create `scooter_telemetry` table
2. Copy records from `firmware_uploads` where `status='scanned'`
3. Update code to use `scooter_telemetry` for scans
4. Keep `firmware_uploads` for actual updates
5. Eventually clean up old scan records from `firmware_uploads`

## Next Steps

1. Create migration SQL scripts
2. Update SupabaseClient.java with new methods
3. Update ScanScooterActivity to use createTelemetryRecord
4. Update ScooterDetailsActivity to show telemetry history
5. Add TelemetryRecord data class
6. Test complete flow: scan → register → scan again → firmware update
