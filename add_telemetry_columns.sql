-- Migration to add telemetry columns to firmware_uploads table
-- This allows storing real-time telemetry data captured during scans

-- Add telemetry columns to firmware_uploads table
ALTER TABLE firmware_uploads
ADD COLUMN IF NOT EXISTS voltage NUMERIC(5, 2),                    -- Battery voltage in volts
ADD COLUMN IF NOT EXISTS current NUMERIC(6, 2),                    -- Current in amps
ADD COLUMN IF NOT EXISTS battery_soc INTEGER,                      -- Battery State of Charge (0-100%)
ADD COLUMN IF NOT EXISTS battery_charge_cycles INTEGER,            -- Total charge cycles
ADD COLUMN IF NOT EXISTS battery_discharge_cycles INTEGER,         -- Total discharge cycles
ADD COLUMN IF NOT EXISTS odometer_km INTEGER,                      -- Odometer reading in kilometers
ADD COLUMN IF NOT EXISTS speed_kmh NUMERIC(5, 1),                  -- Current speed in km/h
ADD COLUMN IF NOT EXISTS motor_temp INTEGER,                       -- Motor temperature in °C
ADD COLUMN IF NOT EXISTS battery_temp INTEGER,                     -- Battery temperature in °C
ADD COLUMN IF NOT EXISTS battery_health INTEGER,                   -- Battery health percentage (0-100%)
ADD COLUMN IF NOT EXISTS remaining_capacity_mah INTEGER,           -- Remaining battery capacity in mAh
ADD COLUMN IF NOT EXISTS full_capacity_mah INTEGER,                -- Full charge capacity in mAh
ADD COLUMN IF NOT EXISTS embedded_serial TEXT;                     -- Embedded serial number from B0 packet

-- Add comment explaining the telemetry columns
COMMENT ON COLUMN firmware_uploads.voltage IS 'Battery voltage in volts (V) from 0xA0 packet';
COMMENT ON COLUMN firmware_uploads.current IS 'Motor current in amps (A) from 0xA0 packet';
COMMENT ON COLUMN firmware_uploads.battery_soc IS 'Battery State of Charge 0-100% from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.battery_charge_cycles IS 'Total charge cycles from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.battery_discharge_cycles IS 'Total discharge cycles from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.odometer_km IS 'Total distance traveled in kilometers from 0xA0 packet';
COMMENT ON COLUMN firmware_uploads.speed_kmh IS 'Current speed in km/h from 0xA0 packet';
COMMENT ON COLUMN firmware_uploads.motor_temp IS 'Motor temperature in degrees Celsius from 0xA0 packet';
COMMENT ON COLUMN firmware_uploads.battery_temp IS 'Battery temperature in degrees Celsius from 0xA0/0xA1 packet';
COMMENT ON COLUMN firmware_uploads.battery_health IS 'Battery health percentage 0-100% from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.remaining_capacity_mah IS 'Remaining battery capacity in mAh from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.full_capacity_mah IS 'Full charge capacity in mAh from 0xA1 packet';
COMMENT ON COLUMN firmware_uploads.embedded_serial IS 'Embedded serial number from B0 packet (if available)';
