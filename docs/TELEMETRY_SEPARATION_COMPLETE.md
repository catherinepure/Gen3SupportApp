# Telemetry Separation Implementation Complete

## Overview
Successfully separated telemetry tracking from firmware update operations by creating a dedicated `scooter_telemetry` table and updating all code to use the new structure.

## What Changed

### Database Structure (NEW)

#### scooter_telemetry table
Dedicated table for all scooter scan/connection events.

**Key Features**:
- Tracks every distributor scan, user connection, and firmware update
- Links to both distributors and users (user_id can be NULL for unregistered scooters)
- Stores complete telemetry snapshot (0xA0 + 0xA1 BLE packets)
- `scan_type` field distinguishes between different types of scans
- Indexed for fast queries by scooter, distributor, user, and date

**Sample Record**:
```json
{
  "id": "uuid-123",
  "scooter_id": "scooter-uuid",
  "distributor_id": "dist-uuid",
  "user_id": "user-uuid",  // NULL if not registered
  "hw_version": "V0.3",
  "sw_version": "V4.0",
  "voltage": 107.4,
  "current": 7.68,
  "odometer_km": 2228,
  "battery_soc": 85,
  "battery_health": 95,
  "charge_cycles": 45,
  "discharge_cycles": 353,
  "scan_type": "distributor_scan",
  "scanned_at": "2026-02-06T14:30:00"
}
```

### Code Changes

#### 1. New Files Created

**TelemetryRecord.java**
- Data class representing a telemetry snapshot
- Helper methods for formatting and display
- `getScanTypeDisplay()` - Human-readable scan type
- `getSummary()` - Short description for list view
- `getFormattedDate()` - Pretty date formatting

#### 2. SupabaseClient.java - New Methods

**createTelemetryRecord()**
```java
public void createTelemetryRecord(String scooterSerial, String distributorId,
                                 String hwVersion, String swVersion,
                                 RunningDataInfo runningData, BMSDataInfo bmsData,
                                 String embeddedSerial, String scanType,
                                 Callback<String> callback)
```

**Features**:
- Auto-creates scooter if doesn't exist
- Automatically links to user if scooter is registered
- Saves complete telemetry from both BLE packets
- Records scan_type for categorization

**getScooterTelemetry()**
```java
public void getScooterTelemetry(String scooterSerial, int limit, int offset,
                               Callback<List<TelemetryRecord>> callback)
```

**Features**:
- Returns all telemetry records for a scooter
- Sorted by date descending (newest first)
- Paginated for performance
- Includes distributor and user associations

#### 3. ScanScooterActivity.java - Updated

**Before**:
```java
supabase.createScanRecord(connectedSerial, distributorId,
                         scooterVersion.controllerHwVersion, ...);
```

**After**:
```java
supabase.createTelemetryRecord(connectedSerial, distributorId,
                              scooterVersion.controllerHwVersion, ...,
                              "distributor_scan", callback);
```

#### 4. ScooterDetailsActivity.java - Updated

**Before**:
- Queried `firmware_uploads` table
- Only showed records with status="scanned"
- Mixed firmware updates with scans

**After**:
- Queries `scooter_telemetry` table
- Shows all telemetry records
- Clear separation of concerns

## Data Flow

### Scenario 1: Distributor Scans Unregistered Scooter

1. **BLE Connection**: Distributor scans ZYD_0726800
2. **Telemetry Capture**: 0xA0, 0xA1, 0xB0 packets parsed
3. **Auto-Create Scooter**: If doesn't exist, create in `scooters` table
4. **Check Registration**: Query `user_scooters` → no user found
5. **Save Telemetry**:
```sql
INSERT INTO scooter_telemetry (
    scooter_id, distributor_id, user_id, -- user_id is NULL
    hw_version, sw_version, voltage, current, ...
    scan_type, scanned_at
) VALUES (...);
```

6. **Display**: ScooterDetailsActivity shows current telemetry + history

### Scenario 2: Distributor Scans Registered Scooter

1. **BLE Connection**: Distributor scans ZYD_0726800
2. **Telemetry Capture**: 0xA0, 0xA1, 0xB0 packets parsed
3. **Scooter Exists**: Found in `scooters` table
4. **Check Registration**: Query `user_scooters` → user found!
5. **Save Telemetry**:
```sql
INSERT INTO scooter_telemetry (
    scooter_id, distributor_id, user_id, -- user_id IS populated
    hw_version, sw_version, voltage, current, ...
    scan_type, scanned_at
) VALUES (...);
```

6. **Display**: ScooterDetailsActivity shows:
   - "Registered to: John Doe (john@example.com)"
   - "👤 View Customer Details" button
   - Current telemetry
   - Full history with all previous scans

### Scenario 3: Customer Registers Scooter (After Distributor Scans)

1. **History Exists**: Distributor already scanned scooter multiple times
2. **Customer Registers**: Entry created in `user_scooters` table
3. **Future Telemetry**: All future scans will include `user_id`
4. **Past Telemetry**: Remains unchanged (shows scooter was unregistered at that time)

## Benefits of New Structure

### 1. Clear Separation of Concerns
- **scooter_telemetry**: All scans/connections
- **firmware_uploads**: Only actual firmware updates
- No more conflating "scanned" with "uploaded"

### 2. Better User/Distributor Tracking
- Know which distributor performed each scan
- Track ownership at time of each scan
- See if scooter was registered when scanned

### 3. Flexible Queries
```sql
-- All scans for a scooter
SELECT * FROM scooter_telemetry WHERE scooter_id = ?;

-- All scans by a distributor
SELECT * FROM scooter_telemetry WHERE distributor_id = ?;

-- All scans for user's scooters
SELECT * FROM scooter_telemetry WHERE user_id = ?;

-- Only distributor scans
SELECT * FROM scooter_telemetry WHERE scan_type = 'distributor_scan';

-- Battery health trend
SELECT scanned_at, battery_health, battery_soc
FROM scooter_telemetry
WHERE scooter_id = ?
ORDER BY scanned_at ASC;
```

### 4. Firmware Update Integration (Future)
When performing firmware updates:
```sql
-- Before update: Create telemetry snapshot
INSERT INTO scooter_telemetry (..., scan_type='firmware_update');
-- Returns: telemetry_id_before

-- Create firmware upload record
INSERT INTO firmware_uploads (
    scooter_id, before_telemetry_id, status='uploading', ...
);

-- Perform update...

-- After update: Create telemetry snapshot
INSERT INTO scooter_telemetry (..., scan_type='firmware_update');
-- Returns: telemetry_id_after

-- Update firmware record
UPDATE firmware_uploads
SET after_telemetry_id = ?, status='completed';
```

## Migration Steps (For Production)

### Step 1: Run SQL Migration
```bash
psql -U postgres -d your_database < sql/002_create_telemetry_table.sql
```

This creates:
- `scooter_telemetry` table
- Indexes for performance
- RLS policies for security

### Step 2: Deploy Code
- New code already uses `scooter_telemetry`
- Old `firmware_uploads` records remain untouched
- No data loss

### Step 3: Optional Data Migration
If you have existing scan records in `firmware_uploads` with status="scanned":
```sql
INSERT INTO scooter_telemetry (...)
SELECT ... FROM firmware_uploads WHERE status = 'scanned';
```

### Step 4: Cleanup (Optional)
After verifying new system works:
```sql
-- Remove old scan records from firmware_uploads
DELETE FROM firmware_uploads WHERE status = 'scanned';
```

## Testing Checklist

- [x] Create TelemetryRecord data class
- [x] Add createTelemetryRecord to SupabaseClient
- [x] Add getScooterTelemetry to SupabaseClient
- [x] Update ScanScooterActivity
- [x] Update ScooterDetailsActivity
- [ ] Run SQL migration in database
- [ ] Test: Scan new scooter (auto-create + telemetry save)
- [ ] Test: Scan again (history shows 2 records)
- [ ] Test: Register scooter as user
- [ ] Test: Scan registered scooter (user_id populated)
- [ ] Test: View history with multiple records
- [ ] Test: Click on history record shows full details

## Files Modified

### New Files:
- `TelemetryRecord.java` - Data class
- `sql/002_create_telemetry_table.sql` - Database migration
- `DATABASE_RESTRUCTURE.md` - Design document
- `TELEMETRY_SEPARATION_COMPLETE.md` - This file

### Modified Files:
- `SupabaseClient.java` - Added createTelemetryRecord() and getScooterTelemetry()
- `ScanScooterActivity.java` - Changed createScanRecord → createTelemetryRecord
- `ScooterDetailsActivity.java` - Changed getScooterUpdateHistory → getScooterTelemetry

### Unchanged (Backward Compatible):
- `UpdateHistoryAdapter.java` - Still works with converted records
- `item_update_history.xml` - Layout unchanged
- All existing firmware update code - Unaffected

## Next Steps

1. **Run Database Migration**: Execute `002_create_telemetry_table.sql` in Supabase
2. **Test Complete Flow**: Scan → Register → Scan → View History
3. **Firmware Update Integration**: Update firmware upload code to create before/after telemetry
4. **Analytics Dashboard**: Build reports showing:
   - Battery health trends over time
   - Odometer growth rate
   - Service patterns by distributor
   - Customer usage patterns

## Documentation

- See `DATABASE_RESTRUCTURE.md` for detailed schema design
- See `sql/002_create_telemetry_table.sql` for migration script
- See `AUTO_SCOOTER_REGISTRATION.md` for auto-create behavior
- See `SCOOTER_DETAILS_IMPROVEMENTS.md` for UI enhancements
