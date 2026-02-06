# Scooter Management UX/UI Design

## Data Model Understanding

### Tables:
1. **scooters** - Physical scooters in distributor's inventory
   - `zyd_serial` (unique)
   - `distributor_id` (who owns it)
   - `model`, `hw_version`, `notes`

2. **users** - End customers and distributors
   - `email`, `password_hash`
   - `first_name`, `last_name`, demographic info
   - `user_level` ('user', 'distributor', 'maintenance', 'admin')
   - `distributor_id` (if they're a distributor)

3. **user_scooters** - Links users to their registered scooters
   - `user_id` + `scooter_id` (many-to-many relationship)
   - `zyd_serial`
   - Initial telemetry captured at registration
   - `registered_at`, `last_connected_at`
   - `is_primary`, `nickname`

4. **firmware_uploads** - Scan/update history
   - Telemetry captured during each scan
   - Status, versions, timestamps

## Distributor Use Cases

### Use Case 1: Service a Walk-In Customer with Scooter
**Scenario**: Customer brings scooter to shop for service/update

**Current Flow** (BROKEN):
1. Distributor clicks "Manage Scooters"
2. Sees list of ALL scooters in inventory (could be hundreds)
3. Has to scroll through list to find the specific scooter
4. Selects scooter → "Update Firmware"
5. App tries to auto-connect but customer's scooter might not be in that list

**Better Flow**:
1. Distributor clicks "Scan for Scooter"
2. App scans for nearby BLE devices
3. Shows list of found scooters (only those physically present)
4. Distributor selects the one customer brought in
5. App shows:
   - Scooter serial (ZYD123...)
   - Current firmware versions
   - **Is this scooter registered to a customer?**
     - If YES: Show customer name, email, registration date
     - If NO: Show "Unregistered - In Inventory"
6. Action options:
   - Update Firmware
   - View History
   - View Customer Details (if registered)

### Use Case 2: Search Database for Specific Scooter
**Scenario**: Customer calls/emails about their scooter, distributor needs to look it up

**Flow**:
1. Distributor clicks "Search Scooter"
2. Enter search criteria:
   - Scooter serial number (ZYD...)
   - OR Customer email
   - OR Customer name
3. Show results:
   - Scooter serial
   - Model, firmware versions
   - **Registration status**:
     - Registered to: [Customer Name] ([email])
     - Registered on: [date]
     - Last connected: [date]
   - Scan/Update history
4. Actions available:
   - View Full History
   - View Customer Profile
   - Note: Cannot update firmware remotely (must scan physically)

### Use Case 3: View Inventory
**Scenario**: Distributor wants to see all scooters they have

**Flow**:
1. Distributor clicks "View Inventory"
2. Show filterable list:
   - Filter by: All / Registered / Unregistered
   - Search bar for serial number
   - Sort by: Serial / Registration Date / Last Update
3. Each item shows:
   - Serial number
   - Registration status icon (✓ registered / ○ unregistered)
   - Customer name (if registered)
   - Last firmware update date
4. Click item → View Details (no auto-connect)

## Proposed New Structure

### Distributor Menu Options:

```
┌─────────────────────────────────┐
│   Distributor: [Name]           │
│                                  │
│  ┌─────────────────────────┐   │
│  │  🔍 Scan for Scooter    │   │  ← PRIMARY ACTION
│  └─────────────────────────┘   │
│                                  │
│  ┌─────────────────────────┐   │
│  │  🔎 Search Database      │   │  ← Lookup by serial/customer
│  └─────────────────────────┘   │
│                                  │
│  ┌─────────────────────────┐   │
│  │  📋 View Inventory       │   │  ← Browse all scooters
│  └─────────────────────────┘   │
│                                  │
│  ┌─────────────────────────┐   │
│  │  🚪 Logout               │   │
│  └─────────────────────────┘   │
└─────────────────────────────────┘
```

## Detailed Flow Designs

### Flow 1: Scan for Scooter (PRIMARY)

```
┌────────────────────────────────────────────┐
│ Scan for Scooter                           │
├────────────────────────────────────────────┤
│                                            │
│ Scanning for nearby scooters...           │
│ [Progress indicator]                       │
│                                            │
│ Found:                                     │
│ ┌────────────────────────────────────┐   │
│ │ ZYD00001234  RSSI: -45 dBm        │   │
│ └────────────────────────────────────┘   │
│ ┌────────────────────────────────────┐   │
│ │ ZYD00005678  RSSI: -67 dBm        │   │
│ └────────────────────────────────────┘   │
│                                            │
│ [Scan Again]  [Cancel]                    │
└────────────────────────────────────────────┘
         ↓ Select scooter
┌────────────────────────────────────────────┐
│ Connecting to ZYD00001234...              │
│ [Progress indicator]                       │
└────────────────────────────────────────────┘
         ↓ Connected
┌────────────────────────────────────────────┐
│ Scooter Details                            │
├────────────────────────────────────────────┤
│ Serial: ZYD00001234                       │
│                                            │
│ === VERSION INFO ===                      │
│ Hardware: V9.2                            │
│ Software: V8.2                            │
│                                            │
│ === TELEMETRY ===                         │
│ Battery: 85% (95% health)                 │
│ Odometer: 1,250 km                        │
│ Charge Cycles: 42                         │
│                                            │
│ === REGISTRATION STATUS ===               │
│ ✓ Registered                              │
│ Owner: John Smith                         │
│ Email: john@example.com                   │
│ Registered: Jan 15, 2024                  │
│ Last Connected: Feb 01, 2024              │
│                                            │
│ [Update Firmware]                         │
│ [View History]                            │
│ [View Customer Profile]                   │
│ [Back]                                    │
└────────────────────────────────────────────┘
```

### Flow 2: Search Database

```
┌────────────────────────────────────────────┐
│ Search Scooter Database                    │
├────────────────────────────────────────────┤
│                                            │
│ Search by:                                 │
│                                            │
│ ○ Scooter Serial Number                   │
│   [ZYD________________]                    │
│                                            │
│ ○ Customer Email                          │
│   [___________________]                    │
│                                            │
│ ○ Customer Name                           │
│   [___________________]                    │
│                                            │
│ [Search]  [Clear]  [Cancel]               │
└────────────────────────────────────────────┘
         ↓ Search
┌────────────────────────────────────────────┐
│ Search Results                             │
├────────────────────────────────────────────┤
│                                            │
│ Found 2 scooters for "John Smith":       │
│                                            │
│ ┌────────────────────────────────────┐   │
│ │ ZYD00001234 (Primary)              │   │
│ │ Registered: Jan 15, 2024           │   │
│ │ Last Update: Feb 01, 2024          │   │
│ │ Firmware: V8.2 / HW: V9.2          │   │
│ └────────────────────────────────────┘   │
│                                            │
│ ┌────────────────────────────────────┐   │
│ │ ZYD00005678                        │   │
│ │ Registered: Mar 10, 2024           │   │
│ │ Last Update: Mar 12, 2024          │   │
│ │ Firmware: V8.1 / HW: V9.0          │   │
│ └────────────────────────────────────┘   │
│                                            │
│ [Back to Search]                          │
└────────────────────────────────────────────┘
         ↓ Click scooter
┌────────────────────────────────────────────┐
│ Scooter Details (Database View)           │
├────────────────────────────────────────────┤
│ Serial: ZYD00001234                       │
│ Status: ○ Not Connected                   │
│                                            │
│ === REGISTRATION ===                      │
│ Owner: John Smith (Primary)               │
│ Email: john@example.com                   │
│ Registered: Jan 15, 2024                  │
│                                            │
│ === LAST KNOWN INFO ===                   │
│ Firmware: V8.2 / Hardware: V9.2           │
│ Odometer: 1,250 km (as of Feb 01)        │
│ Battery: 42 charge cycles                 │
│                                            │
│ [View Full History]                       │
│ [View Customer Profile]                   │
│ [Connect to Update] ← Opens scan screen  │
│ [Back]                                    │
└────────────────────────────────────────────┘
```

### Flow 3: View Inventory

```
┌────────────────────────────────────────────┐
│ Scooter Inventory                          │
├────────────────────────────────────────────┤
│                                            │
│ Filter: [All ▼]  Search: [________]      │
│                                            │
│ 127 scooters in inventory                 │
│                                            │
│ ┌────────────────────────────────────┐   │
│ │ ✓ ZYD00001234                      │   │
│ │   → John Smith                     │   │
│ │   Last: Feb 01, 2024              │   │
│ └────────────────────────────────────┘   │
│                                            │
│ ┌────────────────────────────────────┐   │
│ │ ○ ZYD00005555                      │   │
│ │   Unregistered - In Stock         │   │
│ │   Last: Jan 20, 2024              │   │
│ └────────────────────────────────────┘   │
│                                            │
│ ┌────────────────────────────────────┐   │
│ │ ✓ ZYD00009999                      │   │
│ │   → Jane Doe                       │   │
│ │   Last: Feb 05, 2024              │   │
│ └────────────────────────────────────┘   │
│                                            │
│ [Load More]  [Back to Menu]              │
└────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Restructure Activities

1. **DistributorMenuActivity** - Update menu options:
   - "Scan for Scooter" → Opens ScanScooterActivity (NEW)
   - "Search Database" → Opens SearchScooterActivity (NEW)
   - "View Inventory" → Opens InventoryActivity (renamed from ScooterSelectionActivity)
   - "Logout"

2. **ScanScooterActivity** (NEW):
   - Scans for BLE devices
   - Shows list of found scooters
   - User selects one
   - Connects and reads version + telemetry
   - Queries database to check registration status
   - Shows comprehensive scooter info
   - Actions: Update Firmware / View History / View Customer

3. **SearchScooterActivity** (NEW):
   - Search input (serial / email / name)
   - Query database for matches
   - Show results with registration info
   - Click to view details (database view, not connected)

4. **InventoryActivity** (renamed):
   - Browse all scooters
   - Filter: All / Registered / Unregistered
   - Search bar
   - Click to view details (no auto-connect)

5. **ScooterDetailsActivity** (enhanced):
   - Two modes:
     - Connected mode: Live telemetry + database info
     - Database mode: Last known info from database
   - Show registration status and customer info
   - Actions depend on mode

### Phase 2: Add Database Queries

1. **Check Registration Status**:
   ```sql
   SELECT
     us.user_id,
     u.first_name,
     u.last_name,
     u.email,
     us.registered_at,
     us.last_connected_at,
     us.is_primary,
     us.nickname
   FROM user_scooters us
   JOIN users u ON u.id = us.user_id
   WHERE us.scooter_id = [scooter_uuid]
   ORDER BY us.registered_at DESC
   ```

2. **Search Scooters**:
   ```sql
   -- By serial
   SELECT * FROM scooters WHERE zyd_serial = 'ZYD...'

   -- By customer email
   SELECT s.*, us.*, u.first_name, u.last_name, u.email
   FROM scooters s
   JOIN user_scooters us ON us.scooter_id = s.id
   JOIN users u ON u.id = us.user_id
   WHERE u.email ILIKE '%email%'

   -- By customer name
   WHERE u.first_name ILIKE '%name%' OR u.last_name ILIKE '%name%'
   ```

3. **Get Inventory with Registration Status**:
   ```sql
   SELECT
     s.*,
     u.first_name,
     u.last_name,
     u.email,
     us.registered_at,
     us.is_primary,
     (SELECT MAX(started_at) FROM firmware_uploads WHERE scooter_id = s.id) as last_update
   FROM scooters s
   LEFT JOIN user_scooters us ON us.scooter_id = s.id
   LEFT JOIN users u ON u.id = us.user_id
   WHERE s.distributor_id = [distributor_uuid]
   ORDER BY s.zyd_serial
   ```

### Phase 3: Update UI/UX

1. Registration status indicators
2. Customer info cards
3. Search interface
4. Filter/sort controls
5. Action buttons based on context

## Benefits of This Approach

1. **Clearer User Intent**: "Scan" vs "Search" vs "Browse"
2. **Physical Context**: Scan shows only physically present scooters
3. **Customer Visibility**: Immediately shows who owns the scooter
4. **Flexible Lookup**: Search by serial, email, or name
5. **No Auto-Connect Confusion**: Only connects when explicitly scanning
6. **Better Database Browsing**: Can review inventory without BLE
7. **Service Context**: Distributor sees customer info while servicing scooter

## Next Steps

Would you like me to:
1. Implement the new ScanScooterActivity?
2. Add search functionality?
3. Enhance ScooterDetailsActivity with registration status?
4. Create the database query methods in SupabaseClient?
