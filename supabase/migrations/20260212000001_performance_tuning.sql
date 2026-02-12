-- Performance Tuning Migration
-- Addresses high sequential scan ratios identified via pg_stat_user_tables analysis
-- Date: 2026-02-12

-- ============================================================================
-- 1. DISTRIBUTORS: Add GIN index on countries array
--    resolve_distributor_for_country() does: WHERE p_country = ANY(countries)
--    2,268 seq scans with no array index — every registration triggers full scan
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_distributors_countries
  ON distributors USING GIN (countries);

CREATE INDEX IF NOT EXISTS idx_distributors_active
  ON distributors (is_active)
  WHERE is_active = true;

-- ============================================================================
-- 2. FIRMWARE_VERSIONS: Composite index for get_available_firmware() RPC
--    Queries: WHERE is_active = true ORDER BY created_at DESC
--    340 seq scans (85.4%) — currently only has idx_firmware_versions_hw
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_firmware_versions_active_created
  ON firmware_versions (is_active, created_at DESC)
  WHERE is_active = true;

-- ============================================================================
-- 3. WORKSHOPS: Add partial index for RLS policy filter
--    anon RLS policy: WHERE is_active = true
--    940 seq scans (92.9%) with only 72 idx scans
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_workshops_active
  ON workshops (is_active)
  WHERE is_active = true;

-- ============================================================================
-- 4. USER_SESSIONS: Ensure session token lookups are efficient
--    97.7% seq scans (3,179 seq vs 75 idx) — highest seq scan count
--    Edge Functions validate session tokens on every API call
--    Already has unique index on session_token, but combined lookups
--    with user_id + expires_at need a covering index
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_active
  ON user_sessions (session_token, user_id, expires_at);

-- ============================================================================
-- 5. USERS: Optimize RLS policy subquery performance
--    anon_update_users WITH CHECK runs 3 separate subqueries on users.id
--    Consolidate with a covering index for common RLS lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_users_id_level_active
  ON users (id, user_level, is_active);

-- ============================================================================
-- 6. SCOOTER_TELEMETRY: RLS policy does EXISTS subquery on user_scooters
--    "Users can view their scooter telemetry" policy:
--    EXISTS (SELECT 1 FROM user_scooters WHERE scooter_id = ... AND user_id = auth.uid())
--    Add composite index for this exact lookup pattern
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_scooters_scooter_user
  ON user_scooters (scooter_id, user_id);

-- ============================================================================
-- 7. REMOVE DUPLICATE INDEXES
--    Several tables have both a UNIQUE constraint index and a separate
--    regular index on the same column. The unique index already serves
--    as a btree index for lookups.
-- ============================================================================

-- battery_variants: battery_variants_code_key (unique) duplicates idx_battery_variants_code
DROP INDEX IF EXISTS idx_battery_variants_code;

-- block_codes: block_codes_code_key (unique) duplicates idx_block_codes_code
DROP INDEX IF EXISTS idx_block_codes_code;

-- colour_options: colour_options_code_key (unique) duplicates idx_colour_options_code
DROP INDEX IF EXISTS idx_colour_options_code;

-- scooter_models: scooter_models_code_key (unique) duplicates idx_scooter_models_code
DROP INDEX IF EXISTS idx_scooter_models_code;

-- users: users_email_key (unique) duplicates idx_users_email
DROP INDEX IF EXISTS idx_users_email;

-- password_reset_tokens: password_reset_tokens_reset_token_key (unique) duplicates idx_password_reset_tokens
DROP INDEX IF EXISTS idx_password_reset_tokens;

-- password_reset_tokens: password_reset_tokens_token_key (unique) duplicates idx_password_reset_tokens_token
DROP INDEX IF EXISTS idx_password_reset_tokens_token;

-- scooters: scooters_serial_number_key (unique) duplicates idx_scooters_serial_number
DROP INDEX IF EXISTS idx_scooters_serial_number;

-- scooters: scooters_zyd_serial_key (unique) duplicates idx_scooters_zyd_serial
DROP INDEX IF EXISTS idx_scooters_zyd_serial;

-- user_sessions: user_sessions_session_token_key (unique) duplicates idx_user_sessions_token
DROP INDEX IF EXISTS idx_user_sessions_token;

-- ============================================================================
-- 8. ANALYZE tables to update planner statistics
--    After adding/removing indexes, refresh stats so the query planner
--    makes optimal decisions
-- ============================================================================
ANALYZE distributors;
ANALYZE firmware_versions;
ANALYZE workshops;
ANALYZE user_sessions;
ANALYZE users;
ANALYZE user_scooters;
ANALYZE scooters;
ANALYZE battery_variants;
ANALYZE block_codes;
ANALYZE colour_options;
ANALYZE scooter_models;
ANALYZE password_reset_tokens;

-- ============================================================================
-- SUMMARY OF CHANGES:
--   Added 6 new indexes targeting high-seq-scan tables
--   Removed 10 duplicate indexes (unique constraint already provides btree)
--   Net reduction: 4 fewer indexes, better planner stats
-- ============================================================================
