-- Add new telemetry columns from correct 0xA0/0xA1 protocol parsing
-- These fields were previously missing because the Android app was misinterpreting
-- the BLE packet byte layout. Now aligned with the Python reference protocol.

-- From 0xA0 (Running Data) - previously not captured:
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS controller_temp INTEGER;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS fault_code INTEGER DEFAULT 0;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS gear_level INTEGER;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS trip_distance_km INTEGER;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS remaining_range_km INTEGER;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS motor_rpm INTEGER;
ALTER TABLE scooter_telemetry ADD COLUMN IF NOT EXISTS current_limit DOUBLE PRECISION;

-- Add comments for documentation
COMMENT ON COLUMN scooter_telemetry.controller_temp IS 'Controller temperature in °C (from 0xA0 byte 17)';
COMMENT ON COLUMN scooter_telemetry.fault_code IS 'Fault code bitmap (from 0xA0 bytes 3-4, bit N = fault EN)';
COMMENT ON COLUMN scooter_telemetry.gear_level IS 'Current gear level 1-4 (from 0xA0 control flags bits 0-1)';
COMMENT ON COLUMN scooter_telemetry.trip_distance_km IS 'Trip distance in km (from 0xA0 byte 10)';
COMMENT ON COLUMN scooter_telemetry.remaining_range_km IS 'Estimated remaining range in km (from 0xA0 byte 13)';
COMMENT ON COLUMN scooter_telemetry.motor_rpm IS 'Motor RPM (from 0xA0 bytes 18-19)';
COMMENT ON COLUMN scooter_telemetry.current_limit IS 'Current limit in Amps (from 0xA0 bytes 14-15, 0.1A resolution)';

-- Also add to firmware_uploads table (which also stores telemetry on scan records)
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS controller_temp INTEGER;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS fault_code INTEGER DEFAULT 0;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS gear_level INTEGER;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS trip_distance_km INTEGER;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS remaining_range_km INTEGER;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS motor_rpm INTEGER;
ALTER TABLE firmware_uploads ADD COLUMN IF NOT EXISTS current_limit DOUBLE PRECISION;
