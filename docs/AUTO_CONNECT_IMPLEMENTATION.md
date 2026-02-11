# Auto-Connect to Selected Scooter Implementation

## Overview
This implementation adds automatic connection functionality when a distributor selects a specific scooter from the "Manage Scooters" screen. Previously, selecting a scooter would open the firmware updater but wouldn't actually connect to it.

## User Flow

### Before (Old Behavior):
1. Distributor logs in
2. Clicks "Manage Scooters"
3. Selects a scooter from the list
4. Chooses "Update Firmware"
5. **Firmware updater opens but doesn't connect** ❌
6. User had to manually select the scooter again from scan results

### After (New Behavior):
1. Distributor logs in
2. Clicks "Manage Scooters"
3. Selects a scooter from the list
4. Chooses "Update Firmware"
5. **App automatically scans for and connects to that specific scooter** ✓
6. Telemetry is captured and scan record is created
7. User can proceed with firmware update or go back

## Implementation Details

### Changes to FirmwareUpdaterActivity.java

#### 1. Added Target Scooter Field
```java
private String targetScooterSerial = null;  // Pre-selected scooter serial from intent
```

#### 2. Extract Target Scooter from Intent
In `onCreate()`:
```java
// Check if a specific scooter was selected (from ScooterSelectionActivity)
targetScooterSerial = getIntent().getStringExtra("target_scooter_serial");
if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
    Log.d(TAG, "Target scooter selected: " + targetScooterSerial);
}
```

#### 3. Auto-Start Scanning for Target Scooter
In `autoLoadDistributorInfo()`:
```java
// If a target scooter was selected, go directly to scanning
if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
    Log.d(TAG, "Target scooter specified, starting scan immediately");
    // Add the target scooter to the list so it can be matched
    scooterSerials.clear();
    scooterSerials.add(targetScooterSerial);
    // Start scanning directly
    setState(State.SCANNING);
    startScanning();
} else {
    // Fetch scooter list and proceed to scanning
    fetchScooterList();
}
```

#### 4. Auto-Connect When Target Scooter Found
In `onScanCompleted()`:
```java
// If a target scooter was specified, try to connect to it automatically
if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
    Log.d(TAG, "Looking for target scooter: " + targetScooterSerial);
    for (ScanResult result : devices) {
        BluetoothDevice device = result.getDevice();
        String deviceName = device.getName();
        if (deviceName != null && deviceName.equals(targetScooterSerial)) {
            Log.d(TAG, "Found target scooter, connecting automatically");
            connectToScooter(device);
            return;
        }
    }
    // Target scooter not found in this scan
    Log.w(TAG, "Target scooter " + targetScooterSerial + " not found in scan results");
    showError("Scooter " + targetScooterSerial + " not found nearby. Make sure it is powered on and in range.");
    return;
}

// No target scooter specified - show picker so user can select
showDevicePicker(devices);
```

#### 5. Enhanced Status Display
In `setState()`:
```java
case SCANNING:
    groupScanning.setVisibility(View.VISIBLE);
    if (targetScooterSerial != null && !targetScooterSerial.isEmpty()) {
        tvStatus.setText("Scanning for scooter: " + targetScooterSerial + "...");
    } else {
        tvStatus.setText("Scanning for scooters...");
    }
    break;
```

## Data Flow

```
ScooterSelectionActivity
    ↓ (Intent with "target_scooter_serial" extra)
FirmwareUpdaterActivity.onCreate()
    ↓ (Extract targetScooterSerial from intent)
checkPermissions() → Permissions granted
    ↓
autoLoadDistributorInfo()
    ↓ (if targetScooterSerial != null)
startScanning()
    ↓
onScanCompleted()
    ↓ (Find device with matching name)
connectToScooter(device)
    ↓
onDeviceConnected()
    ↓
requestVersionInfo() + requestBMSData()
    ↓
onVersionReceived()
    ↓
createScanRecord(with telemetry)
    ↓
verifyScooter() / showFirmwareOptions()
```

## Error Handling

### Target Scooter Not Found
If the specified scooter isn't found during BLE scan:
- Shows error: "Scooter [serial] not found nearby. Make sure it is powered on and in range."
- User can go back and try again
- User can select "Manage Scooters" to choose a different scooter

### Connection Failure
If connection fails after finding the scooter:
- Standard BLE connection error handling applies
- User can retry via "Scan Again" button
- Back button returns to distributor menu

### No Permissions
If Bluetooth/location permissions aren't granted:
- Shows permission request dialog
- Auto-load and auto-scan only happen after permissions granted
- Permission denial shows appropriate error message

## Testing

### Test Case 1: Normal Auto-Connect
1. Login as distributor
2. Click "Manage Scooters"
3. Select a scooter from the list (e.g., "ZYD00001234")
4. Click "Update Firmware"
5. **Expected**:
   - App shows "Scanning for scooter: ZYD00001234..."
   - Automatically connects when found
   - Captures telemetry and creates scan record
   - Shows firmware options or "Scooter verified" message

### Test Case 2: Target Scooter Not In Range
1. Login as distributor
2. Click "Manage Scooters"
3. Select a scooter from the list
4. Click "Update Firmware"
5. **Expected**:
   - App scans for 3 seconds
   - Shows error: "Scooter [serial] not found nearby..."
   - User can go back or retry

### Test Case 3: Manual Selection (No Target)
1. Login as distributor
2. Click "Update Scooter Firmware" from menu (not via Manage Scooters)
3. **Expected**:
   - App shows "Scanning for scooters..."
   - Shows device picker with all found scooters
   - User manually selects which to connect to

### Test Case 4: View Details Without Connection
1. Login as distributor
2. Click "Manage Scooters"
3. Select a scooter
4. Click "View Details"
5. **Expected**:
   - Goes directly to ScooterDetailsActivity
   - Shows scan/update history
   - No BLE connection is made

## Debugging

Enable verbose logging:
```bash
adb logcat | grep -E "FirmwareUpdater|BLEManager"
```

Key log messages to look for:
- `Target scooter selected: [serial]`
- `Target scooter specified, starting scan immediately`
- `Looking for target scooter: [serial]`
- `Found target scooter, connecting automatically`
- `Target scooter [serial] not found in scan results`

## Notes

- The target scooter serial must exactly match the BLE device name
- BLE device names are typically the ZYD serial number (e.g., "ZYD00001234")
- Scan timeout is 3 seconds (defined in BLEManager)
- If multiple scooters with the same name are in range, connects to the first one found
- Target scooter is cleared after successful connection (not reused on retry)

## Future Enhancements

- Add "Retry" button that appears after "scooter not found" error
- Show RSSI strength indicator while scanning for target scooter
- Add option to connect to any scooter if target not found
- Remember last connected scooter for quick reconnect
- Add timeout warning: "Still scanning... Is the scooter powered on?"
