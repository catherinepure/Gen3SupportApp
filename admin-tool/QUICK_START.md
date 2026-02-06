# Quick Start Guide - Gen3 Firmware Updater Updates

## Step 1: Run the Database Migration

Open your Supabase dashboard and go to the SQL Editor. Copy and paste the contents of `migration.sql` and execute it.

This will:
- ✅ Add `access_level` column to firmware_versions ('public' or 'distributor')
- ✅ Create `firmware_hw_targets` junction table (maps firmware to multiple HW versions)
- ✅ Add `hw_version` column to scooters table
- ✅ Create `telemetry_snapshots` table (stores odometer, battery cycles, etc.)
- ✅ Set up RLS policies for security
- ✅ Create helper functions for the mobile app API

**IMPORTANT:** The migration keeps the old `target_hw_version` column for backward compatibility. After confirming everything works, you can optionally drop it later.

## Step 2: Test the Admin Tools

### CLI Tool (admin.py)

```bash
cd admin-tool

# Test firmware list (should show new "Access" column)
python admin.py firmware list

# Test telemetry commands (will be empty initially)
python admin.py telemetry stats

# Test scooter list (should show new "HW Ver" column)
python admin.py scooter list
```

### GUI Tool (admin_gui.py)

```bash
# Launch the GUI
python admin_gui.py

# Check:
# 1. Firmware tab now shows "Access" and "Target HW" columns
# 2. New "Telemetry" tab exists
# 3. Scooter tab shows "HW Ver" column
```

## Step 3: Upload Your First Multi-HW Firmware

### Using CLI:

```bash
# Upload firmware for multiple HW versions
python admin.py firmware upload path/to/firmware.bin V2.5 "V1.0,V1.1,V2.0" \
  --access distributor \
  --notes "Bug fixes"

# Make it public after testing
python admin.py firmware set-access V2.5 public
```

### Using GUI:

1. Open admin_gui.py
2. Go to Firmware tab
3. Click "Upload Firmware"
4. Browse for .bin file
5. Enter version label (e.g., V2.5)
6. Enter HW versions comma-separated: `V1.0, V1.1, V2.0`
7. Select access level: Public or Distributor
8. Click Upload

## What's New

### Multiple Hardware Versions per Firmware
Before: One firmware = one HW version
Now: One firmware = multiple HW versions

Example:
```bash
# Same firmware works on V1.0, V1.1, V2.0
python admin.py firmware upload fw.bin V3.0 "V1.0,V1.1,V2.0"

# Later, add V2.1 support
python admin.py firmware add-hw-target V3.0 V2.1
```

### Public vs. Distributor Access
- **Public**: Anyone can access (no login needed)
- **Distributor**: Requires activation code authentication

Example:
```bash
# Release as distributor-only first
python admin.py firmware upload fw.bin V2.5 V1.0 --access distributor

# Test with distributors...

# Then make public
python admin.py firmware set-access V2.5 public
```

### Telemetry Tracking
- Odometer readings (km)
- Battery cycle counts
- HW/SW version distribution
- Anonymous (no user identification)

Example:
```bash
# View telemetry
python admin.py telemetry list --limit 50

# See statistics
python admin.py telemetry stats
```

### Scooter Hardware Versions
Scooters can now have HW version tracked:

```bash
# Add scooter with HW version
python admin.py scooter add ZYD123 "Distributor" --hw-version V1.0

# Batch add
python admin.py scooter add-batch "Distributor" ZYD001 ZYD002 --hw-version V1.0
```

## Common Commands Cheat Sheet

### Firmware Management
```bash
# List firmware with HW targets and access levels
python admin.py firmware list

# Upload with multiple HW versions
python admin.py firmware upload fw.bin V2.3 "V1.0,V1.1" --access public

# Add HW target to existing firmware
python admin.py firmware add-hw-target V2.3 V2.0

# Remove HW target
python admin.py firmware remove-hw-target V2.3 V1.0

# Change access level
python admin.py firmware set-access V2.3 public

# Deactivate firmware
python admin.py firmware deactivate V2.3
```

### Telemetry
```bash
# List all telemetry
python admin.py telemetry list

# Filter by scooter
python admin.py telemetry list --zyd ZYD12345

# Show statistics
python admin.py telemetry stats
```

### Scooters
```bash
# Add with HW version
python admin.py scooter add ZYD001 "Distributor" --hw-version V1.0

# Batch add with HW version
python admin.py scooter add-batch "Distributor" ZYD001 ZYD002 --hw-version V1.0

# List scooters (shows HW version)
python admin.py scooter list
```

## Troubleshooting

### "Column 'access_level' not found"
➜ Run the migration.sql script in Supabase

### "Table 'firmware_hw_targets' not found"
➜ Run the migration.sql script in Supabase

### GUI shows old columns
➜ Restart the GUI after running migration

### "No telemetry data yet"
➜ Normal! Data will appear after mobile app is updated and users connect scooters

## Next Steps

1. ✅ **Run migration.sql** - Database changes
2. ✅ **Test admin tools** - CLI and GUI
3. ⏳ **Update mobile app** - See API_DOCUMENTATION.md
4. ⏳ **Test end-to-end** - Public and distributor flows
5. ⏳ **Monitor telemetry** - Watch for insights

## Documentation Files

- **migration.sql** - Database migration script (RUN THIS FIRST!)
- **SCHEMA_CHANGES.md** - Detailed schema documentation
- **API_DOCUMENTATION.md** - Mobile app API endpoints
- **USAGE_GUIDE.md** - Comprehensive admin tool guide
- **CHANGES_SUMMARY.md** - Complete overview of changes

## Support

If something doesn't work:
1. Check migration.sql ran without errors
2. Verify .env has correct Supabase credentials
3. Test connection in GUI Settings tab
4. Review Supabase dashboard for errors
5. Check USAGE_GUIDE.md troubleshooting section
