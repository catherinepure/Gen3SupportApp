# Component Serial Number Tracking

**Date:** 2026-02-09
**Migration:** `20260209000006_component_serial_numbers.sql`
**Status:** Ready to deploy

---

## Overview

The scooters table currently only tracks the main **ZYD serial number** (`zyd_serial`). Individual component serial numbers (battery, motor, frame, controller) are not stored.

This migration adds **proper normalized tables** for tracking all component serial numbers with full replacement history.

---

## Current vs New Schema

### ❌ **Current (Limited)**
```sql
scooters (
    id UUID,
    zyd_serial TEXT UNIQUE,  -- Only main scooter ID
    -- No battery serial
    -- No motor serial
    -- No frame serial
    -- No controller serial
    ...
)
```

### ✅ **New (Complete Tracking)**
```sql
-- Main scooter record (unchanged)
scooters (
    id UUID,
    zyd_serial TEXT UNIQUE
)

-- Component tables (new)
scooter_batteries (
    id UUID,
    scooter_id UUID FK → scooters(id),
    battery_serial TEXT,
    manufacturer, model, capacity_mah,
    installed_date, removed_date,
    is_current BOOLEAN,  -- Only one current per scooter
    installation_odometer_km,
    removal_reason
)

scooter_motors (...)      -- Same structure
scooter_frames (...)      -- Same structure
scooter_controllers (...) -- Same structure
```

---

## Why Separate Tables?

### **1. Replacement History**
Components get replaced during repairs. A single scooter may have:
- 3 batteries over its lifetime
- 2 motors (one replaced after crash)
- 1 frame (original)
- 2 controllers (one upgraded)

With normalized tables, we maintain **full component lifecycle history**.

### **2. Component-Specific Data**
Each component type has unique attributes:
- **Battery:** capacity_mah, manufacture_date, health metrics
- **Motor:** power_watts, manufacturer
- **Frame:** material, weight_kg, color
- **Controller:** hw_version, sw_version

### **3. Serial Number Uniqueness**
Battery serials are unique globally across all scooters. Same for motors and frames. Separate tables allow proper unique constraints.

---

## Table Structures

### 🔋 **scooter_batteries**

Tracks battery serial numbers and replacement history.

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| scooter_id | UUID FK | References scooters(id) CASCADE |
| battery_serial | TEXT | Battery manufacturer serial |
| manufacturer | TEXT | e.g., "Samsung", "LG", "CATL" |
| model | TEXT | Battery model number |
| capacity_mah | INTEGER | Nominal capacity (e.g., 15000) |
| manufacture_date | DATE | When battery was produced |
| installed_date | TIMESTAMPTZ | When installed on this scooter |
| removed_date | TIMESTAMPTZ | NULL if currently installed |
| **is_current** | BOOLEAN | TRUE for current battery (only one per scooter) |
| installation_odometer_km | NUMERIC | Odometer reading at install |
| removal_reason | TEXT | "replacement", "upgrade", "defective" |

**Unique Constraint:** Only one `is_current = true` per scooter_id

**Example Data:**
```sql
-- Scooter ZYD_0726800 has had 2 batteries
scooter_id='abc...', battery_serial='BAT-0726800-01', is_current=false, removed_date='2025-06-15', removal_reason='defective'
scooter_id='abc...', battery_serial='BAT-0726800-02', is_current=true,  removed_date=NULL
```

---

### ⚙️ **scooter_motors**

Tracks motor serial numbers and replacements.

| Column | Type | Description |
|--------|------|-------------|
| motor_serial | TEXT | Motor manufacturer serial |
| manufacturer | TEXT | e.g., "Bosch", "Bafang" |
| model | TEXT | Motor model number |
| power_watts | INTEGER | Rated power (e.g., 750W) |
| is_current | BOOLEAN | Current motor for scooter |

Same structure as batteries with install/removal tracking.

---

### 🛴 **scooter_frames**

Tracks frame/chassis serial numbers.

| Column | Type | Description |
|--------|------|-------------|
| frame_serial | TEXT | Frame manufacturer serial |
| frame_type | TEXT | "standard", "sport", "cargo" |
| material | TEXT | "aluminum", "carbon fiber", "steel" |
| color | TEXT | Frame color |
| weight_kg | NUMERIC | Frame weight |

Frames rarely get replaced (only after crash/recall).

---

### 🖥️ **scooter_controllers**

Tracks controller board serial numbers.

| Column | Type | Description |
|--------|------|-------------|
| controller_serial | TEXT | Controller board serial |
| hw_version | TEXT | Hardware revision |
| sw_version | TEXT | Firmware version at install |
| manufacturer | TEXT | Controller manufacturer |

Controllers may be replaced for upgrades or failures.

---

## Key Features

### ✅ **1. Automatic Replacement Tracking**

When a new component is marked as `is_current = true`, a trigger automatically:
- Marks the old component as `is_current = false`
- Sets `removed_date = now()`
- Sets `removal_reason = 'replaced'` (if not already set)

```sql
-- Example: Replace battery
INSERT INTO scooter_batteries (
    scooter_id, battery_serial, is_current, ...
) VALUES (
    'abc-123...', 'BAT-NEW-001', true, ...
);
-- Old battery automatically marked as removed!
```

### ✅ **2. Component History Queries**

```sql
-- Get all batteries ever used on a scooter
SELECT * FROM scooter_batteries
WHERE scooter_id = 'abc-123...'
ORDER BY installed_date;

-- Get current components for a scooter
SELECT
    s.zyd_serial,
    b.battery_serial,
    m.motor_serial,
    f.frame_serial,
    c.controller_serial
FROM scooters s
LEFT JOIN scooter_batteries b ON b.scooter_id = s.id AND b.is_current = true
LEFT JOIN scooter_motors m ON m.scooter_id = s.id AND m.is_current = true
LEFT JOIN scooter_frames f ON f.scooter_id = s.id AND f.is_current = true
LEFT JOIN scooter_controllers c ON c.scooter_id = s.id AND c.is_current = true
WHERE s.id = 'abc-123...';
```

### ✅ **3. Component Lifetime Analysis**

```sql
-- Average battery lifespan
SELECT
    AVG(installation_odometer_km - removal_odometer_km) as avg_km_per_battery
FROM scooter_batteries
WHERE removed_date IS NOT NULL;

-- Most common removal reasons
SELECT removal_reason, COUNT(*) as count
FROM scooter_batteries
WHERE removed_date IS NOT NULL
GROUP BY removal_reason
ORDER BY count DESC;
```

### ✅ **4. Warranty & Recall Tracking**

```sql
-- Find all scooters with a specific battery serial (recall)
SELECT s.zyd_serial, s.country_of_registration, b.installed_date
FROM scooters s
JOIN scooter_batteries b ON b.scooter_id = s.id
WHERE b.battery_serial LIKE 'BAT-RECALL-%'
AND b.is_current = true;
```

---

## Row Level Security

| User Role | Permissions |
|-----------|-------------|
| **manufacturer_admin** | Full access to all component serials |
| **distributor** | View components for their scooters only |
| **workshop** | View components for scooters they're servicing |
| **regular user** | No access (privacy) |

---

## Sample Data Included

The migration includes sample data for **first 5 scooters**:

```sql
-- Batteries: BAT-0726800-01, BAT-0726801-01, ...
-- Motors:    MOT-0726800-01, MOT-0726801-01, ...
-- Frames:    FRAME-0726800-01, FRAME-0726801-01, ...
-- Controllers: CTRL-0726800-01, CTRL-0726801-01, ...
```

Manufacturers vary by country:
- **GB (UK):** Samsung batteries, Bosch motors
- **US:** LG batteries, Bafang motors
- **DE (Germany):** CATL batteries, Bafang motors

---

## Integration with Existing Tables

### 📊 **Enhanced Telemetry Linking**

Current telemetry captures battery health and cycles, but doesn't link to battery serial:

```sql
-- BEFORE (no battery serial linkage)
scooter_telemetry (
    scooter_id UUID,
    battery_soc, battery_health, battery_charge_cycles, ...
)

-- AFTER (can correlate telemetry with specific battery)
SELECT
    t.scanned_at,
    t.battery_health,
    t.battery_charge_cycles,
    b.battery_serial,
    b.manufacturer
FROM scooter_telemetry t
JOIN scooter_batteries b ON b.scooter_id = t.scooter_id AND b.is_current = true
WHERE t.scooter_id = '...';
```

### 🔧 **Service Job Enhancements**

Service jobs can now track which components were replaced:

```sql
-- Add to service_jobs JSONB parts_used field:
{
    "battery_replaced": {
        "old_serial": "BAT-0726800-01",
        "new_serial": "BAT-0726800-02",
        "reason": "battery health below 60%"
    },
    "motor_replaced": null
}
```

---

## Deployment

### **1. Deploy Migration**

```bash
npx supabase db push
# Runs: 20260209000006_component_serial_numbers.sql
```

### **2. Verify Tables Created**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name LIKE 'scooter_%'
ORDER BY table_name;

-- Should show:
-- scooter_batteries
-- scooter_controllers
-- scooter_frames
-- scooter_motors
-- scooter_telemetry
-- scooters
```

### **3. Verify Sample Data**

```sql
SELECT
    (SELECT COUNT(*) FROM scooter_batteries) as batteries,
    (SELECT COUNT(*) FROM scooter_motors) as motors,
    (SELECT COUNT(*) FROM scooter_frames) as frames,
    (SELECT COUNT(*) FROM scooter_controllers) as controllers;

-- Should return 5 rows each if you have 5+ scooters
```

---

## Future Enhancements

### 📱 **Android App Integration**

Update firmware scanner to capture and submit component serials:

```kotlin
// VersionInfo.kt
data class ComponentSerials(
    val batterySerial: String?,
    val motorSerial: String?,
    val controllerSerial: String?
)

// Extract from BLE packets and submit to API
```

### 🌐 **Web Admin UI**

Add component management to scooter detail page:

```javascript
// Show current components
GET /admin -> scooters, get, { id: '...', include_components: true }

// Returns:
{
    scooter: {...},
    components: {
        battery: { serial: 'BAT-...', health: 85%, ... },
        motor: { serial: 'MOT-...', ... },
        frame: { serial: 'FRAME-...', ... }
    }
}
```

### 📊 **Analytics Dashboard**

- Battery failure rates by manufacturer
- Average component lifespan by region
- Warranty claim tracking
- Recall management

---

## Benefits Summary

| Benefit | Description |
|---------|-------------|
| **✅ Complete Traceability** | Track every component from manufacture to disposal |
| **✅ Warranty Management** | Know exactly which battery/motor is under warranty |
| **✅ Recall Handling** | Instantly identify affected scooters |
| **✅ Maintenance Planning** | Predict component failures based on history |
| **✅ Quality Analysis** | Compare component performance by manufacturer |
| **✅ Inventory Management** | Track replacement parts usage |
| **✅ Fraud Prevention** | Detect stolen components being reused |

---

**Migration Status:** ✅ Ready to deploy
**Breaking Changes:** None (additive only)
**Backward Compatible:** Yes (existing queries unaffected)
