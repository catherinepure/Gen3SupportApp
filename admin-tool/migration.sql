-- ============================================================================
-- Gen3 Firmware Updater Database Migration
-- Adds support for:
--   - Multiple HW versions per firmware (many-to-many)
--   - Public vs. distributor-only firmware
--   - Anonymous telemetry tracking
-- ============================================================================

-- 1. Add access_level to firmware_versions
-- ============================================================================
ALTER TABLE firmware_versions
ADD COLUMN IF NOT EXISTS access_level TEXT NOT NULL DEFAULT 'distributor'
CHECK (access_level IN ('public', 'distributor'));

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_firmware_access_level
ON firmware_versions(access_level, is_active);

COMMENT ON COLUMN firmware_versions.access_level IS
'Determines who can access this firmware: public (anyone) or distributor (authenticated only)';


-- 2. Create firmware_hw_targets junction table
-- ============================================================================
CREATE TABLE IF NOT EXISTS firmware_hw_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firmware_version_id UUID NOT NULL REFERENCES firmware_versions(id) ON DELETE CASCADE,
    hw_version TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(firmware_version_id, hw_version)
);

CREATE INDEX IF NOT EXISTS idx_firmware_hw_targets_firmware_id
ON firmware_hw_targets(firmware_version_id);

CREATE INDEX IF NOT EXISTS idx_firmware_hw_targets_hw_version
ON firmware_hw_targets(hw_version);

COMMENT ON TABLE firmware_hw_targets IS
'Junction table mapping firmware versions to compatible hardware versions';


-- 3. Migrate existing firmware target_hw_version to junction table
-- ============================================================================
-- Copy existing target_hw_version to the new junction table
INSERT INTO firmware_hw_targets (firmware_version_id, hw_version)
SELECT id, target_hw_version
FROM firmware_versions
WHERE target_hw_version IS NOT NULL
ON CONFLICT (firmware_version_id, hw_version) DO NOTHING;

-- Note: We keep target_hw_version column for now for backwards compatibility
-- It can be dropped later after confirming migration success:
-- ALTER TABLE firmware_versions DROP COLUMN target_hw_version;


-- 4. Add hw_version to scooters table
-- ============================================================================
ALTER TABLE scooters
ADD COLUMN IF NOT EXISTS hw_version TEXT;

CREATE INDEX IF NOT EXISTS idx_scooters_hw_version
ON scooters(hw_version);

COMMENT ON COLUMN scooters.hw_version IS
'Hardware version of the scooter controller (e.g., V1.0, V1.1)';


-- 5. Create telemetry_snapshots table
-- ============================================================================
CREATE TABLE IF NOT EXISTS telemetry_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    zyd_serial TEXT NOT NULL,
    firmware_upload_id UUID REFERENCES firmware_uploads(id) ON DELETE SET NULL,
    hw_version TEXT,
    sw_version TEXT,
    odometer_km DECIMAL(10, 2),
    battery_cycles INTEGER,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_telemetry_zyd_serial
ON telemetry_snapshots(zyd_serial);

CREATE INDEX IF NOT EXISTS idx_telemetry_captured_at
ON telemetry_snapshots(captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_firmware_upload_id
ON telemetry_snapshots(firmware_upload_id);

COMMENT ON TABLE telemetry_snapshots IS
'Anonymous telemetry data captured during firmware updates. ZYD serial is stored as text for tracking but not linked via foreign key for privacy.';


-- 6. Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE firmware_hw_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry_snapshots ENABLE ROW LEVEL SECURITY;

-- firmware_versions: Allow public to read active public firmware
DROP POLICY IF EXISTS "Public firmware readable by anyone" ON firmware_versions;
CREATE POLICY "Public firmware readable by anyone"
ON firmware_versions FOR SELECT
USING (is_active = true AND access_level = 'public');

-- firmware_versions: Allow service role full access
DROP POLICY IF EXISTS "Service role full access" ON firmware_versions;
CREATE POLICY "Service role full access"
ON firmware_versions FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- firmware_hw_targets: Anyone can read HW targets for active firmware
DROP POLICY IF EXISTS "HW targets readable for active firmware" ON firmware_hw_targets;
CREATE POLICY "HW targets readable for active firmware"
ON firmware_hw_targets FOR SELECT
USING (
    firmware_version_id IN (
        SELECT id FROM firmware_versions WHERE is_active = true
    )
);

-- firmware_hw_targets: Service role full access
DROP POLICY IF EXISTS "Service role full access to hw targets" ON firmware_hw_targets;
CREATE POLICY "Service role full access to hw targets"
ON firmware_hw_targets FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- telemetry_snapshots: Anyone can insert (anonymous telemetry)
DROP POLICY IF EXISTS "Anyone can submit telemetry" ON telemetry_snapshots;
CREATE POLICY "Anyone can submit telemetry"
ON telemetry_snapshots FOR INSERT
WITH CHECK (true);

-- telemetry_snapshots: Only service role can read
DROP POLICY IF EXISTS "Only admins can read telemetry" ON telemetry_snapshots;
CREATE POLICY "Only admins can read telemetry"
ON telemetry_snapshots FOR SELECT
USING (auth.jwt()->>'role' = 'service_role');

-- telemetry_snapshots: Service role can update/delete
DROP POLICY IF EXISTS "Service role full access to telemetry" ON telemetry_snapshots;
CREATE POLICY "Service role full access to telemetry"
ON telemetry_snapshots FOR ALL
USING (auth.jwt()->>'role' = 'service_role')
WITH CHECK (auth.jwt()->>'role' = 'service_role');


-- 7. Helper Functions
-- ============================================================================

-- Function to get available firmware for a given HW version and access level
CREATE OR REPLACE FUNCTION get_available_firmware(
    p_hw_version TEXT,
    p_access_level TEXT DEFAULT 'public',
    p_current_sw_version TEXT DEFAULT NULL
)
RETURNS TABLE (
    firmware_id UUID,
    version_label TEXT,
    file_path TEXT,
    file_size_bytes INTEGER,
    release_notes TEXT,
    min_sw_version TEXT,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        fv.id,
        fv.version_label,
        fv.file_path,
        fv.file_size_bytes,
        fv.release_notes,
        fv.min_sw_version,
        fv.created_at
    FROM firmware_versions fv
    INNER JOIN firmware_hw_targets fht ON fv.id = fht.firmware_version_id
    WHERE fv.is_active = true
        AND fht.hw_version = p_hw_version
        AND (
            (p_access_level = 'public' AND fv.access_level = 'public')
            OR (p_access_level = 'distributor' AND fv.access_level IN ('public', 'distributor'))
        )
        -- Optional: filter by minimum SW version requirement
        AND (
            fv.min_sw_version IS NULL
            OR p_current_sw_version IS NULL
            OR p_current_sw_version >= fv.min_sw_version
        )
    ORDER BY fv.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_available_firmware IS
'Returns available firmware for a given hardware version and access level';


-- Function to record telemetry snapshot
CREATE OR REPLACE FUNCTION record_telemetry(
    p_zyd_serial TEXT,
    p_hw_version TEXT,
    p_sw_version TEXT,
    p_odometer_km DECIMAL DEFAULT NULL,
    p_battery_cycles INTEGER DEFAULT NULL,
    p_firmware_upload_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_snapshot_id UUID;
BEGIN
    INSERT INTO telemetry_snapshots (
        zyd_serial,
        hw_version,
        sw_version,
        odometer_km,
        battery_cycles,
        firmware_upload_id,
        notes
    ) VALUES (
        p_zyd_serial,
        p_hw_version,
        p_sw_version,
        p_odometer_km,
        p_battery_cycles,
        p_firmware_upload_id,
        p_notes
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION record_telemetry IS
'Records an anonymous telemetry snapshot during firmware update or connection';


-- 8. Verification Queries
-- ============================================================================

-- Verify migration success
DO $$
DECLARE
    v_hw_targets_count INTEGER;
    v_firmware_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_firmware_count FROM firmware_versions;
    SELECT COUNT(*) INTO v_hw_targets_count FROM firmware_hw_targets;

    RAISE NOTICE 'Migration verification:';
    RAISE NOTICE '  Total firmware versions: %', v_firmware_count;
    RAISE NOTICE '  Total HW target mappings: %', v_hw_targets_count;

    IF v_hw_targets_count = 0 AND v_firmware_count > 0 THEN
        RAISE WARNING 'No HW targets created! Check if firmware_versions.target_hw_version had NULL values';
    END IF;
END $$;

-- Show firmware with their HW targets
-- SELECT
--     fv.version_label,
--     fv.access_level,
--     fv.is_active,
--     ARRAY_AGG(fht.hw_version ORDER BY fht.hw_version) as hw_versions
-- FROM firmware_versions fv
-- LEFT JOIN firmware_hw_targets fht ON fv.id = fht.firmware_version_id
-- GROUP BY fv.id, fv.version_label, fv.access_level, fv.is_active
-- ORDER BY fv.created_at DESC;
