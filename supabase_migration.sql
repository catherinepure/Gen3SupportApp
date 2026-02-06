-- =============================================================================
-- MIGRATION SCRIPT: Add missing tables and columns
-- Run this on your existing Supabase database to fix schema inconsistencies
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add missing column: hw_version to scooters table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'scooters' AND column_name = 'hw_version'
    ) THEN
        ALTER TABLE scooters ADD COLUMN hw_version TEXT;
        RAISE NOTICE 'Added hw_version column to scooters table';
    ELSE
        RAISE NOTICE 'hw_version column already exists in scooters table';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Add missing column: access_level to firmware_versions table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'firmware_versions' AND column_name = 'access_level'
    ) THEN
        ALTER TABLE firmware_versions ADD COLUMN access_level TEXT NOT NULL DEFAULT 'distributor';
        CREATE INDEX idx_firmware_versions_access ON firmware_versions(access_level);
        RAISE NOTICE 'Added access_level column to firmware_versions table';
    ELSE
        RAISE NOTICE 'access_level column already exists in firmware_versions table';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Create firmware_hw_targets table (many-to-many junction table)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'firmware_hw_targets'
    ) THEN
        CREATE TABLE firmware_hw_targets (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            firmware_version_id UUID NOT NULL REFERENCES firmware_versions(id) ON DELETE CASCADE,
            hw_version TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(firmware_version_id, hw_version)
        );

        CREATE INDEX idx_firmware_hw_targets_firmware ON firmware_hw_targets(firmware_version_id);
        CREATE INDEX idx_firmware_hw_targets_hw ON firmware_hw_targets(hw_version);

        -- Enable RLS
        ALTER TABLE firmware_hw_targets ENABLE ROW LEVEL SECURITY;

        -- Add policy for anon access
        CREATE POLICY "anon_read_firmware_hw_targets"
            ON firmware_hw_targets FOR SELECT TO anon USING (true);

        RAISE NOTICE 'Created firmware_hw_targets table';

        -- Migrate existing data: create hw_target entries from existing target_hw_version
        INSERT INTO firmware_hw_targets (firmware_version_id, hw_version)
        SELECT id, target_hw_version
        FROM firmware_versions
        WHERE target_hw_version IS NOT NULL
        ON CONFLICT (firmware_version_id, hw_version) DO NOTHING;

        RAISE NOTICE 'Migrated existing firmware HW targets';
    ELSE
        RAISE NOTICE 'firmware_hw_targets table already exists';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Add index on firmware_uploads.status (for filtering)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'firmware_uploads' AND indexname = 'idx_firmware_uploads_status'
    ) THEN
        CREATE INDEX idx_firmware_uploads_status ON firmware_uploads(status);
        RAISE NOTICE 'Added index on firmware_uploads.status';
    ELSE
        RAISE NOTICE 'Index on firmware_uploads.status already exists';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Create telemetry_snapshots table
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'telemetry_snapshots'
    ) THEN
        CREATE TABLE telemetry_snapshots (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            zyd_serial TEXT NOT NULL,
            hw_version TEXT,
            sw_version TEXT,
            odometer_km NUMERIC(10, 2),
            battery_cycles INTEGER,
            notes TEXT,
            captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX idx_telemetry_zyd_serial ON telemetry_snapshots(zyd_serial);
        CREATE INDEX idx_telemetry_captured_at ON telemetry_snapshots(captured_at DESC);

        -- Enable RLS
        ALTER TABLE telemetry_snapshots ENABLE ROW LEVEL SECURITY;

        -- Add policies for anon access
        CREATE POLICY "anon_read_telemetry"
            ON telemetry_snapshots FOR SELECT TO anon USING (true);

        CREATE POLICY "anon_insert_telemetry"
            ON telemetry_snapshots FOR INSERT TO anon WITH CHECK (true);

        RAISE NOTICE 'Created telemetry_snapshots table';
    ELSE
        RAISE NOTICE 'telemetry_snapshots table already exists';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Summary of changes:';
    RAISE NOTICE '1. Added hw_version column to scooters';
    RAISE NOTICE '2. Added access_level column to firmware_versions';
    RAISE NOTICE '3. Created firmware_hw_targets table';
    RAISE NOTICE '4. Created telemetry_snapshots table';
    RAISE NOTICE '5. Added missing indexes';
    RAISE NOTICE '6. Migrated existing firmware HW targets';
    RAISE NOTICE '========================================';
END $$;
