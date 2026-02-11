# Firmware Selection Feature - Implementation Summary

## Overview
Added the ability for users to view and select from available firmware versions for their scooter hardware instead of automatically installing the latest version.

## Changes Made

### 1. Database Schema Updates
**File**: `supabase_migration.sql` (NEW)
- Added `firmware_hw_targets` junction table for many-to-many hardware version support
- Added `access_level` column to `firmware_versions` table
- Added `hw_version` column to `scooters` table
- Added `telemetry_snapshots` table
- Migrates existing data safely

**Action Required**: Run `supabase_migration.sql` in your Supabase SQL Editor

### 2. Backend API Enhancement
**File**: `SupabaseClient.java`

Added new method:
```java
public void getAllFirmwareForHardware(String hwVersion, Callback<List<FirmwareVersion>> callback)
```

**What it does**:
- Queries the `firmware_hw_targets` junction table to find all firmware versions compatible with a hardware version
- Returns a list of active firmware versions ordered by creation date (newest first)
- Supports the new many-to-many relationship between firmware and hardware versions

**How it works**:
1. Queries `firmware_hw_targets` table for firmware IDs that match the hardware version
2. Fetches full firmware records from `firmware_versions` where `is_active=true`
3. Returns sorted list of available firmware versions

### 3. Android App UI Updates
**File**: `activity_firmware_updater.xml`

Added new button in the "Verifying" section:
```xml
<com.google.android.material.button.MaterialButton
    android:id="@+id/btnChooseFirmware"
    android:layout_width="match_parent"
    android:layout_height="56dp"
    android:text="Choose Firmware Version"
    android:layout_marginTop="16dp"
    android:visibility="gone" />
```

**Behavior**:
- Hidden by default
- Shown after scooter verification when firmware is available
- Displays "Install [version]" when a firmware is selected

### 4. Android App Logic Updates
**File**: `FirmwareUpdaterActivity.java`

#### Key Changes:

**a) Modified Firmware Discovery Flow**:
```java
// OLD: Auto-downloaded latest firmware
// NEW: Shows firmware selection button
supabase.getLatestFirmware(hwVersion, callback);
// On success:
- Shows button: "Install [version]"
- Updates text: "Latest firmware: X.X (tap below to change)"
- Waits for user action (no auto-download)
```

**b) Added Firmware Selection Dialog**:
```java
private void showFirmwareSelectionDialog()
```
- Fetches all available firmware for the scooter's hardware version
- Displays a list dialog with version labels and release notes
- User selects desired version
- Updates UI and proceeds to download

**c) Smart Button Click Handler**:
```java
btnChooseFirmware.setOnClickListener(...)
```
When clicked:
- If firmware selected: Shows confirmation dialog with options:
  - "Install Now" → Proceeds to download
  - "Choose Different Version" → Opens selection dialog
  - "Cancel" → Returns to verifying screen
- If no firmware selected: Opens selection dialog directly

**d) State Management**:
- Button visibility properly managed across state transitions
- Hidden when scanning, connecting, downloading, uploading
- Shown only during verification after firmware is found
- Reset when moving to next scooter or changing distributor

## User Workflow

### Before (Automatic):
1. Connect to scooter
2. App automatically finds latest firmware
3. Auto-downloads and installs

### After (User Choice):
1. Connect to scooter
2. App finds latest firmware and shows button: **"Install v2.78"**
3. User has two options:
   - **Click button once** → Shows confirmation: "Install v2.78?" with options:
     - Install Now
     - Choose Different Version (opens full list)
     - Cancel
   - **Or just wait** → Can review device info first

4. When "Choose Different Version" is clicked:
   - Dialog shows all available firmware versions
   - Each entry shows: "v2.78 - Bug fixes and performance improvements"
   - User selects desired version
   - App updates button text and proceeds to download

### Example Firmware List Display:
```
Select Firmware Version
○ v2.78 - Latest stable release
○ v2.75 - Previous stable version
○ v2.70 - Extended battery support
```

## Database Schema Changes Required

The `firmware_hw_targets` table enables one firmware to support multiple hardware versions:

```sql
-- Example data:
Firmware v2.78 can target:
- HW9073_V2.78
- HW9073_V2.75
- HW9073_V2.70

Before: firmware_versions.target_hw_version = "HW9073_V2.78" (single value)
After:  firmware_hw_targets entries:
        - (fw_id, "HW9073_V2.78")
        - (fw_id, "HW9073_V2.75")
        - (fw_id, "HW9073_V2.70")
```

## Admin Tool Compatibility

The admin tool (`admin_gui.py`) was already updated to use the new schema:
- Line 1256: Sets `target_hw_version` (required by database)
- Lines 1264-1268: Creates `firmware_hw_targets` entries for all specified HW versions
- Lines 918-924: Reads HW targets when displaying firmware list

## Testing Checklist

- [ ] Run migration script in Supabase SQL Editor
- [ ] Upload firmware via admin tool with multiple HW versions (e.g., "V1.0, V1.1, V2.0")
- [ ] Build and install Android app
- [ ] Connect to a scooter
- [ ] Verify button shows: "Install [version]"
- [ ] Click button → Confirm "Install Now" works
- [ ] Click button → Choose "Choose Different Version" → Verify list shows all firmware
- [ ] Select different firmware → Verify download starts
- [ ] Verify button hides when scanning for next scooter

## Backward Compatibility

✅ **Fully backward compatible**:
- Existing `target_hw_version` column still used (required by schema)
- `getLatestFirmware()` method unchanged (still works for simple cases)
- New `getAllFirmwareForHardware()` method queries junction table
- Migration script safely adds new structures without breaking existing data

## Benefits

1. **User Control**: Distributors can choose specific firmware versions
2. **Rollback Support**: Can install previous stable versions if needed
3. **Testing**: Can install beta/test versions without affecting production firmware
4. **Flexibility**: Supports A/B testing or hardware-specific builds
5. **Transparency**: Shows release notes for each version

## Technical Notes

- Uses Android AlertDialog for native UI
- Async operations via SupabaseClient executor threads
- Proper error handling with Toast notifications
- Progress indicators during firmware list fetching
- State management prevents button showing at wrong times
