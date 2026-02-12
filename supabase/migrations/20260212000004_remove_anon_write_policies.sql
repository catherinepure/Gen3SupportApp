-- ============================================================================
-- MIGRATION: Remove anon INSERT/UPDATE policies on scooters, scooter_telemetry, firmware_uploads
-- ============================================================================
-- IMPORTANT: Only run this AFTER the updated Android app (using Edge Functions
-- instead of direct PostgREST writes) is deployed to all users.
--
-- The app now routes all writes through the update-scooter Edge Function,
-- which authenticates via session token and writes with service_role.
-- These anon write policies are no longer needed.
-- ============================================================================

-- Drop anon INSERT on scooters (app now uses update-scooter Edge Function get-or-create)
DROP POLICY IF EXISTS anon_insert_scooters ON public.scooters;

-- Drop anon UPDATE on scooters (app now uses update-scooter Edge Function update-version)
-- This was already tightened in 20260212000003 to block sensitive fields;
-- now we remove it entirely.
DROP POLICY IF EXISTS anon_update_scooters ON public.scooters;

-- Drop anon INSERT on scooter_telemetry (app now uses update-scooter Edge Function create-telemetry)
DROP POLICY IF EXISTS anon_insert_scooter_telemetry ON public.scooter_telemetry;

-- Drop anon INSERT on firmware_uploads (app now uses update-scooter Edge Function create-scan-record)
DROP POLICY IF EXISTS anon_insert_firmware_uploads ON public.firmware_uploads;

-- Drop anon UPDATE on firmware_uploads (was already time-restricted in 20260212000003)
DROP POLICY IF EXISTS anon_update_firmware_uploads ON public.firmware_uploads;

-- Verify: anon should have NO write policies on these tables
-- Run manually to confirm:
-- SELECT tablename, policyname, roles, cmd FROM pg_policies
-- WHERE tablename IN ('scooters', 'scooter_telemetry', 'firmware_uploads')
--   AND 'anon' = ANY(roles)
--   AND cmd IN ('INSERT', 'UPDATE');
