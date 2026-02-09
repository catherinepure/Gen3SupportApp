-- Migration: Cleanup Old Addresses Table
-- Date: 2026-02-09
-- Description: Safely drop the old polymorphic addresses table after migration
--
-- ⚠️ ONLY RUN THIS AFTER VERIFYING:
-- 1. All data successfully migrated to distributor_addresses and workshop_addresses
-- 2. All application code updated to use new tables
-- 3. No references to old addresses table remain in queries
--
-- Verification steps before running:
--   SELECT COUNT(*) FROM addresses;  -- Check old table count
--   SELECT COUNT(*) FROM distributor_addresses;  -- Should match distributors
--   SELECT COUNT(*) FROM workshop_addresses;  -- Should match workshops
--   SELECT COUNT(*) FROM addresses WHERE entity_type = 'distributor';
--   SELECT COUNT(*) FROM addresses WHERE entity_type = 'workshop';

-- ============================================================================
-- Pre-Flight Checks
-- ============================================================================

DO $$
DECLARE
    old_dist_count INT;
    old_work_count INT;
    new_dist_count INT;
    new_work_count INT;
BEGIN
    -- Count records in old table
    SELECT COUNT(*) INTO old_dist_count FROM addresses WHERE entity_type = 'distributor';
    SELECT COUNT(*) INTO old_work_count FROM addresses WHERE entity_type = 'workshop';

    -- Count records in new tables
    SELECT COUNT(*) INTO new_dist_count FROM distributor_addresses;
    SELECT COUNT(*) INTO new_work_count FROM workshop_addresses;

    -- Verify migration completeness
    IF old_dist_count != new_dist_count THEN
        RAISE EXCEPTION 'Distributor address count mismatch! Old: %, New: %', old_dist_count, new_dist_count;
    END IF;

    IF old_work_count != new_work_count THEN
        RAISE EXCEPTION 'Workshop address count mismatch! Old: %, New: %', old_work_count, new_work_count;
    END IF;

    RAISE NOTICE 'Pre-flight checks passed:';
    RAISE NOTICE '  - Distributor addresses: % (old) = % (new)', old_dist_count, new_dist_count;
    RAISE NOTICE '  - Workshop addresses: % (old) = % (new)', old_work_count, new_work_count;
END $$;

-- ============================================================================
-- Archive Old Table (Optional - Comment out if not needed)
-- ============================================================================

-- Create archive table (uncomment if you want to keep historical backup)
-- CREATE TABLE IF NOT EXISTS addresses_archive AS SELECT * FROM addresses;
-- COMMENT ON TABLE addresses_archive IS 'Archived polymorphic addresses table (pre-migration backup)';

-- ============================================================================
-- Drop Old Addresses Table
-- ============================================================================

-- Drop RLS policies first
DROP POLICY IF EXISTS addresses_select ON addresses;
DROP POLICY IF EXISTS addresses_insert ON addresses;
DROP POLICY IF EXISTS addresses_update ON addresses;
DROP POLICY IF EXISTS addresses_delete ON addresses;

-- Drop indexes
DROP INDEX IF EXISTS idx_addresses_entity;

-- Drop the table
DROP TABLE IF EXISTS addresses CASCADE;

-- ============================================================================
-- Confirmation
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Old addresses table successfully dropped';
    RAISE NOTICE '✅ Cleanup complete - using distributor_addresses and workshop_addresses';
END $$;

-- ============================================================================
-- Post-Cleanup Verification
-- ============================================================================

-- Verify new tables still have data
SELECT
    'distributor_addresses' as table_name,
    COUNT(*) as record_count,
    COUNT(DISTINCT distributor_id) as unique_entities
FROM distributor_addresses

UNION ALL

SELECT
    'workshop_addresses',
    COUNT(*),
    COUNT(DISTINCT workshop_id)
FROM workshop_addresses;

-- Verify foreign key constraints working
DO $$
BEGIN
    -- Test distributor FK (should fail)
    BEGIN
        INSERT INTO distributor_addresses (distributor_id, line_1, city, postcode, country)
        VALUES ('00000000-0000-0000-0000-000000000000', 'Test', 'Test', '12345', 'US');
        RAISE EXCEPTION 'FK constraint NOT working - invalid distributor_id was accepted!';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ Distributor FK constraint working correctly';
    END;

    -- Test workshop FK (should fail)
    BEGIN
        INSERT INTO workshop_addresses (workshop_id, line_1, city, postcode, country)
        VALUES ('00000000-0000-0000-0000-000000000000', 'Test', 'Test', '12345', 'US');
        RAISE EXCEPTION 'FK constraint NOT working - invalid workshop_id was accepted!';
    EXCEPTION WHEN foreign_key_violation THEN
        RAISE NOTICE '✅ Workshop FK constraint working correctly';
    END;
END $$;

COMMENT ON TABLE distributor_addresses IS 'Physical addresses for distributors - migrated from polymorphic addresses table (2026-02-09)';
COMMENT ON TABLE workshop_addresses IS 'Physical addresses for workshops - migrated from polymorphic addresses table (2026-02-09)';
