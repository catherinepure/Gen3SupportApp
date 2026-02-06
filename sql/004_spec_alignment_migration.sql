-- ============================================================================
-- Migration: Align database schema with APP_DEVELOPMENT_SPEC.md (Section 2)
-- Date: 2026-02-06
-- Description: Adds missing columns, tables, and constraints required by the
--              migration spec. Designed to be run against the existing Supabase
--              database without breaking the current Java app.
--
-- IMPORTANT: Review each section before running. This migration is idempotent
--            where possible (IF NOT EXISTS / IF EXISTS checks).
-- ============================================================================

-- ============================================================================
-- PART 1: Fix immediate blocker — scooters.status column
-- The Java app's telemetry saving is failing because an RLS policy or trigger
-- references scooters.status which doesn't exist yet.
-- ============================================================================

ALTER TABLE scooters
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'in_service', 'stolen', 'decommissioned'));

COMMENT ON COLUMN scooters.status IS 'Scooter lifecycle status. Default active.';

-- ============================================================================
-- PART 2: Extend scooters table (spec section 2.4)
-- ============================================================================

ALTER TABLE scooters
  ADD COLUMN IF NOT EXISTS firmware_version TEXT;

ALTER TABLE scooters
  ADD COLUMN IF NOT EXISTS country_of_registration TEXT;

ALTER TABLE scooters
  ADD COLUMN IF NOT EXISTS pin_hash TEXT;

ALTER TABLE scooters
  ADD COLUMN IF NOT EXISTS registration_date TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN scooters.firmware_version IS 'Current firmware version string for quick lookup.';
COMMENT ON COLUMN scooters.country_of_registration IS 'ISO 3166-1 alpha-2 country code where scooter was registered.';
COMMENT ON COLUMN scooters.pin_hash IS 'Hashed 6-digit PIN. Never store plaintext.';
COMMENT ON COLUMN scooters.registration_date IS 'When the scooter was first added to the system.';

CREATE INDEX IF NOT EXISTS idx_scooters_status ON scooters(status);
CREATE INDEX IF NOT EXISTS idx_scooters_country ON scooters(country_of_registration);

-- ============================================================================
-- PART 3: Extend users table (spec section 2.1)
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_country TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_country TEXT;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- New role column using the spec's role names.
-- Existing user_level is kept for backward compatibility with the Java app.
-- The Flutter app will use the new 'roles' column.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['customer']::TEXT[];

COMMENT ON COLUMN users.home_country IS 'ISO 3166-1 alpha-2. Derived from SIM/GPS. Determines distributor territory.';
COMMENT ON COLUMN users.current_country IS 'ISO 3166-1 alpha-2. Updated each session. Used for regulatory compliance.';
COMMENT ON COLUMN users.date_of_birth IS 'Preferred over age_range which goes stale.';
COMMENT ON COLUMN users.roles IS 'Array of: customer, distributor_staff, workshop_staff, manufacturer_admin';

CREATE INDEX IF NOT EXISTS idx_users_home_country ON users(home_country);
CREATE INDEX IF NOT EXISTS idx_users_roles ON users USING GIN(roles);

-- Migrate existing user_level values to the new roles column.
-- Only sets roles where they haven't been manually set yet.
UPDATE users SET roles = ARRAY['customer']::TEXT[]
  WHERE user_level = 'user' AND (roles IS NULL OR roles = ARRAY['customer']::TEXT[]);

UPDATE users SET roles = ARRAY['distributor_staff']::TEXT[]
  WHERE user_level = 'distributor' AND (roles IS NULL OR roles = ARRAY['customer']::TEXT[]);

UPDATE users SET roles = ARRAY['workshop_staff']::TEXT[]
  WHERE user_level = 'maintenance' AND (roles IS NULL OR roles = ARRAY['customer']::TEXT[]);

UPDATE users SET roles = ARRAY['manufacturer_admin']::TEXT[]
  WHERE user_level = 'admin' AND (roles IS NULL OR roles = ARRAY['customer']::TEXT[]);

-- ============================================================================
-- PART 4: Extend distributors table (spec section 2.2)
-- ============================================================================

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS countries TEXT[] DEFAULT ARRAY[]::TEXT[];

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS phone TEXT;

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN distributors.countries IS 'ISO 3166-1 alpha-2 country codes this distributor covers.';
COMMENT ON COLUMN distributors.phone IS 'Primary contact number with country code.';
COMMENT ON COLUMN distributors.email IS 'Organisation-level contact email.';

-- ============================================================================
-- PART 5: Create addresses table (spec section 2.5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS addresses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('distributor', 'workshop')),
  entity_id   UUID NOT NULL,
  line_1      TEXT NOT NULL,
  line_2      TEXT,
  city        TEXT NOT NULL,
  region      TEXT,
  postcode    TEXT NOT NULL,
  country     TEXT NOT NULL,
  is_primary  BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE addresses IS 'Shared address sub-model for distributors and workshops.';
COMMENT ON COLUMN addresses.entity_type IS 'Which entity type this address belongs to.';
COMMENT ON COLUMN addresses.entity_id IS 'UUID of the parent distributor or workshop.';
COMMENT ON COLUMN addresses.country IS 'ISO 3166-1 alpha-2 country code.';

CREATE INDEX IF NOT EXISTS idx_addresses_entity ON addresses(entity_type, entity_id);

-- ============================================================================
-- PART 6: Create workshops table (spec section 2.3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workshops (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  phone                  TEXT,
  email                  TEXT,
  parent_distributor_id  UUID REFERENCES distributors(id) ON DELETE SET NULL,
  service_area_countries TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active              BOOLEAN DEFAULT true,
  created_at             TIMESTAMPTZ DEFAULT now(),
  updated_at             TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE workshops IS 'Service workshops. Can be independent or linked to a distributor.';
COMMENT ON COLUMN workshops.parent_distributor_id IS 'Null if independent workshop.';
COMMENT ON COLUMN workshops.service_area_countries IS 'ISO 3166-1 alpha-2 codes for countries this workshop serves.';

CREATE INDEX IF NOT EXISTS idx_workshops_distributor ON workshops(parent_distributor_id);
CREATE INDEX IF NOT EXISTS idx_workshops_countries ON workshops USING GIN(service_area_countries);

-- Add workshop_id to users for workshop staff association
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS workshop_id UUID REFERENCES workshops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_workshop ON users(workshop_id);

-- ============================================================================
-- PART 7: Create service_jobs table (spec section 2.6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scooter_id              UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
  workshop_id             UUID NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  customer_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  technician_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  status                  TEXT NOT NULL DEFAULT 'booked'
                          CHECK (status IN (
                            'booked', 'in_progress', 'awaiting_parts',
                            'ready_for_collection', 'completed', 'cancelled'
                          )),
  booked_date             TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_date            TIMESTAMPTZ,
  completed_date          TIMESTAMPTZ,
  issue_description       TEXT NOT NULL,
  technician_notes        TEXT,
  parts_used              JSONB DEFAULT '[]'::JSONB,
  firmware_updated        BOOLEAN DEFAULT false,
  firmware_version_before TEXT,
  firmware_version_after  TEXT,
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE service_jobs IS 'Links a scooter to a workshop for a specific service visit.';

CREATE INDEX IF NOT EXISTS idx_service_jobs_scooter ON service_jobs(scooter_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_workshop ON service_jobs(workshop_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_customer ON service_jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_technician ON service_jobs(technician_id);
CREATE INDEX IF NOT EXISTS idx_service_jobs_status ON service_jobs(status);
CREATE INDEX IF NOT EXISTS idx_service_jobs_booked ON service_jobs(booked_date);

-- ============================================================================
-- PART 8: Create activity_events table (spec section 3.1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS activity_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type      TEXT NOT NULL,
  scooter_id      UUID REFERENCES scooters(id) ON DELETE SET NULL,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  country         TEXT,
  distributor_id  UUID REFERENCES distributors(id) ON DELETE SET NULL,
  workshop_id     UUID REFERENCES workshops(id) ON DELETE SET NULL,
  payload         JSONB DEFAULT '{}'::JSONB,
  app_version     TEXT,
  device_type     TEXT,
  synced_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE activity_events IS 'Immutable event audit trail. Never update or delete rows.';
COMMENT ON COLUMN activity_events.event_type IS 'See spec section 3.2 for full list of event types.';
COMMENT ON COLUMN activity_events.country IS 'ISO 3166-1 alpha-2. Where the event occurred.';
COMMENT ON COLUMN activity_events.distributor_id IS 'Resolved from country at write time for fast querying.';
COMMENT ON COLUMN activity_events.synced_at IS 'When the event was synced from client to server.';

CREATE INDEX IF NOT EXISTS idx_activity_events_type ON activity_events(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_events_scooter ON activity_events(scooter_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_user ON activity_events(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_country ON activity_events(country);
CREATE INDEX IF NOT EXISTS idx_activity_events_distributor ON activity_events(distributor_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_workshop ON activity_events(workshop_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_timestamp ON activity_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_events_payload ON activity_events USING GIN(payload);

-- ============================================================================
-- PART 9: Row Level Security for new tables
-- ============================================================================

-- Workshops
ALTER TABLE workshops ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to workshops"
    ON workshops FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anonymous read active workshops"
    ON workshops FOR SELECT TO anon USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Service Jobs
ALTER TABLE service_jobs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to service_jobs"
    ON service_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Activity Events (immutable — insert only for non-service roles)
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to activity_events"
    ON activity_events FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anonymous insert activity_events"
    ON activity_events FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Addresses
ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Service role full access to addresses"
    ON addresses FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Anonymous read addresses"
    ON addresses FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 10: Helper function to resolve distributor from country
-- Used when writing activity events to pre-resolve distributor_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_distributor_for_country(p_country TEXT)
RETURNS UUID AS $$
  SELECT id FROM distributors
  WHERE p_country = ANY(countries)
    AND is_active = true
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION resolve_distributor_for_country IS
  'Given an ISO 3166-1 country code, returns the active distributor covering that territory.';

-- ============================================================================
-- Done. Summary of changes:
--
-- MODIFIED TABLES:
--   scooters      + status, firmware_version, country_of_registration,
--                   pin_hash, registration_date
--   users         + home_country, current_country, date_of_birth,
--                   roles[], workshop_id
--   distributors  + countries[], phone, email
--
-- NEW TABLES:
--   addresses        — shared address sub-model
--   workshops        — service workshops (independent or distributor-linked)
--   service_jobs     — scooter service visit tracking
--   activity_events  — immutable event audit trail
--
-- NEW FUNCTIONS:
--   resolve_distributor_for_country(TEXT) → UUID
--
-- BACKWARD COMPATIBILITY:
--   - users.user_level is KEPT (Java app still uses it)
--   - users.age_range is KEPT (date_of_birth added alongside)
--   - scooters.zyd_serial is KEPT (equivalent to spec's serial_number)
--   - scooters.model is KEPT (equivalent to spec's scooter_type)
--   - All new columns have defaults or are nullable — no existing inserts break
-- ============================================================================
