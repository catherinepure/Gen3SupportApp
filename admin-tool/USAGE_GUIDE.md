# Gen3 Firmware Updater - Admin Tool Usage Guide

## Quick Start

### 1. Setup Database

First, run the migration script in your Supabase SQL Editor:

```bash
# Copy the contents of migration.sql and execute in Supabase dashboard
```

This will:
- Add `access_level` column to firmware_versions
- Create `firmware_hw_targets` junction table
- Add `hw_version` column to scooters
- Create `telemetry_snapshots` table
- Set up RLS policies
- Create helper functions

### 2. Configure Environment

Create a `.env` file in the `admin-tool` directory:

```bash
cp .env.example .env
```

Edit `.env` with your Supabase credentials:
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

Required packages:
- supabase-py
- click
- rich (for CLI)
- python-dotenv
- tkinter (usually included with Python)

---

## CLI Tool (admin.py)

### Distributor Management

**List all distributors:**
```bash
python admin.py distributor list
```

**Add a new distributor:**
```bash
python admin.py distributor add "Acme Scooters"
# Auto-generates activation code like: PURE-ABCD-1234

# Or specify custom code:
python admin.py distributor add "Acme Scooters" --code PURE-TEST-0001
```

**Regenerate activation code:**
```bash
python admin.py distributor regenerate-code "Acme Scooters"
```

**Deactivate a distributor:**
```bash
python admin.py distributor deactivate "Acme Scooters"
# Or by activation code:
python admin.py distributor deactivate PURE-ABCD-1234
```

---

### Scooter Management

**List all scooters:**
```bash
python admin.py scooter list

# Filter by distributor:
python admin.py scooter list -d "Acme Scooters"
```

**Add a single scooter:**
```bash
python admin.py scooter add ZYD12345 "Acme Scooters" \
  --model "Gen3 Pro" \
  --hw-version "V1.0" \
  --notes "Customer order #123"
```

**Add multiple scooters at once:**
```bash
python admin.py scooter add-batch "Acme Scooters" ZYD001 ZYD002 ZYD003 \
  --model "Gen3 Pro" \
  --hw-version "V1.0"
```

**Remove a scooter:**
```bash
python admin.py scooter remove ZYD12345
```

---

### Firmware Management

#### Upload New Firmware

**Single hardware version:**
```bash
python admin.py firmware upload controller_v2_3.bin V2.3 V1.0 \
  --min-sw V2.0 \
  --notes "Bug fixes and performance improvements" \
  --access public
```

**Multiple hardware versions (comma-separated):**
```bash
python admin.py firmware upload controller_v2_3.bin V2.3 "V1.0,V1.1,V2.0" \
  --access distributor
```

Options:
- `--min-sw` - Minimum current software version required for update
- `--notes` - Release notes (visible to users)
- `--access` - Either `public` (anyone) or `distributor` (auth required)

#### List Firmware

```bash
python admin.py firmware list
```

Shows:
- Version label
- Compatible hardware versions
- Access level (public/distributor)
- Minimum SW version requirement
- File path and size
- Active status
- Creation date

#### Manage Hardware Targets

**Add HW version to existing firmware:**
```bash
python admin.py firmware add-hw-target V2.3 V2.1
```

**Remove HW version from firmware:**
```bash
python admin.py firmware remove-hw-target V2.3 V1.0
```

#### Change Access Level

**Make firmware public:**
```bash
python admin.py firmware set-access V2.3 public
```

**Restrict to distributors only:**
```bash
python admin.py firmware set-access V2.3 distributor
```

#### Deactivate Firmware

**Stop offering firmware to devices:**
```bash
python admin.py firmware deactivate V2.3
```

---

### Telemetry Viewing

**List recent telemetry:**
```bash
python admin.py telemetry list

# Limit to 100 records:
python admin.py telemetry list --limit 100

# Filter by specific scooter:
python admin.py telemetry list --zyd ZYD12345
```

**Show telemetry statistics:**
```bash
python admin.py telemetry stats
```

Shows:
- Total snapshots collected
- Unique scooters seen
- Average odometer reading
- Average battery cycles
- Hardware version distribution
- Software version distribution

---

### Upload Logs

**List firmware upload attempts:**
```bash
python admin.py logs list

# Filter by status:
python admin.py logs list --status completed
python admin.py logs list --status failed

# Filter by distributor:
python admin.py logs list -d "Acme Scooters"

# Limit results:
python admin.py logs list --limit 100
```

**Show upload statistics:**
```bash
python admin.py logs stats
```

---

### Quick Setup Wizard

Interactive wizard to set up everything at once:

```bash
python admin.py setup
```

This will walk you through:
1. Creating a distributor with activation code
2. Adding scooter serial numbers
3. Uploading initial firmware

---

## GUI Tool (admin_gui.py)

### Launch the GUI

```bash
python admin_gui.py
```

### Features

The GUI has 5 tabs:

#### 1. Distributors Tab
- View all distributors in a table
- Add new distributor with auto-generated code
- Edit distributor details (name, code, active status)
- Regenerate activation codes
- Deactivate distributors
- Double-click activation code to copy to clipboard

#### 2. Scooters Tab
- View all scooters with distributor info
- Filter by distributor (dropdown)
- Add single scooter
- Batch add multiple scooters (paste list)
- Edit scooter details (serial, model, HW version, distributor)
- Remove scooters

#### 3. Firmware Tab
- View all firmware versions
- Upload new firmware
  - Browse for .bin file
  - Specify version label
  - Select target HW version(s)
  - Choose access level (public/distributor)
- Edit firmware metadata (version, HW targets, notes, active status)
- Deactivate firmware

#### 4. Upload Logs Tab
- View firmware update history
- Filter by status (all/completed/failed/started)
- Filter by distributor
- Color-coded status (green=completed, red=failed, orange=in progress)
- View statistics (total uploads, success rate)

#### 5. Settings Tab
- Configure Supabase connection
- Test connection
- Save credentials to .env file
- Show/hide service key

### GUI Advantages

- No need to remember command syntax
- Visual feedback with status bar
- Batch operations with progress tracking
- Built-in validation and error messages
- Clipboard integration for activation codes
- Responsive threading (UI doesn't freeze during operations)

---

## Common Workflows

### Workflow 1: Onboard New Distributor

```bash
# 1. Create distributor
python admin.py distributor add "New Distributor Co"
# Note the activation code: PURE-ABCD-1234

# 2. Add their scooters
python admin.py scooter add-batch "New Distributor Co" \
  ZYD101 ZYD102 ZYD103 ZYD104 ZYD105 \
  --hw-version "V1.0" \
  --model "Gen3 Standard"

# 3. Give them the activation code to use in the mobile app
```

### Workflow 2: Release New Firmware

```bash
# 1. Upload firmware for specific hardware
python admin.py firmware upload gen3_v2_5.bin V2.5 "V1.0,V1.1" \
  --min-sw "V2.0" \
  --notes "Critical security update and bug fixes" \
  --access distributor

# 2. Test with a distributor first
# (Distributors can now see this update in the app)

# 3. Once tested, make it public
python admin.py firmware set-access V2.5 public

# 4. Monitor updates
python admin.py logs list --limit 50
```

### Workflow 3: Support Hardware Overlap

Some scooters have different HW versions but can use the same firmware:

```bash
# Upload firmware that works on V1.0, V1.1, and V2.0
python admin.py firmware upload universal_fw.bin V3.0 "V1.0,V1.1,V2.0" \
  --access public

# Later, found it also works on V2.1
python admin.py firmware add-hw-target V3.0 V2.1

# But causes issues on V1.0
python admin.py firmware remove-hw-target V3.0 V1.0
```

### Workflow 4: Monitor Fleet Health

```bash
# Check telemetry stats
python admin.py telemetry stats

# Look for scooters with high mileage
python admin.py telemetry list --limit 500 | grep -E "odometer.*[5-9][0-9]{3}"

# View recent updates
python admin.py logs list --limit 50

# Check success rate
python admin.py logs stats
```

### Workflow 5: Investigate Failed Updates

```bash
# List failed updates
python admin.py logs list --status failed

# Check if specific scooter has issues
python admin.py telemetry list --zyd ZYD12345

# View distributor's update history
python admin.py logs list -d "Problematic Distributor"
```

---

## Tips & Best Practices

### Firmware Management

1. **Always test distributor-only first** before making firmware public
2. **Use descriptive version labels** (V2.3, V2.3.1, etc.)
3. **Specify min SW version** to prevent invalid update paths
4. **Keep release notes concise** - users see these in the app
5. **Don't delete old firmware** - just deactivate it (preserves history)

### Hardware Versions

1. **Be specific with HW versions** - don't use wildcards
2. **Test on all target HW versions** before release
3. **Use comma-separated list** for batch HW targeting
4. **Monitor telemetry** to discover actual HW versions in field

### Access Control

1. **Default to distributor-only** for new firmware (safer)
2. **Make public only after testing** with distributors
3. **Public firmware reaches everyone** - cannot restrict by distributor
4. **Activation codes are permanent** - deactivate rather than delete

### Telemetry

1. **Telemetry is anonymous** - no user identification
2. **Collect before and after update** - helps diagnose issues
3. **Review periodically** - identifies firmware issues early
4. **High battery cycles** - may indicate charging problems
5. **Odometer anomalies** - may indicate tampering or errors

### Database Maintenance

1. **Run backups regularly** - Supabase dashboard has backup tools
2. **Monitor storage usage** - firmware binaries add up
3. **Archive old logs** - keep recent 6-12 months active
4. **Check inactive distributors** - clean up test accounts

---

## Troubleshooting

### "Connection failed" error

**Problem:** Cannot connect to Supabase

**Solutions:**
1. Check `.env` file has correct credentials
2. Verify SUPABASE_URL is correct (https://your-project.supabase.co)
3. Ensure using SERVICE_ROLE_KEY (not anon key)
4. Test connection in Settings tab (GUI) or with `setup` command
5. Check Supabase project is not paused (free tier auto-pauses)

### "No firmware found" for scooter

**Problem:** App cannot find updates for scooter

**Solutions:**
1. Check scooter's HW version: `python admin.py scooter list`
2. Check firmware HW targets: `python admin.py firmware list`
3. Verify firmware is active: `is_active = true`
4. Check access level matches (public vs distributor)
5. Verify distributor is active if using distributor firmware

### "Activation code invalid" in app

**Problem:** Distributor cannot log in

**Solutions:**
1. Verify code exists: `python admin.py distributor list`
2. Check distributor is active (not deactivated)
3. Check for typos (O vs 0, I vs 1, etc.)
4. Regenerate code if needed: `python admin.py distributor regenerate-code "Name"`

### Upload stuck on "started" status

**Problem:** Log shows "started" but never completes

**Solutions:**
1. App likely crashed or lost connection during update
2. These are normal - users may cancel updates
3. Monitor for patterns - same firmware/HW combination failing?
4. Check firmware file size - larger files more prone to interruption

### Telemetry not appearing

**Problem:** No telemetry data collected

**Solutions:**
1. Verify mobile app is calling `record_telemetry` function
2. Check RLS policies allow INSERT on telemetry_snapshots
3. Verify anon key has correct permissions
4. Check app error logs for API errors

---

## Advanced Usage

### Bulk Import from CSV

Create a CSV with scooter data:

```csv
zyd_serial,distributor,model,hw_version
ZYD001,Acme Scooters,Gen3 Pro,V1.0
ZYD002,Acme Scooters,Gen3 Pro,V1.0
ZYD003,Beta Distributors,Gen3 Lite,V1.1
```

Import script:
```python
import csv
from supabase import create_client

sb = create_client(url, key)

with open('scooters.csv') as f:
    reader = csv.DictReader(f)
    for row in reader:
        # Get distributor ID
        dist = sb.table('distributors').select('id').eq('name', row['distributor']).execute()
        dist_id = dist.data[0]['id']

        # Insert scooter
        sb.table('scooters').insert({
            'zyd_serial': row['zyd_serial'],
            'distributor_id': dist_id,
            'model': row['model'],
            'hw_version': row['hw_version']
        }).execute()
```

### Export Telemetry for Analysis

```python
from supabase import create_client
import csv

sb = create_client(url, key)
data = sb.table('telemetry_snapshots').select('*').execute()

with open('telemetry_export.csv', 'w', newline='') as f:
    if data.data:
        writer = csv.DictWriter(f, fieldnames=data.data[0].keys())
        writer.writeheader()
        writer.writerows(data.data)
```

### Automated Firmware Promotion

Script to auto-promote firmware from distributor to public after testing:

```python
# promote_firmware.py
import sys
from supabase import create_client

version_label = sys.argv[1]
sb = create_client(url, key)

# Check if any failures in last 50 updates
logs = sb.table('firmware_uploads').select('status').eq('firmware_version_id', firmware_id).limit(50).execute()
failures = sum(1 for log in logs.data if log['status'] == 'failed')

if failures < 2:  # Less than 2 failures
    sb.table('firmware_versions').update({'access_level': 'public'}).eq('version_label', version_label).execute()
    print(f"✓ Promoted {version_label} to public")
else:
    print(f"✗ Too many failures ({failures}) - not promoting")
```

---

## Support

For issues or questions:
1. Check logs: `python admin.py logs list --status failed`
2. Review telemetry: `python admin.py telemetry stats`
3. Verify database schema matches migration.sql
4. Check Supabase dashboard for errors
5. Review API_DOCUMENTATION.md for mobile app integration
