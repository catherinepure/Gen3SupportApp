# Telemetry Data Capture Implementation

## Overview
This implementation adds comprehensive telemetry data capture when scooters are scanned/connected. The system now captures voltage, current, serial number, battery SOC, charge/discharge cycles, odometer, and other real-time metrics from scooters.

## New Data Classes

### 1. RunningDataInfo.java
Parses real-time telemetry from **0xA0 (Running Data)** packet:
- **voltage** - Battery voltage in volts (V)
- **current** - Motor current in amps (A)
- **speed** - Current speed in km/h
- **odometer** - Total distance in kilometers
- **batteryPercent** - Battery level 0-100%
- **power** - Power in watts (calculated: voltage × current)
- **motorTemp** - Motor temperature in °C
- **batteryTemp** - Battery temperature in °C
- **isMoving, isCharging, lightsOn** - Status flags

### 2. BMSDataInfo.java
Parses Battery Management System data from **0xA1 (BMS Data)** packet:
- **batterySOC** - State of Charge (0-100%)
- **chargeCycles** - Total charge cycles completed
- **dischargeCycles** - Total discharge cycles completed
- **batteryVoltage** - Total battery pack voltage (V)
- **batteryCurrent** - Battery current in amps (A)
- **batteryHealth** - Battery health percentage (0-100%)
- **cellTemperatures** - Individual cell temperatures array
- **avgTemperature, maxTemperature, minTemperature** - Temperature metrics
- **cellVoltages** - Individual cell voltages array
- **maxCellVoltage, minCellVoltage** - Cell voltage range
- **remainingCapacity** - Remaining capacity in mAh
- **fullCapacity** - Full charge capacity in mAh
- **designCapacity** - Design capacity in mAh
- **isCharging, isDischarging, isBalancing, hasFault** - Status flags

## Database Schema Changes

New columns added to `firmware_uploads` table (see `add_telemetry_columns.sql`):

```sql
ALTER TABLE firmware_uploads
ADD COLUMN IF NOT EXISTS voltage NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS current NUMERIC(6, 2),
ADD COLUMN IF NOT EXISTS battery_soc INTEGER,
ADD COLUMN IF NOT EXISTS battery_charge_cycles INTEGER,
ADD COLUMN IF NOT EXISTS battery_discharge_cycles INTEGER,
ADD COLUMN IF NOT EXISTS odometer_km INTEGER,
ADD COLUMN IF NOT EXISTS speed_kmh NUMERIC(5, 1),
ADD COLUMN IF NOT EXISTS motor_temp INTEGER,
ADD COLUMN IF NOT EXISTS battery_temp INTEGER,
ADD COLUMN IF NOT EXISTS battery_health INTEGER,
ADD COLUMN IF NOT EXISTS remaining_capacity_mah INTEGER,
ADD COLUMN IF NOT EXISTS full_capacity_mah INTEGER,
ADD COLUMN IF NOT EXISTS embedded_serial TEXT;
```

### Migration Required
Run `add_telemetry_columns.sql` on your Supabase database to add these columns:
```bash
# Via Supabase SQL Editor:
# Copy and paste contents of add_telemetry_columns.sql
```

## Modified Files

### BLEManager.java
- Added `requestBMSData()` method to request 0xA1 BMS data packet
- Existing `requestRunningData()` method sends 0xA0 packet

### FirmwareUpdaterActivity.java
- Added fields: `scooterRunningData`, `scooterBMSData`
- Enhanced `onDataReceived()` to parse 0xA0 and 0xA1 packets
- Updated `sendVersionRequest()` to also request BMS data (0xA1) after version request
- Modified scan record creation to include telemetry data

### SupabaseClient.java
- Added overloaded `createScanRecord()` method that accepts telemetry data:
  - `RunningDataInfo runningData` - Real-time telemetry from 0xA0
  - `BMSDataInfo bmsData` - Battery metrics from 0xA1
  - `String embeddedSerial` - Serial number from B0 packet
- Updated record insertion to include all telemetry fields
- Modified `getScooterUpdateHistory()` to fetch and parse telemetry columns

### ScooterDetailsActivity.java
- Extended `UpdateRecord` class with telemetry fields
- Enhanced `showRecordDetails()` to display telemetry in organized sections:
  - **VERSION INFO** - Hardware, software, embedded serial
  - **BATTERY INFO** - Voltage, current, SOC, health, cycles, capacity
  - **TELEMETRY** - Speed, odometer, motor temp, battery temp

## Data Flow

1. **Connection**: When a scooter connects to the app
2. **Request Packets**: App sends:
   - 0xA0 (Running Data) - immediately to wake protocol
   - 0xB0 (Version Info) - after 300ms
   - 0xA1 (BMS Data) - after 600ms
3. **Parse Responses**: Each packet is parsed by its respective class
4. **Store Data**: When version is verified, all telemetry is saved to database
5. **Display**: User can view telemetry history via "View Details" in scooter selection

## Telemetry Display Format

When viewing scooter details, records show:

```
Record Details

Status: SCANNED

Date/Time: Feb 06, 2026 14:30

=== VERSION INFO ===
Hardware Version: V9.2
Software Version: V8.2
Embedded Serial: ZYD1234567890

=== BATTERY INFO ===
Voltage: 48.2 V
Current: 3.45 A
Battery SOC: 85%
Battery Health: 95%
Charge Cycles: 42
Discharge Cycles: 45
Capacity: 8500 / 10000 mAh

=== TELEMETRY ===
Speed: 0.0 km/h
Odometer: 1250 km
Motor Temp: 32°C
Battery Temp: 28°C
```

## Testing

To test telemetry capture:

1. **Deploy Database Migration**:
   ```sql
   -- Run add_telemetry_columns.sql in Supabase SQL Editor
   ```

2. **Build and Install App**:
   ```bash
   ./gradlew assembleDebug
   adb install app/build/outputs/apk/debug/app-debug.apk
   ```

3. **Test Flow**:
   - Login as distributor
   - Select "Manage Scooters"
   - Choose a scooter
   - Click "Update Firmware" (this triggers scan)
   - Connect to scooter
   - Wait for version info and telemetry to be captured
   - Go back and select "View Details" on the same scooter
   - Click on the most recent scan record to view telemetry

4. **Verify Database**:
   ```sql
   SELECT voltage, current, battery_soc, battery_charge_cycles,
          battery_discharge_cycles, odometer_km, speed_kmh
   FROM firmware_uploads
   WHERE status = 'scanned'
   ORDER BY started_at DESC
   LIMIT 10;
   ```

## Packet Formats

### 0xA0 - Running Data Packet
```
[0-2]   Header (0xF0/0xAB), command (0xA0), length
[3-4]   Speed (uint16, in 0.1 km/h units)
[5-6]   Voltage (uint16, in 0.1V units)
[7-8]   Current (int16, in 0.01A units, signed)
[9-10]  Battery percent (uint16, 0-100 or 0-1000)
[11-14] Odometer (uint32, in meters)
[15]    Motor temperature (int8, °C)
[16]    Battery temperature (int8, °C)
[17]    Status flags byte
[...] CRC
```

### 0xA1 - BMS Data Packet
```
[0-2]   Header (0xF0/0xAB), command (0xA1), length
[3]     Battery SOC (uint8, 0-100%)
[4]     Battery health (uint8, 0-100%)
[5-6]   Charge cycles (uint16)
[7-8]   Discharge cycles (uint16)
[9-10]  Battery voltage (uint16, in 0.01V units)
[11-12] Battery current (int16, in 0.01A units, signed)
[13-14] Remaining capacity (uint16, in mAh)
[15-16] Full capacity (uint16, in mAh)
[17-18] Design capacity (uint16, in mAh)
[19]    Avg temperature (int8, °C)
[20]    Max temperature (int8, °C)
[21]    Min temperature (int8, °C)
[22]    Status flags byte
[...] CRC
```

## Notes

- Telemetry data is **optional** - if packets aren't received, scan records are still created
- The app logs all telemetry parsing for debugging (check logcat with tag "RunningDataInfo" and "BMSDataInfo")
- Packet formats may vary by firmware version - parsing is defensive with null checks
- Serial number can come from:
  1. BLE Device Info Service (2A25)
  2. Embedded in B0 packet (32-byte format)
  3. ZYD device name as fallback

## Future Enhancements

Potential improvements:
- Real-time telemetry display during connection
- Telemetry trends/charts over time
- Alerts for low battery health or high cycle counts
- Export telemetry data to CSV
- Periodic telemetry polling (not just on scan)
