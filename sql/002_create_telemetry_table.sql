-- Migration: Separate telemetry from firmware updates
-- Date: 2026-02-06
-- Purpose: Create dedicated scooter_telemetry table for scan records

-- 1. Create scooter_telemetry table
CREATE TABLE IF NOT EXISTS scooter_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID REFERENCES scooters(id) ON DELETE CASCADE NOT NULL,
    distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

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
    scan_type VARCHAR(20) DEFAULT 'distributor_scan',  -- 'distributor_scan', 'user_connection', 'firmware_update'
    notes TEXT,
    scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_scooter ON scooter_telemetry(scooter_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_distributor ON scooter_telemetry(distributor_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_user ON scooter_telemetry(user_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_scooter_telemetry_scan_type ON scooter_telemetry(scan_type, scanned_at DESC);

-- 3. Add RLS (Row Level Security) policies
ALTER TABLE scooter_telemetry ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Distributors can insert telemetry" ON scooter_telemetry;
DROP POLICY IF EXISTS "Distributors can view their telemetry" ON scooter_telemetry;
DROP POLICY IF EXISTS "Users can view their scooter telemetry" ON scooter_telemetry;

-- Distributors can insert their own telemetry
CREATE POLICY "Distributors can insert telemetry" ON scooter_telemetry
    FOR INSERT
    WITH CHECK (auth.uid() = distributor_id);

-- Distributors can view telemetry for scooters they've scanned
CREATE POLICY "Distributors can view their telemetry" ON scooter_telemetry
    FOR SELECT
    USING (auth.uid() = distributor_id);

-- Users can view telemetry for their registered scooters
CREATE POLICY "Users can view their scooter telemetry" ON scooter_telemetry
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM user_scooters
            WHERE user_scooters.scooter_id = scooter_telemetry.scooter_id
            AND user_scooters.user_id = auth.uid()
        )
    );

-- 4. Migrate existing scan records from firmware_uploads (if any)
-- This is optional - only run if you have existing data to preserve
/*
INSERT INTO scooter_telemetry (
    scooter_id,
    distributor_id,
    hw_version,
    sw_version,
    embedded_serial,
    voltage,
    current,
    speed_kmh,
    odometer_km,
    motor_temp,
    battery_temp,
    battery_soc,
    battery_health,
    battery_charge_cycles,
    battery_discharge_cycles,
    remaining_capacity_mah,
    full_capacity_mah,
    scan_type,
    scanned_at
)
SELECT
    scooter_id,
    distributor_id,
    old_hw_version,
    old_sw_version,
    embedded_serial,
    voltage,
    current,
    speed_kmh,
    odometer_km,
    motor_temp,
    battery_temp,
    battery_soc,
    battery_health,
    battery_charge_cycles,
    battery_discharge_cycles,
    remaining_capacity_mah,
    full_capacity_mah,
    'distributor_scan',
    started_at
FROM firmware_uploads
WHERE status = 'scanned';
*/

-- 5. Update firmware_uploads table to link to telemetry (optional)
-- Only run this if you want to keep firmware_uploads for actual updates
/*
ALTER TABLE firmware_uploads
ADD COLUMN IF NOT EXISTS before_telemetry_id UUID REFERENCES scooter_telemetry(id),
ADD COLUMN IF NOT EXISTS after_telemetry_id UUID REFERENCES scooter_telemetry(id);
*/

-- 6. Comment the table
COMMENT ON TABLE scooter_telemetry IS 'Telemetry snapshots captured during distributor scans, user connections, and firmware updates';
COMMENT ON COLUMN scooter_telemetry.scan_type IS 'Type of scan: distributor_scan, user_connection, or firmware_update';
COMMENT ON COLUMN scooter_telemetry.user_id IS 'User who owned the scooter at time of scan (NULL if not registered)';
COMMENT ON COLUMN scooter_telemetry.distributor_id IS 'Distributor who performed the scan (NULL for user connections)';
