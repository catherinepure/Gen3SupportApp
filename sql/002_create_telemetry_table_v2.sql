-- Migration: Separate telemetry from firmware updates
-- Date: 2026-02-06
-- Purpose: Create dedicated scooter_telemetry table for scan records
-- Version: 2 (Fixed for Supabase compatibility)

-- 1. Drop table if exists (for clean reinstall)
DROP TABLE IF EXISTS scooter_telemetry CASCADE;

-- 2. Create scooter_telemetry table
CREATE TABLE scooter_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL,
    distributor_id UUID,
    user_id UUID,

    -- Version info at time of scan
    hw_version VARCHAR(50),
    sw_version VARCHAR(50),
    embedded_serial VARCHAR(50),

    -- 0xA0 Running Data
    voltage DOUBLE PRECISION,
    current DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION,
    odometer_km INTEGER,
    motor_temp INTEGER,
    battery_temp INTEGER,

    -- 0xA1 BMS Data
    battery_soc INTEGER,
    battery_health INTEGER,
    battery_charge_cycles INTEGER,
    battery_discharge_cycles INTEGER,
    remaining_capacity_mah INTEGER,
    full_capacity_mah INTEGER,

    -- Metadata
    scan_type VARCHAR(20) DEFAULT 'distributor_scan',
    notes TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Add foreign key constraints (after table creation)
-- Note: Only add if the referenced tables exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scooters') THEN
        ALTER TABLE scooter_telemetry
        ADD CONSTRAINT fk_scooter
        FOREIGN KEY (scooter_id) REFERENCES scooters(id) ON DELETE CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'distributors') THEN
        ALTER TABLE scooter_telemetry
        ADD CONSTRAINT fk_distributor
        FOREIGN KEY (distributor_id) REFERENCES distributors(id) ON DELETE SET NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        ALTER TABLE scooter_telemetry
        ADD CONSTRAINT fk_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 4. Create indexes for performance
CREATE INDEX idx_scooter_telemetry_scooter ON scooter_telemetry(scooter_id, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_distributor ON scooter_telemetry(distributor_id, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_user ON scooter_telemetry(user_id, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_scan_type ON scooter_telemetry(scan_type, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_created ON scooter_telemetry(created_at DESC);

-- 5. Add table and column comments
COMMENT ON TABLE scooter_telemetry IS 'Telemetry snapshots captured during distributor scans, user connections, and firmware updates';
COMMENT ON COLUMN scooter_telemetry.scan_type IS 'Type of scan: distributor_scan, user_connection, or firmware_update';
COMMENT ON COLUMN scooter_telemetry.user_id IS 'User who owned the scooter at time of scan (NULL if not registered)';
COMMENT ON COLUMN scooter_telemetry.distributor_id IS 'Distributor who performed the scan (NULL for user connections)';
COMMENT ON COLUMN scooter_telemetry.scanned_at IS 'Timestamp when the scan was performed';

-- 6. Enable RLS (Row Level Security)
ALTER TABLE scooter_telemetry ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies
-- Allow distributors to insert their own telemetry
CREATE POLICY "Distributors can insert telemetry" ON scooter_telemetry
    FOR INSERT
    WITH CHECK (
        distributor_id IS NOT NULL AND
        auth.uid() = distributor_id
    );

-- Allow distributors to view their own telemetry
CREATE POLICY "Distributors can view their telemetry" ON scooter_telemetry
    FOR SELECT
    USING (
        distributor_id IS NOT NULL AND
        auth.uid() = distributor_id
    );

-- Allow users to view telemetry for their registered scooters
CREATE POLICY "Users can view their scooter telemetry" ON scooter_telemetry
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_scooters
            WHERE user_scooters.scooter_id = scooter_telemetry.scooter_id
            AND user_scooters.user_id = auth.uid()
        )
    );

-- 8. Grant permissions
GRANT SELECT, INSERT ON scooter_telemetry TO authenticated;
GRANT SELECT ON scooter_telemetry TO anon;

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'scooter_telemetry table created successfully!';
    RAISE NOTICE 'Table has % columns', (SELECT count(*) FROM information_schema.columns WHERE table_name = 'scooter_telemetry');
END $$;
