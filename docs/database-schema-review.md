# Database Schema Review - Gen3 Firmware Updater

**Date:** 2026-02-09
**Status:** Review Complete - Action Items Identified

## Executive Summary

The database schema is well-designed with 16 tables, 25 properly enforced foreign keys, and comprehensive Row Level Security. However, 3 critical issues were identified that should be addressed:

1. **Polymorphic address relationship** (entity_id not enforced)
2. **Missing scooter reference** in telemetry_snapshots
3. **Status transition validation** (app-level only)

---

## Complete Table Inventory

### Core Entities

#### 1. DISTRIBUTORS
- **Purpose:** Regional distributors managing scooter distribution
- **Key Fields:** activation codes (hash + plaintext), countries array
- **Relationships:** → scooters, workshops, users, firmware_uploads, activity_events
- **Status:** ✅ Well-designed

#### 2. SCOOTERS
- **Purpose:** Individual scooter inventory
- **Key Fields:** zyd_serial (unique), status, firmware_version, country
- **Foreign Keys:** distributor_id → distributors(id) CASCADE
- **Relationships:** → firmware_uploads, service_jobs, user_scooters, telemetry
- **Status:** ✅ Well-designed

#### 3. FIRMWARE_VERSIONS
- **Purpose:** Firmware release management
- **Key Fields:** version_label, target_hw_version, access_level
- **Relationships:** → firmware_hw_targets (M:M junction), firmware_uploads
- **Status:** ✅ Well-designed

#### 4. USERS
- **Purpose:** All user types (customers, distributors, workshop staff, admins)
- **Key Fields:** user_level, roles[], distributor_id, workshop_id
- **Foreign Keys:** distributor_id, workshop_id (both nullable)
- **Issue:** ⚠️ Dual user_level/roles[] system lacks validation
- **Status:** 🟡 Needs constraint

#### 5. WORKSHOPS
- **Purpose:** Service/repair workshops
- **Key Fields:** parent_distributor_id, service_area_countries[], activation codes
- **Foreign Keys:** parent_distributor_id → distributors(id) SET NULL
- **Relationships:** → service_jobs, users, addresses
- **Status:** ✅ Well-designed

#### 6. SERVICE_JOBS
- **Purpose:** Track repair/service work
- **Key Fields:** scooter_id, workshop_id, customer_id, technician_id, status
- **Foreign Keys:** All 4 entity IDs properly constrained
- **Issue:** ⚠️ No status transition validation at DB level
- **Status:** 🟡 Needs trigger

### Supporting Tables

#### 7. USER_SCOOTERS (M:M Junction)
- Links users to their registered scooters
- Stores initial telemetry snapshot
- ✅ Proper composite unique constraint

#### 8. FIRMWARE_HW_TARGETS (M:M Junction)
- Maps firmware versions to compatible hardware
- ✅ Proper composite unique constraint

#### 9. FIRMWARE_UPLOADS
- Tracks firmware update attempts
- Links: scooter, firmware_version, distributor
- ✅ All FKs enforced with CASCADE/SET NULL

#### 10. SCOOTER_TELEMETRY
- Real-time scooter data readings
- Links: scooter_id, user_id, distributor_id
- ✅ Proper indexing on time-series data

#### 11. TELEMETRY_SNAPSHOTS
- Historical telemetry tied to firmware uploads
- ⚠️ **Issue:** Uses zyd_serial (TEXT) instead of scooter_id FK
- **Reason:** Privacy - intentionally decoupled
- **Recommendation:** Add optional scooter_id (nullable) for known scooters

#### 12. ADDRESSES
- Physical addresses for distributors/workshops
- 🔴 **CRITICAL ISSUE:** Polymorphic entity_id NOT enforced
- Current: `entity_id` references either distributors OR workshops based on `entity_type`
- Risk: Orphaned addresses if parent deleted
- **Recommendation:** Split into distributor_addresses + workshop_addresses OR add proper polymorphic FK

### Audit & Security Tables

#### 13. ACTIVITY_EVENTS
- Immutable audit trail (append-only)
- Pre-resolved distributor_id from country
- ✅ Comprehensive event logging

#### 14. USER_AUDIT_LOG
- User-specific action tracking
- ✅ Proper FK to users with SET NULL on delete

#### 15. USER_SESSIONS
- Active session tracking
- ✅ Token-based with expiry

#### 16. PASSWORD_RESET_TOKENS
- Password reset workflow
- ✅ One-time use flag

---

## Critical Issues & Recommendations

### 🔴 Issue 1: Polymorphic Addresses (CRITICAL)

**Problem:**
```sql
-- Current schema
CREATE TABLE addresses (
    entity_type TEXT CHECK (entity_type IN ('distributor', 'workshop')),
    entity_id UUID,  -- ⚠️ NO FK CONSTRAINT
    ...
);
```

**Impact:**
- Orphaned addresses if distributor/workshop deleted
- No referential integrity
- Queries require app-level validation

**Solutions:**

**Option A: Split Tables (Recommended)**
```sql
CREATE TABLE distributor_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    distributor_id UUID NOT NULL REFERENCES distributors(id) ON DELETE CASCADE,
    line_1 TEXT NOT NULL,
    line_2 TEXT,
    city TEXT,
    region TEXT,
    postcode TEXT,
    country TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE workshop_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
    -- same columns as above
);
```

**Benefits:**
- True referential integrity
- Simpler queries
- Better performance (no polymorphic joins)

**Option B: Conditional FK with Triggers**
```sql
-- Keep current table, add validation trigger
CREATE OR REPLACE FUNCTION validate_address_entity()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.entity_type = 'distributor' THEN
        IF NOT EXISTS (SELECT 1 FROM distributors WHERE id = NEW.entity_id) THEN
            RAISE EXCEPTION 'Invalid distributor_id';
        END IF;
    ELSIF NEW.entity_type = 'workshop' THEN
        IF NOT EXISTS (SELECT 1 FROM workshops WHERE id = NEW.entity_id) THEN
            RAISE EXCEPTION 'Invalid workshop_id';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_address_entity_trigger
    BEFORE INSERT OR UPDATE ON addresses
    FOR EACH ROW EXECUTE FUNCTION validate_address_entity();
```

**Recommendation:** Use Option A (split tables) for cleaner design.

---

### 🟡 Issue 2: Telemetry Snapshots - Missing Scooter FK

**Problem:**
```sql
CREATE TABLE telemetry_snapshots (
    zyd_serial TEXT,  -- Stored as text for privacy
    firmware_upload_id UUID REFERENCES firmware_uploads(id),
    -- No scooter_id FK
);
```

**Impact:**
- Can't reliably join to scooters table
- Data integrity not enforced
- Analytics queries more complex

**Recommendation:**
```sql
ALTER TABLE telemetry_snapshots
ADD COLUMN scooter_id UUID REFERENCES scooters(id) ON DELETE SET NULL;

-- Optional: Add index
CREATE INDEX idx_telemetry_snapshots_scooter ON telemetry_snapshots(scooter_id);

-- Backfill existing data
UPDATE telemetry_snapshots ts
SET scooter_id = s.id
FROM scooters s
WHERE ts.zyd_serial = s.zyd_serial;
```

**Benefits:**
- Maintains privacy (nullable FK)
- Enables efficient joins
- Doesn't break existing queries

---

### 🟡 Issue 3: Status Transition Validation

**Problem:**
- Status fields exist in multiple tables (scooters, service_jobs, firmware_uploads)
- No database-level validation of state transitions
- Invalid transitions possible if app has bugs

**Example Invalid Transitions:**
- service_jobs: `completed` → `booked` (should be impossible)
- scooters: `decommissioned` → `active` (needs approval workflow)

**Recommendation:**
```sql
-- Add status transition validation function
CREATE OR REPLACE FUNCTION validate_service_job_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent invalid transitions
    IF OLD.status = 'completed' AND NEW.status IN ('booked', 'in_progress') THEN
        RAISE EXCEPTION 'Cannot change status from completed to %', NEW.status;
    END IF;

    IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
        RAISE EXCEPTION 'Cannot reopen cancelled jobs';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_service_job_status_trigger
    BEFORE UPDATE ON service_jobs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION validate_service_job_status();
```

---

### 🟢 Issue 4: User Level vs Roles Consistency

**Problem:**
- `user_level` (legacy enum) and `roles[]` (new array) both exist
- No constraint ensuring they stay in sync

**Recommendation:**
```sql
-- Add CHECK constraint
ALTER TABLE users
ADD CONSTRAINT check_user_level_roles_consistency
CHECK (
    (user_level = 'admin' AND 'admin' = ANY(roles)) OR
    (user_level = 'distributor' AND 'distributor' = ANY(roles)) OR
    (user_level = 'maintenance' AND 'workshop_staff' = ANY(roles)) OR
    (user_level = 'user')
);

-- OR deprecate user_level entirely
-- ALTER TABLE users DROP COLUMN user_level;
```

---

## Optimization Opportunities

### 1. Add Composite Indexes

```sql
-- Frequently queried combinations
CREATE INDEX idx_user_scooters_user_primary
    ON user_scooters(user_id, is_primary) WHERE is_primary = true;

CREATE INDEX idx_service_jobs_workshop_status
    ON service_jobs(workshop_id, status);

CREATE INDEX idx_firmware_uploads_scooter_status
    ON firmware_uploads(scooter_id, status);

CREATE INDEX idx_activity_events_user_timestamp
    ON activity_events(user_id, timestamp DESC);
```

### 2. Partition Activity Events

```sql
-- Large append-only table benefits from partitioning
CREATE TABLE activity_events_partitioned (
    -- same columns
) PARTITION BY RANGE (timestamp);

-- Create monthly partitions
CREATE TABLE activity_events_2026_01
    PARTITION OF activity_events_partitioned
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

### 3. Auto-Update Timestamps

```sql
-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER update_distributors_timestamp
    BEFORE UPDATE ON distributors
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Repeat for: workshops, scooters, service_jobs, users
```

---

## Row Level Security Status

✅ **RLS Enabled on 13 tables:**
- distributors, workshops, scooters
- users, user_scooters, user_sessions
- service_jobs, firmware_uploads, firmware_versions
- scooter_telemetry, activity_events
- addresses, user_audit_log

**Policy Strategy:**
- Distributors: See their territory only
- Workshops: See their jobs + parent distributor data
- Users: See own data only
- Admins: See everything

---

## Migration Priority

### Phase 1: Critical (Do First)
1. ✅ Fix addresses table (split or add trigger)
2. ✅ Add scooter_id to telemetry_snapshots

### Phase 2: Important
3. ✅ Add status transition triggers
4. ✅ Add composite indexes
5. ✅ Add updated_at triggers

### Phase 3: Nice to Have
6. ⭕ Partition activity_events
7. ⭕ Deprecate user_level in favor of roles[]
8. ⭕ Add materialized view for country coverage

---

## Schema Health: 8.5/10

**Strengths:**
- ✅ Proper normalization
- ✅ Comprehensive foreign keys
- ✅ Strong RLS implementation
- ✅ Good indexing strategy
- ✅ UUID primary keys
- ✅ Audit trail tables

**Weaknesses:**
- ❌ Polymorphic addresses lack FK
- ❌ Missing DB-level status validation
- ❌ Dual user_level/roles system

**Overall:** Well-architected schema with a few tactical improvements needed.
