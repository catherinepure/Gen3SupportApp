-- Simple Migration: Create scooter_telemetry table
-- Run this first, then add RLS policies later if needed

-- Drop existing table if it exists
DROP TABLE IF EXISTS scooter_telemetry CASCADE;

-- Create the table
CREATE TABLE scooter_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL,
    distributor_id UUID,
    user_id UUID,

    hw_version VARCHAR(50),
    sw_version VARCHAR(50),
    embedded_serial VARCHAR(50),

    voltage DOUBLE PRECISION,
    current DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION,
    odometer_km INTEGER,
    motor_temp INTEGER,
    battery_temp INTEGER,

    battery_soc INTEGER,
    battery_health INTEGER,
    battery_charge_cycles INTEGER,
    battery_discharge_cycles INTEGER,
    remaining_capacity_mah INTEGER,
    full_capacity_mah INTEGER,

    scan_type VARCHAR(20) DEFAULT 'distributor_scan',
    notes TEXT,
    scanned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_scooter_telemetry_scooter ON scooter_telemetry(scooter_id, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_distributor ON scooter_telemetry(distributor_id, scanned_at DESC);
CREATE INDEX idx_scooter_telemetry_scan_type ON scooter_telemetry(scan_type);

-- Add comments
COMMENT ON TABLE scooter_telemetry IS 'Telemetry snapshots from distributor scans';

-- Disable RLS for now (enable later if needed)
ALTER TABLE scooter_telemetry DISABLE ROW LEVEL SECURITY;

-- Grant basic permissions
GRANT ALL ON scooter_telemetry TO postgres;
GRANT ALL ON scooter_telemetry TO service_role;

SELECT 'scooter_telemetry table created successfully!' as status;
