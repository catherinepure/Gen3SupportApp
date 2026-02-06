# Configuration Data (0x01 Packet) Feature

## Overview
Added support for capturing and displaying **configuration and settings data** from scooters via instruction 0x01. This provides speed limit settings, fault flags, panel selections, and firmware version information.

## What Was Added

### 1. New Data Model: `ConfigInfo.java`
A complete parser for 0x01 configuration packets with:

**Speed Settings:**
- Minimum cruise control speed
- Maximum speed for Eco mode
- Maximum speed for Comfort mode
- Maximum speed for Sport mode
- Speed unit detection (km/h or mph)

**Fault Flags (16 bits):**
- E1: Brake failure
- E2: Throttle fault
- E3: Communication disconnect
- E4: Overcurrent
- E7: Hall fault
- E9: Op amp bias
- F1: Brake not reset
- F2: Throttle not reset

**Panel Selections:**
- SN Code panel enabled/disabled
- MP3 panel enabled/disabled
- RGB panel enabled/disabled
- BMS panel enabled/disabled

**Software Version:**
- Parsed from 5 bytes (18-22) into readable format
- Example: `[0x80, 0x25, 0x01, 0x00, 0x01]` → `"8025_01.00.01"`

### 2. Updated `FirmwareUpdaterActivity.java`

**Added:**
- `scooterConfig` field to store configuration data
- Parsing of 0x01 packets in `onDataReceived()`
- Configuration section in device info dialog
- Proper state reset for config data

**Example Output in Device Info Dialog:**
```
═══ 0x01 CONFIGURATION/SETTINGS ═══
Source: 0x01 packet auto-uploaded by meter

Software Version: 8025_01.00.01

Speed Limits (km/h):
  Cruise Min: 3
  Eco Mode: 15
  Comfort Mode: 22
  Sport Mode: 31

Fault Status:
  No active faults

Enabled Panels: SN Code, BMS
Speed Unit: km/h

Raw 0x01 hex:
AB 01 19 03 0F 16 1F 00 00 00 00 00 ...
```

## Packet Structure Details

### 0x01 Packet Format (25 bytes total):

| Byte | Field | Example | Description |
|------|-------|---------|-------------|
| 0 | Header | 0xAB | Packet header (0xAB or 0xF0) |
| 1 | Instruction | 0x01 | Command code |
| 2 | Length | 0x19 | Total bytes (25) |
| 3 | Min Cruise | 0x03 | Min speed for cruise (3 km/h) |
| 4 | Max Eco | 0x0F | Eco mode limit (15 km/h) |
| 5 | Max Comfort | 0x16 | Comfort limit (22 km/h) |
| 6 | Max Sport | 0x1F | Sport limit (31 km/h) |
| 7 | Reserved | 0x00 | Not used |
| 8 | Fault High | 0x00 | Fault flags high byte |
| 9 | Fault Low | 0x00 | Fault flags low byte |
| 10 | Panel High | 0x00 | Panel select high byte |
| 11 | Panel Low | 0x00 | Panel select low byte |
| 12-17 | Reserved | 0x00 | Not used (6 bytes) |
| 18 | SW Ver 1 | 0x80 | Software version byte 1 |
| 19 | SW Ver 2 | 0x25 | Software version byte 2 |
| 20 | SW Ver 3 | 0x01 | Software version byte 3 |
| 21 | SW Ver 4 | 0x00 | Software version byte 4 |
| 22 | SW Ver 5 | 0x01 | Software version byte 5 |
| 23 | CRC Low | - | MODBUS CRC16 low byte |
| 24 | CRC High | - | MODBUS CRC16 high byte |

## Key Features

### Automatic Packet Reception
The 0x01 packet is **automatically uploaded** by the scooter meter at regular intervals (~200ms), no request needed.

### Fault Detection
The app now captures and displays all fault codes:
```java
configInfo.getActiveFaults()
// Returns: "E1: Brake failure\nE4: Overcurrent"
```

### Speed Limit Analysis
Useful for understanding scooter configuration:
```java
int maxSportSpeed = configInfo.maxSpeedSport;
String unit = configInfo.getSpeedUnit(); // "km/h" or "mph"
```

### Panel Configuration
See what features are enabled on the meter:
```java
configInfo.getEnabledPanels()
// Returns: "SN Code, BMS"
```

## Usage in App

### 1. Viewing Configuration Data
Connect to a scooter and tap **"View All Device Info"** button. The dialog now includes a dedicated section for configuration data with all parsed fields.

### 2. Packet Logging
All 0x01 packets are logged in the "ALL RECEIVED PACKETS" section with:
- Packet name: "01 (Config/Settings)"
- Byte-by-byte breakdown
- Raw hex dump

### 3. Data Access in Code
```java
if (scooterConfig != null) {
    // Access speed limits
    int sportMax = scooterConfig.maxSpeedSport;

    // Check for faults
    if (scooterConfig.brakeFailure) {
        Log.w(TAG, "Brake failure detected!");
    }

    // Get software version
    String version = scooterConfig.softwareVersion;
    // "8025_01.00.01"
}
```

## Differences from Other Packets

### 0x00 vs 0x01:

**0x00 (Real-time Data):**
- Current speed, battery level
- Motor RPM, temperature
- Real-time operational state
- Odometer readings
- Live fault codes

**0x01 (Configuration):**
- Speed limit **settings**
- Configured mode maximums
- Persistent fault flags
- Panel feature toggles
- Firmware version info

### 0xB0 vs 0x01 Software Version:

**0xB0 Version:**
- Controller HW/SW versions
- Meter HW/SW versions
- BMS HW/SW versions
- Parsed as nibbles (V2.9 format)

**0x01 Version:**
- Single software version string
- More detailed format (8025_01.00.01)
- Likely meter/display firmware

Both are useful for different purposes!

## Benefits

1. **Diagnostics**: See persistent fault flags that may not show in real-time
2. **Configuration Audit**: Verify speed limits are set correctly
3. **Feature Detection**: Know which panels/features are enabled
4. **Version Tracking**: Additional firmware version for correlation
5. **Troubleshooting**: Debug speed limit issues or configuration problems

## Technical Implementation

### ConfigInfo Class Methods:

```java
// Parse packet
ConfigInfo config = ConfigInfo.parse(packetBytes);

// Get active faults as formatted string
String faults = config.getActiveFaults();
// "E1: Brake failure\nE4: Overcurrent"

// Get enabled panels
String panels = config.getEnabledPanels();
// "SN Code, BMS"

// Get speed unit
String unit = config.getSpeedUnit();
// "km/h" or "mph"

// Get complete summary
String summary = config.toString();
```

### Fault Flag Bit Mapping:

```
Bit 0:  Fault warning enabled
Bit 1:  E1 - Brake failure
Bit 2:  E2 - Throttle fault
Bit 3:  E3 - Communication disconnect
Bit 4:  E4 - Overcurrent
Bit 7:  E7 - Hall fault
Bit 9:  E9 - Op amp bias
Bit 11: F1 - Brake not reset
Bit 12: F2 - Throttle not reset
```

### Panel Flag Bit Mapping:

```
Bit 0:  SN Code panel (1=enabled)
Bit 1:  MP3 panel (1=enabled)
Bit 2:  RGB panel (1=enabled)
Bit 3:  BMS panel (1=enabled)
Bit 12: Speed unit (0=km/h, 1=mph)
```

## Testing

### How to Test:
1. Build and install updated app
2. Connect to scooter
3. Wait for automatic data reception (~1-2 seconds)
4. Tap "View All Device Info" button
5. Scroll to "0x01 CONFIGURATION/SETTINGS" section
6. Verify speed limits, faults, and panels are displayed

### Expected Results:
- Speed limits match scooter configuration
- Speed unit matches display setting
- Active faults show if any exist
- Panel flags show enabled features
- Software version is formatted correctly

## Protocol Documentation

Based on: **"Hobbywing Scooter BLE Protocol B-01.0.01-241213.docx"**
- Most recent protocol specification (December 13, 2024)
- Documents 0x01 packet as "automatically uploaded by meter"
- No explicit request needed (unlike 0xB0 which requires request)

## Future Enhancements

Potential additions:
- [ ] Display config data in main UI (not just debug dialog)
- [ ] Alert user if critical faults detected
- [ ] Compare speed limits vs actual speed (safety check)
- [ ] Track config changes over time
- [ ] Export config data for diagnostics
- [ ] Write config changes (if protocol supports it)
- [ ] Log config to telemetry_snapshots table

## Files Modified

1. ✅ Created: `ConfigInfo.java` - Complete 0x01 packet parser
2. ✅ Modified: `FirmwareUpdaterActivity.java`
   - Added `scooterConfig` field
   - Parse 0x01 packets in `onDataReceived()`
   - Display config in device info dialog
   - Reset config data on state changes

## Database Integration (Future)

Consider adding config data to telemetry:

```sql
ALTER TABLE telemetry_snapshots ADD COLUMN config_data JSONB;

-- Example data:
{
  "speed_limits": {
    "eco": 15,
    "comfort": 22,
    "sport": 31,
    "cruise_min": 3,
    "unit": "km/h"
  },
  "faults": ["E1", "E4"],
  "panels": ["SN Code", "BMS"],
  "software_version": "8025_01.00.01"
}
```

This would enable tracking configuration changes and correlating with firmware updates.
