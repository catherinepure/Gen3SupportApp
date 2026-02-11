# Automatic Scooter Registration to Inventory

## Overview
When a distributor scans a scooter that doesn't exist in the database, the system now automatically creates a record in the `scooters` table. This ensures that scan history is saved and builds up over time.

## Implementation (2026-02-06)

### New Method: `createScooterRecord()`
**Location**: `SupabaseClient.java:533-571`

Creates a new scooter record in the `scooters` table with:
- `zyd_serial` - The scooter's ZYD serial number
- `model` - Default: "GEN3"
- `hw_version` - Hardware version from BLE 0xB0 packet
- `sw_version` - Software version from BLE 0xB0 packet
- `status` - Default: "active"

```java
private String createScooterRecord(String scooterSerial, String hwVersion, String swVersion) throws Exception {
    JsonObject scooterBody = new JsonObject();
    scooterBody.addProperty("zyd_serial", scooterSerial);
    scooterBody.addProperty("model", "GEN3");
    scooterBody.addProperty("hw_version", hwVersion);
    scooterBody.addProperty("sw_version", swVersion);
    scooterBody.addProperty("status", "active");

    // POST to /rest/v1/scooters
    // Returns UUID of created record
}
```

### Updated Method: `createScanRecord()`
**Location**: `SupabaseClient.java:576-701`

Modified to automatically create scooter if not found:

**Before**:
```java
JsonArray scooterArray = JsonParser.parseString(scooterBody).getAsJsonArray();
if (scooterArray.size() == 0) {
    postError(callback, "Scooter not found");  // ❌ Failed here
    return;
}
String scooterId = scooterArray.get(0).getAsJsonObject().get("id").getAsString();
```

**After**:
```java
JsonArray scooterArray = JsonParser.parseString(scooterBody).getAsJsonArray();
String scooterId;

if (scooterArray.size() == 0) {
    // Scooter doesn't exist - create it automatically
    Log.d(TAG, "Scooter not found in database, creating new record for: " + scooterSerial);
    try {
        scooterId = createScooterRecord(scooterSerial, hwVersion, swVersion);  // ✅ Auto-create
        Log.d(TAG, "Successfully created scooter record with ID: " + scooterId);
    } catch (Exception e) {
        Log.e(TAG, "Failed to auto-create scooter: " + e.getMessage());
        postError(callback, "Scooter not found and could not be created: " + e.getMessage());
        return;
    }
} else {
    scooterId = scooterArray.get(0).getAsJsonObject().get("id").getAsString();
}

// Continue with creating scan record using scooterId
```

## User Flow

### Scanning a New Scooter (First Time)

1. **Distributor scans ZYD_0726800** via ScanScooterActivity
2. **BLE connection established** and telemetry captured
3. **`createScanRecord()` called**:
   - Queries `scooters` table for ZYD_0726800
   - ❌ Not found (returns empty array)
   - ✅ Automatically creates new record with:
     - `zyd_serial`: "ZYD_0726800"
     - `model`: "GEN3"
     - `hw_version`: "V0.3"
     - `sw_version`: "V4.0"
     - `status`: "active"
   - ✅ Gets back UUID (e.g., "123e4567-e89b-12d3-a456-426614174000")
   - ✅ Creates scan record in `firmware_uploads` with status "scanned"
   - ✅ Saves all telemetry data (voltage, current, battery SOC, etc.)

4. **`getScooterRegistrationStatus()` called**:
   - Queries `scooters` table for ZYD_0726800
   - ✅ Found (just created)
   - Queries `user_scooters` table for registration
   - Returns "Scooter not registered to any customer" (expected)

5. **ScooterDetailsActivity opens**:
   - ✅ Shows scooter serial
   - ✅ Shows "Not registered to any customer"
   - ✅ Shows current firmware version
   - ✅ Shows live telemetry
   - ✅ Shows "No previous scans found for this scooter" (this is the first one)

### Scanning the Same Scooter (Second Time)

1. **Distributor scans ZYD_0726800 again** (next day/week)
2. **BLE connection established** and telemetry captured
3. **`createScanRecord()` called**:
   - Queries `scooters` table for ZYD_0726800
   - ✅ Found (created during first scan)
   - ✅ Creates scan record in `firmware_uploads` with new telemetry

4. **ScooterDetailsActivity opens**:
   - ✅ Shows scooter serial
   - ✅ Shows "Not registered to any customer" (unless registered in meantime)
   - ✅ Shows current firmware version
   - ✅ Shows live telemetry
   - ✅ Shows **"Scan History (2 records):"** with both scans listed in reverse date order

### If Customer Registers the Scooter (via App)

After a customer registers ZYD_0726800 through the mobile app:
- Entry created in `user_scooters` table linking scooter UUID to user UUID

Next distributor scan shows:
- ✅ "Registered to: John Doe (john@example.com)"
- ✅ "👤 View Customer Details" button appears
- ✅ Full scan history still available

## Database Schema

### scooters table
```sql
CREATE TABLE scooters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zyd_serial VARCHAR(50) UNIQUE NOT NULL,
    model VARCHAR(50),
    hw_version VARCHAR(50),
    sw_version VARCHAR(50),
    status VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### firmware_uploads table (scan records)
```sql
CREATE TABLE firmware_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID REFERENCES scooters(id),  -- Now always valid
    distributor_id UUID REFERENCES distributors(id),
    firmware_version_id UUID REFERENCES firmware_versions(id),
    old_hw_version VARCHAR(50),
    old_sw_version VARCHAR(50),
    status VARCHAR(20),  -- 'scanned', 'uploading', 'completed', 'failed'

    -- Telemetry from 0xA0 packet
    voltage DOUBLE PRECISION,
    current DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION,
    odometer_km INTEGER,
    motor_temp INTEGER,
    battery_temp INTEGER,

    -- Telemetry from 0xA1 packet
    battery_soc INTEGER,
    battery_health INTEGER,
    battery_charge_cycles INTEGER,
    battery_discharge_cycles INTEGER,
    remaining_capacity_mah INTEGER,
    full_capacity_mah INTEGER,

    embedded_serial VARCHAR(50),
    started_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT
);
```

## Benefits

1. **✅ No Lost Data**: Every scan is now saved, building a complete history
2. **✅ No User Intervention**: Distributor doesn't need to manually add scooters
3. **✅ Automatic Tracking**: Scooters are tracked from first contact
4. **✅ Better Analytics**: Can track scooter health over time from first scan
5. **✅ Inventory Building**: Distributor inventory grows automatically as they scan scooters
6. **✅ Customer Registration Ready**: When customer registers, history already exists

## Logging

All auto-creation is logged for debugging:

```
D/SupabaseClient: Getting scooter ID for serial: ZYD_0726800
D/SupabaseClient: Scooter not found in database, creating new record for: ZYD_0726800
D/SupabaseClient: Creating scooter record: {"zyd_serial":"ZYD_0726800","model":"GEN3",...}
D/SupabaseClient: createScooterRecord HTTP 201: [{"id":"123e4567-e89b-12d3-a456-426614174000",...}]
D/SupabaseClient: Successfully created scooter record with ID: 123e4567-e89b-12d3-a456-426614174000
D/SupabaseClient: Creating scan record: {"scooter_id":"123e4567-...","status":"scanned",...}
```

## Error Handling

If auto-creation fails (database error, network issue, etc.):
- Error is logged: `"Failed to auto-create scooter: <error message>"`
- Callback receives: `"Scooter not found and could not be created: <error>"`
- ScanScooterActivity handles gracefully (already has lifecycle checks)
- Telemetry is still shown to distributor via intent extras
- User sees current data but history is unavailable

## Future Enhancements

1. **Batch Import**: Allow distributors to bulk-import scooter serials
2. **Model Detection**: Auto-detect model from serial number pattern or BLE data
3. **Ownership Transfer**: Track when scooter moves between distributors
4. **Service Intervals**: Calculate when scooter needs service based on scan history
5. **Fleet Analytics**: Dashboard showing all scooters scanned by distributor

## Testing Checklist

- [x] Auto-create scooter on first scan
- [x] Save scan record with telemetry
- [x] Show telemetry without crashes
- [ ] Second scan shows history with 2 records
- [ ] Third scan shows history with 3 records
- [ ] Customer registration links to existing scooter
- [ ] After registration, distributor sees customer info
- [ ] Handle database errors gracefully

## Related Files

- `app/src/main/java/com/pure/gen3firmwareupdater/SupabaseClient.java` (createScooterRecord, createScanRecord)
- `app/src/main/java/com/pure/gen3firmwareupdater/ScanScooterActivity.java` (calls createScanRecord)
- `app/src/main/java/com/pure/gen3firmwareupdater/ScooterDetailsActivity.java` (displays history)
