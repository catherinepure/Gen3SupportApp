# Gen3 Firmware Updater - Changes Summary

## Overview

The firmware management system has been enhanced to support:
1. ✅ **Multiple hardware versions per firmware** - Handle hardware overlap between scooters
2. ✅ **Public vs. Distributor access control** - Two-tier authentication system
3. ✅ **Anonymous telemetry tracking** - Odometer and battery cycle data collection
4. ✅ **Privacy-focused design** - No user identification required

---

## Database Changes

### New Tables

#### 1. `firmware_hw_targets` (Junction Table)
Maps firmware to multiple hardware versions (many-to-many relationship).

**Columns:**
- `id` - Primary key
- `firmware_version_id` - Foreign key to firmware_versions
- `hw_version` - Hardware version string (e.g., "V1.0")
- `created_at` - Timestamp

**Example:**
```
Firmware V2.3 can now target: V1.0, V1.1, V2.0
└─ Three rows in firmware_hw_targets table
```

#### 2. `telemetry_snapshots` (New)
Stores anonymous usage data from scooter connections.

**Columns:**
- `id` - Primary key
- `zyd_serial` - Scooter serial (text, NOT foreign key for privacy)
- `firmware_upload_id` - Optional link to upload log
- `hw_version` - Hardware version
- `sw_version` - Software version
- `odometer_km` - Odometer reading
- `battery_cycles` - Battery cycle count
- `captured_at` - Timestamp
- `notes` - Optional notes

**Privacy:** ZYD serials are stored as text for tracking but not linked via foreign key, allowing public users to remain anonymous.

### Modified Tables

#### `firmware_versions`
**Added:**
- `access_level` - TEXT ('public' or 'distributor')
  - `public` - Anyone can access
  - `distributor` - Requires activation code authentication

**Removed (logically):**
- `target_hw_version` - Moved to junction table (kept for backward compatibility)

#### `scooters`
**Added:**
- `hw_version` - TEXT (e.g., "V1.0", "V1.1")
  - Tracks hardware version of controller
  - Optional, can be NULL initially

### SQL Functions Created

1. **`get_available_firmware(p_hw_version, p_access_level, p_current_sw_version)`**
   - Returns available firmware for given HW version and access level
   - Respects minimum SW version requirements
   - Used by mobile app to query updates

2. **`record_telemetry(...)`**
   - Records anonymous telemetry snapshot
   - Returns snapshot ID
   - Allows INSERT by anyone (RLS policy)

3. **`validate_activation_code(p_activation_code)`**
   - Validates distributor activation code
   - Returns distributor info if valid
   - Used for distributor authentication

4. **`verify_zyd_for_distributor(p_distributor_id, p_zyd_serial)`**
   - Checks if ZYD serial belongs to distributor
   - Returns scooter info if valid
   - Prevents distributors from accessing other distributors' scooters

### RLS Policies

**firmware_versions:**
- Public can read active public firmware
- Service role has full access

**firmware_hw_targets:**
- Anyone can read HW targets for active firmware
- Service role has full access

**telemetry_snapshots:**
- Anyone can INSERT (anonymous submission)
- Only service role can SELECT (admin-only viewing)

---

## Admin Tool Changes (admin.py)

### Updated Commands

#### `firmware upload`
**Before:**
```bash
python admin.py firmware upload file.bin V2.3 V1.0
```

**After:**
```bash
# Single HW version
python admin.py firmware upload file.bin V2.3 V1.0 --access public

# Multiple HW versions (comma-separated)
python admin.py firmware upload file.bin V2.3 "V1.0,V1.1,V2.0" --access distributor
```

**New Parameters:**
- `target_hw_versions` - Accepts comma-separated list
- `--access` - Choice of 'public' or 'distributor' (default: distributor)

#### `firmware list`
**Added Columns:**
- Access level (public/distributor)
- Multiple HW versions shown as comma-separated

### New Commands

#### Firmware Management

**`firmware add-hw-target <version_label> <hw_version>`**
```bash
python admin.py firmware add-hw-target V2.3 V1.1
```
Add hardware version to existing firmware.

**`firmware remove-hw-target <version_label> <hw_version>`**
```bash
python admin.py firmware remove-hw-target V2.3 V1.0
```
Remove hardware version from firmware.

**`firmware set-access <version_label> <access_level>`**
```bash
python admin.py firmware set-access V2.3 public
```
Change access level (public/distributor).

#### Telemetry Viewing

**`telemetry list`**
```bash
python admin.py telemetry list --limit 50 --zyd ZYD12345
```
View telemetry snapshots with filtering.

**`telemetry stats`**
```bash
python admin.py telemetry stats
```
Show statistics:
- Total snapshots
- Unique scooters
- Average odometer reading
- Average battery cycles
- HW/SW version distribution

#### Scooter Management

**Updated `scooter add` and `scooter add-batch`**
```bash
python admin.py scooter add ZYD123 "Distributor" --hw-version V1.0
python admin.py scooter add-batch "Distributor" ZYD001 ZYD002 --hw-version V1.0
```
Now supports `--hw-version` parameter.

**Updated `scooter list`**
Now displays HW version column.

---

## Mobile App Integration

### Authentication Flows

#### Flow 1: Public User (No Login)
1. User opens app
2. App connects to scooter via Bluetooth
3. Reads HW version from controller
4. Queries firmware: `get_available_firmware(hw_version, 'public')`
5. Shows available updates
6. Downloads and flashes firmware
7. Records telemetry snapshot (optional but recommended)

**No authentication required** - uses Supabase anon key.

#### Flow 2: Distributor User (With Login)
1. User enters activation code
2. App validates: `validate_activation_code(code)`
3. If valid, stores distributor_id in session
4. User enters or scans ZYD serial
5. App verifies: `verify_zyd_for_distributor(distributor_id, zyd_serial)`
6. Connects to scooter
7. Queries firmware: `get_available_firmware(hw_version, 'distributor')`
8. Creates upload log entry (status='started')
9. Downloads and flashes firmware
10. Updates upload log (status='completed' or 'failed')
11. Records telemetry snapshot

**Authenticated access** - distributor can see both public and distributor-only firmware.

### API Endpoints

New Supabase RPC endpoints:
- `POST /rpc/validate_activation_code`
- `POST /rpc/verify_zyd_for_distributor`
- `POST /rpc/get_available_firmware`
- `POST /rpc/record_telemetry`

Plus standard REST endpoints:
- `POST /firmware_uploads` - Create upload log
- `PATCH /firmware_uploads` - Update upload status
- Storage API for signed download URLs

**Full documentation:** See `API_DOCUMENTATION.md`

---

## Migration Steps

### 1. Database Migration

Run the SQL migration script in Supabase:

```sql
-- Copy and paste contents of migration.sql into Supabase SQL Editor
-- Run all statements
```

This will:
- ✅ Add new columns to existing tables
- ✅ Create new tables
- ✅ Migrate existing firmware to junction table
- ✅ Set up RLS policies
- ✅ Create SQL functions

**Backward Compatibility:**
- Old `target_hw_version` column is kept initially
- Existing firmware records automatically migrated to junction table
- No data loss

### 2. Update Admin Tools

```bash
cd admin-tool
pip install --upgrade -r requirements.txt
```

Test CLI tool:
```bash
python admin.py firmware list
python admin.py telemetry stats
```

Test GUI tool:
```bash
python admin_gui.py
# Go to Settings tab and test connection
```

### 3. Update Mobile App

Implement new API endpoints (see API_DOCUMENTATION.md):

**Required changes:**
1. Add activation code input screen for distributors
2. Implement `validate_activation_code` call
3. Update firmware query to use `get_available_firmware`
4. Add telemetry collection (odometer, battery cycles)
5. Call `record_telemetry` before/after updates

**Optional improvements:**
1. Cache distributor session
2. Show HW version to user
3. Display available firmware access level
4. Show upload success statistics

### 4. Verify Migration

**Check database:**
```bash
python admin.py firmware list
# Should show Access column

python admin.py telemetry stats
# Should work (even if no data yet)
```

**Check firmware mapping:**
```sql
-- In Supabase SQL Editor
SELECT
    fv.version_label,
    fv.access_level,
    ARRAY_AGG(fht.hw_version) as hw_versions
FROM firmware_versions fv
LEFT JOIN firmware_hw_targets fht ON fv.id = fht.firmware_version_id
GROUP BY fv.id, fv.version_label, fv.access_level;
```

---

## Key Benefits

### 1. Hardware Flexibility
**Before:** One firmware = one HW version
**After:** One firmware = multiple HW versions

**Example:**
```bash
# Same firmware works on V1.0, V1.1, V2.0 controllers
python admin.py firmware upload universal.bin V3.0 "V1.0,V1.1,V2.0"

# Later discovered it also works on V2.1
python admin.py firmware add-hw-target V3.0 V2.1
```

### 2. Public Access
**Before:** All firmware required distributor authentication
**After:** Public firmware available to anyone

**Use Case:**
- Make stable, tested firmware public for end users
- Keep beta/experimental firmware distributor-only
- Gradual rollout: distributor → public

**Example:**
```bash
# Release as distributor-only first
python admin.py firmware upload new.bin V2.5 V1.0 --access distributor

# Test with distributors...

# Promote to public after testing
python admin.py firmware set-access V2.5 public
```

### 3. Anonymous Telemetry
**Before:** No usage data collected
**After:** Track odometer, battery cycles, HW/SW versions

**Benefits:**
- Identify firmware issues early (battery drain, etc.)
- Understand fleet usage patterns
- No user identification required (privacy-friendly)
- Helps diagnose failed updates

**Example Data:**
```
Total snapshots: 1,247
Unique scooters: 342
Avg odometer: 1,234.5 km
Avg battery cycles: 87

HW Versions:
  V1.0: 890
  V1.1: 245
  V2.0: 112

SW Versions:
  V2.3: 980
  V2.4: 267
```

### 4. Two-Tier Access
**Before:** One access model for all
**After:** Public + distributor access

**Benefits:**
- Public users: Easy access, no login needed
- Distributors: Access to all firmware, tracking, support
- Flexibility for different business models

---

## Breaking Changes

### For Existing Deployments

**Database:**
- ⚠️ Must run migration.sql
- ⚠️ Existing firmware will default to `access_level='distributor'`
- ⚠️ Must manually set `access_level='public'` if needed

**Admin Tools:**
- ⚠️ `firmware upload` command signature changed
- ⚠️ Now requires HW version parameter (can be comma-separated)
- ⚠️ Old commands will fail until updated

**Mobile App:**
- ✅ Can continue using old firmware query (backward compatible)
- ⚠️ New features require API updates
- ⚠️ Must implement new authentication flow for distributors

### Migration Path

**Option 1: Full Migration (Recommended)**
1. Run migration.sql
2. Update admin.py
3. Update mobile app with new APIs
4. Test thoroughly
5. Deploy

**Option 2: Gradual Migration**
1. Run migration.sql (backward compatible)
2. Update admin.py
3. Use CLI to manage firmware
4. Update mobile app later
5. Old app continues to work (distributor-only mode)

---

## Testing Checklist

### Database
- [ ] Run migration.sql without errors
- [ ] Existing firmware visible in `firmware list`
- [ ] HW targets created in junction table
- [ ] RLS policies working (test anon key access)
- [ ] SQL functions callable

### Admin CLI
- [ ] `firmware list` shows Access column
- [ ] `firmware upload` with multiple HW versions works
- [ ] `firmware add-hw-target` works
- [ ] `firmware set-access` works
- [ ] `telemetry list` works (even if empty)
- [ ] `telemetry stats` works
- [ ] `scooter add --hw-version` works

### Admin GUI
- [ ] Launches without errors
- [ ] Settings tab can connect to Supabase
- [ ] Firmware tab shows new fields
- [ ] Upload dialog includes access level
- [ ] All tabs load data correctly

### Mobile App (After Implementation)
- [ ] Public user can query public firmware
- [ ] Distributor can validate activation code
- [ ] Distributor can verify ZYD serial
- [ ] Distributor can query distributor firmware
- [ ] Telemetry recording works
- [ ] Upload logs created correctly

---

## Files Created/Modified

### New Files
- ✅ `migration.sql` - Database schema changes
- ✅ `SCHEMA_CHANGES.md` - Detailed schema documentation
- ✅ `API_DOCUMENTATION.md` - Mobile app API guide
- ✅ `USAGE_GUIDE.md` - Admin tool usage examples
- ✅ `CHANGES_SUMMARY.md` - This file

### Modified Files
- ✅ `admin.py` - Updated CLI commands
  - Modified: `firmware list`, `firmware upload`, `scooter list`, `scooter add`, `scooter add-batch`
  - Added: `firmware add-hw-target`, `firmware remove-hw-target`, `firmware set-access`
  - Added: `telemetry list`, `telemetry stats` command group
- ⏳ `admin_gui.py` - GUI updates needed (in progress)

### Files to Update Later
- ⏳ `admin_gui.py` - Add multi-HW selection, access level dropdown
- ⏳ Mobile app - Implement new API endpoints
- ⏳ `requirements.txt` - Verify all dependencies listed

---

## Next Steps

### Immediate
1. ✅ Run migration.sql in Supabase
2. ✅ Test CLI tool with new commands
3. ⏳ Update GUI tool (optional, CLI is fully functional)
4. ⏳ Review API_DOCUMENTATION.md with mobile app team

### Short Term
1. ⏳ Implement mobile app changes
2. ⏳ Test authentication flows
3. ⏳ Deploy to test environment
4. ⏳ Collect initial telemetry data

### Long Term
1. Monitor telemetry for insights
2. Refine public vs. distributor access strategy
3. Consider additional telemetry fields (GPS location, crash logs, etc.)
4. Build analytics dashboard from telemetry data

---

## Support & Questions

**Documentation:**
- Schema details: `SCHEMA_CHANGES.md`
- API usage: `API_DOCUMENTATION.md`
- Admin tool usage: `USAGE_GUIDE.md`

**Common Issues:**
See "Troubleshooting" section in `USAGE_GUIDE.md`

**Need Help?**
1. Check migration.sql ran successfully
2. Verify .env credentials correct
3. Test connection in GUI Settings tab
4. Review Supabase logs for errors
