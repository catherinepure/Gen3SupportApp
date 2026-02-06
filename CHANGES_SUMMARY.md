# Changes Summary - Firmware Selection Feature

## Quick Reference

### Files Modified:
1. ✅ `admin-tool/admin_gui.py` (line 1256 - fixed database constraint violation)
2. ✅ `app/src/main/java/com/pure/gen3firmwareupdater/SupabaseClient.java` (added getAllFirmwareForHardware method)
3. ✅ `app/src/main/java/com/pure/gen3firmwareupdater/FirmwareUpdaterActivity.java` (added firmware selection UI and logic)
4. ✅ `app/src/main/res/layout/activity_firmware_updater.xml` (added btnChooseFirmware button)

### Files Created:
1. 📄 `supabase_schema_updated.sql` - Complete corrected schema
2. 📄 `supabase_migration.sql` - Safe migration script for existing database ⭐ **RUN THIS**
3. 📄 `FIRMWARE_SELECTION_FEATURE.md` - Detailed documentation
4. 📄 `CHANGES_SUMMARY.md` - This file

---

## Problem Solved

**Original Error**:
```
'message': 'null value in column "target_hw_version" of relation "firmware_versions"
violates not-null constraint'
```

**Root Cause**: Admin tool was using new `firmware_hw_targets` junction table but not setting the required `target_hw_version` field.

**Solution**: Updated admin tool to set `target_hw_version` to the first hardware version in the list.

---

## New Feature Added

Users can now:
1. See the latest available firmware automatically
2. Click a button to view ALL available firmware versions
3. Choose which version to install
4. See release notes for each version

---

## What You Need to Do

### Step 1: Update Database Schema
```bash
# In Supabase SQL Editor, run:
supabase_migration.sql
```

This will:
- Add `firmware_hw_targets` table
- Add `access_level` column to `firmware_versions`
- Add `hw_version` column to `scooters`
- Add `telemetry_snapshots` table
- Migrate existing data

### Step 2: Build and Test Android App
```bash
# In Android Studio or terminal:
./gradlew assembleDebug
# Or click the green Run button in Android Studio
```

### Step 3: Test the Feature
1. Open admin tool and upload firmware with multiple HW versions
   - Example: "V1.0, V1.1, V2.0"
2. Install app on phone
3. Activate with distributor code
4. Scan and connect to scooter
5. After verification, you should see: **"Install v2.78"** button
6. Click button to see options or select different version

---

## Code Changes Explained

### 1. SupabaseClient.java - New API Method
```java
// NEW METHOD: Get all firmware versions for a hardware version
public void getAllFirmwareForHardware(String hwVersion, Callback<List<FirmwareVersion>> callback)

// HOW IT WORKS:
// 1. Query firmware_hw_targets table: "Which firmware IDs support this HW version?"
// 2. Query firmware_versions table: "Get details for these firmware IDs where is_active=true"
// 3. Return sorted list (newest first)
```

### 2. FirmwareUpdaterActivity.java - UI Logic
```java
// CHANGED: After scooter verification
// OLD: Auto-download latest firmware
handler.postDelayed(() -> downloadFirmware(), 1000);

// NEW: Show button and wait for user
btnChooseFirmware.setVisibility(View.VISIBLE);
btnChooseFirmware.setText("Install " + fw.version_label);

// NEW METHOD: Show firmware selection dialog
private void showFirmwareSelectionDialog() {
    // 1. Fetch all firmware versions
    // 2. Show AlertDialog with list
    // 3. User selects version
    // 4. Download selected firmware
}

// NEW: Smart button click handler
btnChooseFirmware.setOnClickListener(v -> {
    if (targetFirmware != null) {
        // Show: Install Now / Choose Different / Cancel
    } else {
        showFirmwareSelectionDialog();
    }
});
```

### 3. activity_firmware_updater.xml - UI Element
```xml
<!-- NEW BUTTON: Shows after scooter verification -->
<com.google.android.material.button.MaterialButton
    android:id="@+id/btnChooseFirmware"
    android:text="Choose Firmware Version"
    android:visibility="gone" />
```

---

## Data Flow Diagram

```
User connects to scooter
         ↓
App reads HW version (e.g., "HW9073_V2.78")
         ↓
Query: firmware_hw_targets WHERE hw_version = "HW9073_V2.78"
         ↓
Returns: [fw_id_1, fw_id_2, fw_id_3]
         ↓
Query: firmware_versions WHERE id IN (fw_id_1, fw_id_2, fw_id_3) AND is_active = true
         ↓
Returns: [
  {id: fw_id_1, version_label: "v2.78", release_notes: "Latest"},
  {id: fw_id_2, version_label: "v2.75", release_notes: "Stable"},
  {id: fw_id_3, version_label: "v2.70", release_notes: "LTS"}
]
         ↓
Show dialog: User selects "v2.75"
         ↓
Download firmware from: /storage/v1/object/public/firmware-binaries/[file_path]
         ↓
Upload to scooter via BLE
```

---

## Schema Changes Visualization

### Before (Old Schema):
```
firmware_versions
├── id (UUID)
├── version_label (TEXT)
├── file_path (TEXT)
├── target_hw_version (TEXT)  ← Single HW version only
└── is_active (BOOLEAN)
```

### After (New Schema):
```
firmware_versions                    firmware_hw_targets
├── id (UUID)                        ├── id (UUID)
├── version_label (TEXT)             ├── firmware_version_id (FK)
├── file_path (TEXT)                 └── hw_version (TEXT)
├── target_hw_version (TEXT) ← Still required (primary)
├── access_level (TEXT) ← NEW         ↑
└── is_active (BOOLEAN)               └─── One firmware can target
                                           multiple HW versions
```

---

## Example Usage

### Admin Tool - Upload Firmware:
```
Version Label: v2.78
Target HW Versions: V1.0, V1.1, V2.0  ← Comma-separated
File: firmware_v2_78.bin
Access Level: Distributor
```

Result in database:
```sql
-- firmware_versions table:
id: abc-123
version_label: v2.78
target_hw_version: V1.0  (first in list)
access_level: distributor

-- firmware_hw_targets table:
(abc-123, "V1.0")
(abc-123, "V1.1")
(abc-123, "V2.0")
```

### Android App - User Experience:
```
1. Scooter verified ✓
   Hardware: HW9073_V2.78

2. [Install v2.78] ← Button appears
   Latest firmware: v2.78 (tap below to change)

3. User taps button:
   ┌─────────────────────────────┐
   │ Firmware Installation       │
   ├─────────────────────────────┤
   │ Install v2.78?              │
   │                             │
   │ [Install Now]               │
   │ [Choose Different Version]  │
   │ [Cancel]                    │
   └─────────────────────────────┘

4. User taps "Choose Different Version":
   ┌─────────────────────────────────────┐
   │ Select Firmware Version             │
   ├─────────────────────────────────────┤
   │ ○ v2.78 - Latest stable release     │
   │ ○ v2.75 - Previous stable version   │
   │ ○ v2.70 - Extended battery support  │
   └─────────────────────────────────────┘
```

---

## Testing Script

```bash
# 1. Update database
psql supabase < supabase_migration.sql

# 2. Verify tables exist
psql supabase -c "SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'firmware%';"
# Expected: firmware_versions, firmware_hw_targets, firmware_uploads

# 3. Build Android app
cd app
./gradlew clean assembleDebug

# 4. Install on device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# 5. Run admin tool
cd admin-tool
python admin_gui.py
```

---

## Troubleshooting

### Issue: "No firmware available for hardware version X"
**Cause**: No entries in `firmware_hw_targets` table for that HW version
**Fix**:
1. Open admin tool
2. Edit firmware version
3. Add HW version to "Target HW Versions" field
4. Save

### Issue: Button doesn't appear after verification
**Cause**: `getLatestFirmware()` call failed
**Check**:
1. Logcat: `adb logcat | grep FirmwareUpdater`
2. Look for "getLatestFirmware error"
3. Verify database has active firmware for that HW version

### Issue: Admin tool upload still fails
**Cause**: Migration not run yet
**Fix**: Run `supabase_migration.sql` first

---

## Next Steps / Future Enhancements

- [ ] Add firmware version comparison (show current vs available)
- [ ] Add "Recommended" badge to suggested version
- [ ] Show file size and download time estimate
- [ ] Add firmware changelog viewer
- [ ] Support firmware search/filter by date
- [ ] Add "Auto-update" toggle in settings
- [ ] Track which distributor installed which firmware version
