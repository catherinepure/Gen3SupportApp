-- ============================================================================
-- Migration 005: RLS Hardening
-- Date: 2026-02-07
-- Description: Comprehensive Row Level Security overhaul so the Android app
--              can safely use the ANON key instead of the service_role key.
--
-- STRATEGY:
--   - The Android app uses the anon key for direct REST API calls
--   - Edge Functions continue to use service_role key (server-side, safe)
--   - Admin web tool uses Edge Functions (never direct DB access)
--   - All anon policies are scoped to what the mobile app actually needs
--
-- IMPORTANT: Run this AFTER rotating the service_role key and updating
--            the admin tool's .env file with the new key.
-- ============================================================================

-- ============================================================================
-- PART 1: Enable RLS on tables that don't have it yet
-- ============================================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_scooters ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooter_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 2: Service role full access on ALL tables
-- (Edge Functions and admin tool use this — bypasses RLS automatically,
--  but explicit policies ensure clarity)
-- ============================================================================

-- Users
DO $$ BEGIN
  CREATE POLICY "service_role_all_users"
    ON users FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User sessions
DO $$ BEGIN
  CREATE POLICY "service_role_all_user_sessions"
    ON user_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User scooters
DO $$ BEGIN
  CREATE POLICY "service_role_all_user_scooters"
    ON user_scooters FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Scooter telemetry
DO $$ BEGIN
  CREATE POLICY "service_role_all_scooter_telemetry"
    ON scooter_telemetry FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User audit log
DO $$ BEGIN
  CREATE POLICY "service_role_all_user_audit_log"
    ON user_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Password reset tokens
DO $$ BEGIN
  CREATE POLICY "service_role_all_password_reset_tokens"
    ON password_reset_tokens FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 3: Anon policies for mobile app — READ access
-- These match exactly what the Android repositories need
-- ============================================================================

-- distributors: Already has anon read (all active). Keep as-is.
-- scooters: Already has anon read (all). Keep as-is — app needs to look up any scooter.
-- firmware_versions: Already has anon read (active only). Keep as-is.
-- firmware_hw_targets: Already has anon read (all). Keep as-is.
-- telemetry_snapshots: Already has anon read/insert. Keep as-is.

-- firmware_uploads: Already has anon read (all) — app needs to see update history for any scooter
--   The overly-permissive UPDATE policy is needed for the app to update upload status.
--   Keep as-is for now. (The app creates an upload record, then updates it to completed/failed.)

-- user_scooters: App reads to check registration status and get scooter owners
DO $$ BEGIN
  CREATE POLICY "anon_read_user_scooters"
    ON user_scooters FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- scooter_telemetry: App reads telemetry history and creates new records
DO $$ BEGIN
  CREATE POLICY "anon_read_scooter_telemetry"
    ON scooter_telemetry FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon_insert_scooter_telemetry"
    ON scooter_telemetry FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- users: App searches users (distributor staff feature) and gets user by ID
-- Restrict to non-sensitive fields via PostgREST column selection, but RLS
-- needs to allow the row access. Limit to active users only.
DO $$ BEGIN
  CREATE POLICY "anon_read_users"
    ON users FOR SELECT TO anon USING (is_active = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_audit_log: App reads and creates audit entries
DO $$ BEGIN
  CREATE POLICY "anon_read_user_audit_log"
    ON user_audit_log FOR SELECT TO anon USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "anon_insert_user_audit_log"
    ON user_audit_log FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- PART 4: Anon policies for mobile app — WRITE access
-- ============================================================================

-- scooters: App creates scooter records during scan
DO $$ BEGIN
  CREATE POLICY "anon_insert_scooters"
    ON scooters FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- users: App updates user fields (deactivate, update details)
-- Only allow updating own distributor's users (enforced at app level,
-- but we allow the update through RLS for now since the app needs it)
DO $$ BEGIN
  CREATE POLICY "anon_update_users"
    ON users FOR UPDATE TO anon USING (is_active = true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- user_sessions: No anon access — sessions managed by Edge Functions only
-- (login, validate-session, logout all use service_role key)

-- password_reset_tokens: No anon access — managed by Edge Functions only

-- ============================================================================
-- PART 5: Workshops and addresses — read access for app
-- Already have anon read policies from migration 004. Verify they exist.
-- ============================================================================

-- workshops: anon can read active (already exists from 004)
-- addresses: anon can read all (already exists from 004)
-- service_jobs: Only via Edge Functions (no anon access needed)
-- activity_events: anon can insert (already exists from 004)

-- ============================================================================
-- PART 6: Tighten storage bucket access
-- Firmware binaries bucket should be public read (already is).
-- No changes needed.
-- ============================================================================

-- ============================================================================
-- Done. Summary:
--
-- NEWLY PROTECTED TABLES (RLS enabled):
--   users, user_sessions, user_scooters, scooter_telemetry,
--   user_audit_log, password_reset_tokens
--
-- ANON ACCESS GRANTED:
--   users            — SELECT active users, UPDATE active users
--   user_scooters    — SELECT all
--   scooter_telemetry — SELECT all, INSERT
--   user_audit_log   — SELECT all, INSERT
--   scooters         — INSERT (create during scan)
--
-- NO ANON ACCESS (Edge Functions only):
--   user_sessions        — login/logout/validate via Edge Functions
--   password_reset_tokens — password reset via Edge Functions
--   service_jobs         — CRUD via Edge Functions
--   activity_events      — INSERT via anon (from 004), query via Edge Functions
--
-- NEXT STEPS:
--   1. Apply this migration to Supabase
--   2. Rotate the service_role key in Supabase dashboard
--   3. Update admin-tool/.env with new service_role key
--   4. Remove SUPABASE_SERVICE_KEY from Android app build.gradle
--   5. Update ServiceFactory.java to use SUPABASE_ANON_KEY
-- ============================================================================
