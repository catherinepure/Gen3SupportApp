-- Drop Unused Indexes on scooter_telemetry and scooters
-- Reduces write amplification for the two highest-write tables
-- Every user login triggers telemetry INSERT (7→2 indexes) + scooter UPDATE (11→7 indexes)
-- All dropped indexes have 0 scans in pg_stat_user_indexes
-- Date: 2026-02-12

-- ============================================================================
-- SCOOTER_TELEMETRY: Drop 5 unused indexes (keep pkey + idx_scooter_telemetry_scooter)
-- ============================================================================

-- No code queries telemetry by distributor_id
DROP INDEX IF EXISTS idx_scooter_telemetry_distributor;

-- scan_type is display-only in web-admin, never filtered
DROP INDEX IF EXISTS idx_scooter_telemetry_scan_type;

-- App queries by scooter_id, not user_id
DROP INDEX IF EXISTS idx_scooter_telemetry_user;

-- Redundant: idx_scooter_telemetry_scooter already covers (scooter_id, scanned_at DESC)
DROP INDEX IF EXISTS idx_scooter_telemetry_scooter_scanned;

-- No code queries telemetry by user_id
DROP INDEX IF EXISTS idx_scooter_telemetry_user_scanned;

-- ============================================================================
-- SCOOTERS: Drop 4 unused indexes (keep pkey, serial keys, distributor, mac, status, country)
-- ============================================================================

-- hw_version is display-only, never filtered on scooters table
DROP INDEX IF EXISTS idx_scooters_hw_version;

-- model_id is set on creation, never used in WHERE clauses
DROP INDEX IF EXISTS idx_scooters_model_id;

-- Redundant: admin filters country and status separately;
-- individual idx_scooters_country and idx_scooters_status already cover each
DROP INDEX IF EXISTS idx_scooters_country_status;

-- PIN lookups use scooter_id (PK), never filter by pin_set_at timestamp
DROP INDEX IF EXISTS idx_scooters_pin_set_at;

-- ============================================================================
-- Refresh planner statistics
-- ============================================================================
ANALYZE scooter_telemetry;
ANALYZE scooters;
