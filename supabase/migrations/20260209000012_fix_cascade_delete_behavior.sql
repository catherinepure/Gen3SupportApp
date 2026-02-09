-- Migration 012: Fix CASCADE delete behavior on audit/history tables
--
-- Problem: Several foreign keys use ON DELETE CASCADE which would silently
-- destroy audit trails and historical data when parent records are deleted.
--
-- Fix: Change audit/telemetry FKs to SET NULL (preserve record, lose link)
-- and operational FKs to RESTRICT (prevent deletion while references exist).

-- ============================================================================
-- 1. scooter_telemetry — audit data, should be preserved
-- ============================================================================

-- scooter_telemetry.user_id → users(id): SET NULL (keep telemetry if user deleted)
-- Only add if column exists (use DO block to check)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scooter_telemetry' AND column_name = 'user_id') THEN
    EXECUTE 'ALTER TABLE scooter_telemetry DROP CONSTRAINT IF EXISTS scooter_telemetry_user_id_fkey';
    EXECUTE 'ALTER TABLE scooter_telemetry ADD CONSTRAINT scooter_telemetry_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL';
  END IF;
END $$;

-- scooter_telemetry.scooter_id → scooters(id): SET NULL (keep telemetry if scooter deleted)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scooter_telemetry' AND column_name = 'scooter_id') THEN
    EXECUTE 'ALTER TABLE scooter_telemetry DROP CONSTRAINT IF EXISTS scooter_telemetry_scooter_id_fkey';
    EXECUTE 'ALTER TABLE scooter_telemetry ADD CONSTRAINT scooter_telemetry_scooter_id_fkey FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE SET NULL';
  END IF;
END $$;

-- scooter_telemetry.user_scooter_id → user_scooters(id): SET NULL (only if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'scooter_telemetry' AND column_name = 'user_scooter_id') THEN
    EXECUTE 'ALTER TABLE scooter_telemetry DROP CONSTRAINT IF EXISTS scooter_telemetry_user_scooter_id_fkey';
    EXECUTE 'ALTER TABLE scooter_telemetry ADD CONSTRAINT scooter_telemetry_user_scooter_id_fkey FOREIGN KEY (user_scooter_id) REFERENCES user_scooters(id) ON DELETE SET NULL';
  END IF;
END $$;

-- ============================================================================
-- 2. activity_events — audit data, must be preserved
-- ============================================================================

-- activity_events.user_id → users(id): SET NULL (keep event log if user deleted)
-- Note: scooter_id, distributor_id, workshop_id already use SET NULL (correct)
ALTER TABLE activity_events
  DROP CONSTRAINT IF EXISTS activity_events_user_id_fkey,
  ADD CONSTRAINT activity_events_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 3. service_jobs — operational data with history value
-- ============================================================================

-- service_jobs.scooter_id → scooters(id): RESTRICT (don't delete scooter with jobs)
ALTER TABLE service_jobs
  DROP CONSTRAINT IF EXISTS service_jobs_scooter_id_fkey,
  ADD CONSTRAINT service_jobs_scooter_id_fkey
    FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE RESTRICT;

-- service_jobs.workshop_id → workshops(id): SET NULL (keep job history if workshop removed)
ALTER TABLE service_jobs
  DROP CONSTRAINT IF EXISTS service_jobs_workshop_id_fkey,
  ADD CONSTRAINT service_jobs_workshop_id_fkey
    FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE SET NULL;

-- service_jobs.customer_id → users(id): SET NULL (keep job history if user deleted)
ALTER TABLE service_jobs
  DROP CONSTRAINT IF EXISTS service_jobs_customer_id_fkey,
  ADD CONSTRAINT service_jobs_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE SET NULL;

-- service_jobs.technician_id → users(id): SET NULL (keep job history if technician deleted)
ALTER TABLE service_jobs
  DROP CONSTRAINT IF EXISTS service_jobs_technician_id_fkey,
  ADD CONSTRAINT service_jobs_technician_id_fkey
    FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- 4. Component tables — physical parts tied to scooters
-- ============================================================================

-- scooter_batteries.scooter_id → scooters(id): RESTRICT (don't delete scooter with components)
ALTER TABLE scooter_batteries
  DROP CONSTRAINT IF EXISTS scooter_batteries_scooter_id_fkey,
  ADD CONSTRAINT scooter_batteries_scooter_id_fkey
    FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE RESTRICT;

-- scooter_motors.scooter_id → scooters(id): RESTRICT
ALTER TABLE scooter_motors
  DROP CONSTRAINT IF EXISTS scooter_motors_scooter_id_fkey,
  ADD CONSTRAINT scooter_motors_scooter_id_fkey
    FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE RESTRICT;

-- scooter_frames.scooter_id → scooters(id): RESTRICT
ALTER TABLE scooter_frames
  DROP CONSTRAINT IF EXISTS scooter_frames_scooter_id_fkey,
  ADD CONSTRAINT scooter_frames_scooter_id_fkey
    FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE RESTRICT;

-- scooter_controllers.scooter_id → scooters(id): RESTRICT
ALTER TABLE scooter_controllers
  DROP CONSTRAINT IF EXISTS scooter_controllers_scooter_id_fkey,
  ADD CONSTRAINT scooter_controllers_scooter_id_fkey
    FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE RESTRICT;
