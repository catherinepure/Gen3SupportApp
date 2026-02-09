-- Migration: Schema Improvements - Foreign Keys & Constraints
-- Date: 2026-02-09
-- Description: Addresses critical foreign key gaps and adds validation

-- ============================================================================
-- PART 1: Fix Telemetry Snapshots - Add Optional Scooter FK
-- ============================================================================

-- Add scooter_id column (nullable for privacy)
ALTER TABLE telemetry_snapshots
ADD COLUMN IF NOT EXISTS scooter_id UUID REFERENCES scooters(id) ON DELETE SET NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_telemetry_snapshots_scooter
    ON telemetry_snapshots(scooter_id);

-- Backfill existing data where serial matches
UPDATE telemetry_snapshots ts
SET scooter_id = s.id
FROM scooters s
WHERE ts.zyd_serial = s.zyd_serial
AND ts.scooter_id IS NULL;

COMMENT ON COLUMN telemetry_snapshots.scooter_id IS 'Optional FK to scooters - nullable for privacy compliance';

-- ============================================================================
-- PART 2: Fix Addresses Table - Split Polymorphic Relationship
-- ============================================================================

-- Create distributor_addresses table
CREATE TABLE IF NOT EXISTS distributor_addresses (
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

-- Create workshop_addresses table
CREATE TABLE IF NOT EXISTS workshop_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workshop_id UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
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

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_distributor_addresses_distributor
    ON distributor_addresses(distributor_id);

CREATE INDEX IF NOT EXISTS idx_workshop_addresses_workshop
    ON workshop_addresses(workshop_id);

CREATE INDEX IF NOT EXISTS idx_distributor_addresses_country
    ON distributor_addresses(country);

CREATE INDEX IF NOT EXISTS idx_workshop_addresses_country
    ON workshop_addresses(country);

-- Migrate data from old addresses table
INSERT INTO distributor_addresses (id, distributor_id, line_1, line_2, city, region, postcode, country, is_primary, created_at, updated_at)
SELECT id, entity_id, line_1, line_2, city, region, postcode, country, is_primary, created_at, updated_at
FROM addresses
WHERE entity_type = 'distributor'
ON CONFLICT (id) DO NOTHING;

INSERT INTO workshop_addresses (id, workshop_id, line_1, line_2, city, region, postcode, country, is_primary, created_at, updated_at)
SELECT id, entity_id, line_1, line_2, city, region, postcode, country, is_primary, created_at, updated_at
FROM addresses
WHERE entity_type = 'workshop'
ON CONFLICT (id) DO NOTHING;

-- Note: Keep old addresses table for now (don't drop until migration verified)
-- DROP TABLE addresses; -- Uncomment after verifying migration

-- ============================================================================
-- PART 3: Add Status Transition Validation
-- ============================================================================

-- Service Jobs Status Validation
CREATE OR REPLACE FUNCTION validate_service_job_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent reverting completed jobs
    IF OLD.status = 'completed' AND NEW.status IN ('booked', 'in_progress', 'awaiting_parts') THEN
        RAISE EXCEPTION 'Cannot change status from completed to %', NEW.status
            USING HINT = 'Create a new service job instead';
    END IF;

    -- Prevent reopening cancelled jobs
    IF OLD.status = 'cancelled' AND NEW.status != 'cancelled' THEN
        RAISE EXCEPTION 'Cannot reopen cancelled jobs'
            USING HINT = 'Create a new service job instead';
    END IF;

    -- Require completed_date when marking completed
    IF NEW.status = 'completed' AND NEW.completed_date IS NULL THEN
        NEW.completed_date = now();
    END IF;

    -- Clear completed_date if reverting from completed (shouldn't happen but safety check)
    IF OLD.status = 'completed' AND NEW.status != 'completed' THEN
        NEW.completed_date = NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_service_job_status_trigger ON service_jobs;
CREATE TRIGGER validate_service_job_status_trigger
    BEFORE UPDATE ON service_jobs
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION validate_service_job_status();

-- Scooter Status Validation
CREATE OR REPLACE FUNCTION validate_scooter_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Log status changes in activity_events
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO activity_events (event_type, scooter_id, payload)
        VALUES (
            'scooter_status_changed',
            NEW.id,
            jsonb_build_object(
                'old_status', OLD.status,
                'new_status', NEW.status,
                'changed_at', now()
            )
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_scooter_status_trigger ON scooters;
CREATE TRIGGER validate_scooter_status_trigger
    BEFORE UPDATE ON scooters
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status)
    EXECUTE FUNCTION validate_scooter_status();

-- ============================================================================
-- PART 4: Add Auto-Update Timestamps
-- ============================================================================

CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at columns
DROP TRIGGER IF EXISTS update_distributors_timestamp ON distributors;
CREATE TRIGGER update_distributors_timestamp
    BEFORE UPDATE ON distributors
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_workshops_timestamp ON workshops;
CREATE TRIGGER update_workshops_timestamp
    BEFORE UPDATE ON workshops
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_service_jobs_timestamp ON service_jobs;
CREATE TRIGGER update_service_jobs_timestamp
    BEFORE UPDATE ON service_jobs
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_distributor_addresses_timestamp ON distributor_addresses;
CREATE TRIGGER update_distributor_addresses_timestamp
    BEFORE UPDATE ON distributor_addresses
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS update_workshop_addresses_timestamp ON workshop_addresses;
CREATE TRIGGER update_workshop_addresses_timestamp
    BEFORE UPDATE ON workshop_addresses
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- PART 5: Add Composite Indexes for Performance
-- ============================================================================

-- User-scooter primary device queries
CREATE INDEX IF NOT EXISTS idx_user_scooters_user_primary
    ON user_scooters(user_id, is_primary)
    WHERE is_primary = true;

-- Workshop job filtering
CREATE INDEX IF NOT EXISTS idx_service_jobs_workshop_status
    ON service_jobs(workshop_id, status);

CREATE INDEX IF NOT EXISTS idx_service_jobs_workshop_booked
    ON service_jobs(workshop_id, booked_date DESC)
    WHERE status != 'cancelled';

-- Firmware upload tracking
CREATE INDEX IF NOT EXISTS idx_firmware_uploads_scooter_status
    ON firmware_uploads(scooter_id, status);

-- Activity timeline queries
CREATE INDEX IF NOT EXISTS idx_activity_events_user_timestamp
    ON activity_events(user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_activity_events_scooter_timestamp
    ON activity_events(scooter_id, timestamp DESC);

-- ============================================================================
-- PART 6: Add Row Level Security to New Tables
-- ============================================================================

-- Enable RLS on new address tables
ALTER TABLE distributor_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE workshop_addresses ENABLE ROW LEVEL SECURITY;

-- Distributor addresses: Distributors see their own, admins see all
CREATE POLICY distributor_addresses_select ON distributor_addresses
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR distributor_id IN (
            SELECT id FROM distributors
            WHERE id = (auth.jwt() ->> 'distributor_id')::uuid
        )
    );

CREATE POLICY distributor_addresses_insert ON distributor_addresses
    FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR distributor_id = (auth.jwt() ->> 'distributor_id')::uuid
    );

CREATE POLICY distributor_addresses_update ON distributor_addresses
    FOR UPDATE
    USING (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR distributor_id = (auth.jwt() ->> 'distributor_id')::uuid
    );

CREATE POLICY distributor_addresses_delete ON distributor_addresses
    FOR DELETE
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

-- Workshop addresses: Workshops see their own, parent distributor, admins see all
CREATE POLICY workshop_addresses_select ON workshop_addresses
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR workshop_id IN (
            SELECT id FROM workshops w
            WHERE w.id = (auth.jwt() ->> 'workshop_id')::uuid
            OR w.parent_distributor_id = (auth.jwt() ->> 'distributor_id')::uuid
        )
    );

CREATE POLICY workshop_addresses_insert ON workshop_addresses
    FOR INSERT
    WITH CHECK (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR workshop_id = (auth.jwt() ->> 'workshop_id')::uuid
    );

CREATE POLICY workshop_addresses_update ON workshop_addresses
    FOR UPDATE
    USING (
        auth.jwt() ->> 'role' = 'manufacturer_admin'
        OR workshop_id = (auth.jwt() ->> 'workshop_id')::uuid
    );

CREATE POLICY workshop_addresses_delete ON workshop_addresses
    FOR DELETE
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

-- ============================================================================
-- PART 7: Add Helpful Comments
-- ============================================================================

COMMENT ON TABLE distributor_addresses IS 'Physical addresses for distributors - split from polymorphic addresses table';
COMMENT ON TABLE workshop_addresses IS 'Physical addresses for workshops - split from polymorphic addresses table';
COMMENT ON TRIGGER validate_service_job_status_trigger ON service_jobs IS 'Prevents invalid status transitions (completed→booked, cancelled→anything)';
COMMENT ON TRIGGER validate_scooter_status_trigger ON scooters IS 'Logs all scooter status changes to activity_events';
COMMENT ON FUNCTION update_timestamp() IS 'Auto-updates updated_at column on row changes';

-- ============================================================================
-- Migration Complete
-- ============================================================================

-- Verification queries (run these manually to verify):
--
-- SELECT COUNT(*) FROM distributor_addresses;
-- SELECT COUNT(*) FROM workshop_addresses;
-- SELECT COUNT(*) FROM addresses; -- Should match sum of above
--
-- SELECT scooter_id, zyd_serial FROM telemetry_snapshots WHERE scooter_id IS NOT NULL LIMIT 10;
--
-- Test status validation:
-- UPDATE service_jobs SET status = 'booked' WHERE status = 'completed' LIMIT 1; -- Should fail
