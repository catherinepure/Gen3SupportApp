-- Migration 011: Remove activation codes, update user_level to admin/manager/normal, add created_by
--
-- This migration:
-- 1. Removes activation code columns from distributors and workshops
-- 2. Migrates user_level values: admin stays admin, distributor->manager, maintenance->manager, user->normal
-- 3. Adds created_by column to users table (FK to users.id)
-- 4. Adds updated_at triggers to scooters, service_jobs, and component tables
-- 5. Cleans up activation_code tracking columns from users table

-- ============================================================================
-- STEP 1: Drop old CHECK constraint, migrate values, add new constraint
-- ============================================================================

-- Drop the existing CHECK constraint that only allows old values
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_user_level_check;

-- Map old levels to new: admin->admin, distributor->manager, maintenance->manager, user->normal
UPDATE users SET user_level = 'admin' WHERE user_level = 'admin';
UPDATE users SET user_level = 'manager' WHERE user_level IN ('distributor', 'maintenance');
UPDATE users SET user_level = 'normal' WHERE user_level = 'user';

-- Add new CHECK constraint with the new valid values
ALTER TABLE users ADD CONSTRAINT users_user_level_check CHECK (user_level IN ('admin', 'manager', 'normal'));

-- ============================================================================
-- STEP 2: Add created_by column to users table
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 3: Drop dependent views, then remove activation code columns from distributors
-- ============================================================================

-- Drop views that depend on activation_code columns
DROP VIEW IF EXISTS unmigrated_activation_codes CASCADE;

ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_hash;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_plaintext;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_expires_at;
ALTER TABLE distributors DROP COLUMN IF EXISTS activation_code_created_at;

-- ============================================================================
-- STEP 4: Remove activation code columns from workshops
-- ============================================================================

ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_hash;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_plaintext;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_expires_at;
ALTER TABLE workshops DROP COLUMN IF EXISTS activation_code_created_at;

-- ============================================================================
-- STEP 5: Remove activation code tracking from users table
-- ============================================================================

ALTER TABLE users DROP COLUMN IF EXISTS activation_code_used;
ALTER TABLE users DROP COLUMN IF EXISTS activation_code_used_at;
ALTER TABLE users DROP COLUMN IF EXISTS workshop_activation_code_used;

-- ============================================================================
-- STEP 6: Add updated_at to tables that lack it
-- ============================================================================

-- Scooters
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_scooters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_scooters_updated_at ON scooters;
CREATE TRIGGER set_scooters_updated_at
    BEFORE UPDATE ON scooters
    FOR EACH ROW
    EXECUTE FUNCTION update_scooters_updated_at();

-- Service Jobs (already has updated_at from manual sets, but add trigger for consistency)
ALTER TABLE service_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_service_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_service_jobs_updated_at ON service_jobs;
CREATE TRIGGER set_service_jobs_updated_at
    BEFORE UPDATE ON service_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_service_jobs_updated_at();

-- Component tables
ALTER TABLE scooter_batteries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE scooter_motors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE scooter_frames ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE scooter_controllers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE OR REPLACE FUNCTION update_component_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_batteries_updated_at ON scooter_batteries;
CREATE TRIGGER set_batteries_updated_at
    BEFORE UPDATE ON scooter_batteries
    FOR EACH ROW
    EXECUTE FUNCTION update_component_updated_at();

DROP TRIGGER IF EXISTS set_motors_updated_at ON scooter_motors;
CREATE TRIGGER set_motors_updated_at
    BEFORE UPDATE ON scooter_motors
    FOR EACH ROW
    EXECUTE FUNCTION update_component_updated_at();

DROP TRIGGER IF EXISTS set_frames_updated_at ON scooter_frames;
CREATE TRIGGER set_frames_updated_at
    BEFORE UPDATE ON scooter_frames
    FOR EACH ROW
    EXECUTE FUNCTION update_component_updated_at();

DROP TRIGGER IF EXISTS set_controllers_updated_at ON scooter_controllers;
CREATE TRIGGER set_controllers_updated_at
    BEFORE UPDATE ON scooter_controllers
    FOR EACH ROW
    EXECUTE FUNCTION update_component_updated_at();
