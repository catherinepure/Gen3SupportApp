-- Add firmware/hardware version tracking columns to scooters table.
-- These capture the "last known" state from the 0xB0 BLE packet on each connection.

ALTER TABLE scooters ADD COLUMN IF NOT EXISTS controller_hw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS controller_sw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS meter_hw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS meter_sw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS bms_hw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS bms_sw_version VARCHAR(20);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS embedded_serial VARCHAR(50);
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMPTZ;

COMMENT ON COLUMN scooters.controller_hw_version IS 'Last known controller hardware version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.controller_sw_version IS 'Last known controller software version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.meter_hw_version IS 'Last known meter hardware version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.meter_sw_version IS 'Last known meter software version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.bms_hw_version IS 'Last known BMS hardware version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.bms_sw_version IS 'Last known BMS software version (from 0xB0 packet)';
COMMENT ON COLUMN scooters.embedded_serial IS 'Embedded serial number from 0xB0 Format B packet (13 chars)';
COMMENT ON COLUMN scooters.last_connected_at IS 'Timestamp of the most recent BLE connection';
