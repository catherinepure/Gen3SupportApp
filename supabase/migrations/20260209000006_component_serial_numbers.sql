-- Migration: Component Serial Numbers
-- Date: 2026-02-09
-- Description: Add proper tracking for battery, motor, and frame serial numbers

-- Battery Serial Numbers
CREATE TABLE IF NOT EXISTS scooter_batteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    battery_serial TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    capacity_mah INTEGER,
    manufacture_date DATE,
    installed_date TIMESTAMPTZ DEFAULT now(),
    removed_date TIMESTAMPTZ,
    is_current BOOLEAN DEFAULT true,
    installation_odometer_km NUMERIC(10,2),
    removal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Motor Serial Numbers
CREATE TABLE IF NOT EXISTS scooter_motors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    motor_serial TEXT NOT NULL,
    manufacturer TEXT,
    model TEXT,
    power_watts INTEGER,
    manufacture_date DATE,
    installed_date TIMESTAMPTZ DEFAULT now(),
    removed_date TIMESTAMPTZ,
    is_current BOOLEAN DEFAULT true,
    installation_odometer_km NUMERIC(10,2),
    removal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Frame/Chassis Serial Numbers
CREATE TABLE IF NOT EXISTS scooter_frames (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    frame_serial TEXT NOT NULL,
    frame_type TEXT,
    material TEXT,
    manufacture_date DATE,
    color TEXT,
    weight_kg NUMERIC(5,2),
    installed_date TIMESTAMPTZ DEFAULT now(),
    removed_date TIMESTAMPTZ,
    is_current BOOLEAN DEFAULT true,
    installation_odometer_km NUMERIC(10,2),
    removal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Controller Serial Numbers
CREATE TABLE IF NOT EXISTS scooter_controllers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scooter_id UUID NOT NULL REFERENCES scooters(id) ON DELETE CASCADE,
    controller_serial TEXT NOT NULL,
    hw_version TEXT,
    sw_version TEXT,
    manufacturer TEXT,
    model TEXT,
    installed_date TIMESTAMPTZ DEFAULT now(),
    removed_date TIMESTAMPTZ,
    is_current BOOLEAN DEFAULT true,
    installation_odometer_km NUMERIC(10,2),
    removal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partial unique indexes (only one current component per scooter)
CREATE UNIQUE INDEX IF NOT EXISTS unique_current_battery
    ON scooter_batteries(scooter_id) WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_current_motor
    ON scooter_motors(scooter_id) WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_current_frame
    ON scooter_frames(scooter_id) WHERE is_current = true;

CREATE UNIQUE INDEX IF NOT EXISTS unique_current_controller
    ON scooter_controllers(scooter_id) WHERE is_current = true;

-- Regular indexes
CREATE INDEX IF NOT EXISTS idx_scooter_batteries_scooter ON scooter_batteries(scooter_id);
CREATE INDEX IF NOT EXISTS idx_scooter_batteries_serial ON scooter_batteries(battery_serial);
CREATE INDEX IF NOT EXISTS idx_scooter_motors_scooter ON scooter_motors(scooter_id);
CREATE INDEX IF NOT EXISTS idx_scooter_motors_serial ON scooter_motors(motor_serial);
CREATE INDEX IF NOT EXISTS idx_scooter_frames_scooter ON scooter_frames(scooter_id);
CREATE INDEX IF NOT EXISTS idx_scooter_frames_serial ON scooter_frames(frame_serial);
CREATE INDEX IF NOT EXISTS idx_scooter_controllers_scooter ON scooter_controllers(scooter_id);
CREATE INDEX IF NOT EXISTS idx_scooter_controllers_serial ON scooter_controllers(controller_serial);

-- Auto-update timestamps
CREATE TRIGGER update_scooter_batteries_timestamp
    BEFORE UPDATE ON scooter_batteries
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_scooter_motors_timestamp
    BEFORE UPDATE ON scooter_motors
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_scooter_frames_timestamp
    BEFORE UPDATE ON scooter_frames
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_scooter_controllers_timestamp
    BEFORE UPDATE ON scooter_controllers
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Row Level Security
ALTER TABLE scooter_batteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooter_motors ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooter_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE scooter_controllers ENABLE ROW LEVEL SECURITY;

-- Admin policies
CREATE POLICY scooter_batteries_admin ON scooter_batteries FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');
CREATE POLICY scooter_motors_admin ON scooter_motors FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');
CREATE POLICY scooter_frames_admin ON scooter_frames FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');
CREATE POLICY scooter_controllers_admin ON scooter_controllers FOR ALL
    USING (auth.jwt() ->> 'role' = 'manufacturer_admin');

-- Sample data for first 5 scooters
INSERT INTO scooter_batteries (scooter_id, battery_serial, manufacturer, model, capacity_mah, manufacture_date, installation_odometer_km)
SELECT s.id, 'BAT-' || substring(s.zyd_serial from 5) || '-01', 
       CASE WHEN s.country_of_registration = 'GB' THEN 'Samsung' WHEN s.country_of_registration = 'US' THEN 'LG' ELSE 'CATL' END,
       'LI48V15AH', 15000, s.registration_date::date - INTERVAL '30 days', 0.0
FROM scooters s WHERE s.zyd_serial LIKE 'ZYD%' LIMIT 5 ON CONFLICT DO NOTHING;

INSERT INTO scooter_motors (scooter_id, motor_serial, manufacturer, model, power_watts, manufacture_date, installation_odometer_km)
SELECT s.id, 'MOT-' || substring(s.zyd_serial from 5) || '-01',
       CASE WHEN s.country_of_registration = 'GB' THEN 'Bosch' ELSE 'Bafang' END,
       'BBS02B', 750, s.registration_date::date - INTERVAL '30 days', 0.0
FROM scooters s WHERE s.zyd_serial LIKE 'ZYD%' LIMIT 5 ON CONFLICT DO NOTHING;

INSERT INTO scooter_frames (scooter_id, frame_serial, frame_type, material, manufacture_date, color, weight_kg, installation_odometer_km)
SELECT s.id, 'FRAME-' || substring(s.zyd_serial from 5) || '-01', 'standard', 'aluminum',
       s.registration_date::date - INTERVAL '35 days',
       CASE (random() * 3)::int WHEN 0 THEN 'black' WHEN 1 THEN 'silver' WHEN 2 THEN 'blue' ELSE 'red' END,
       18.5, 0.0
FROM scooters s WHERE s.zyd_serial LIKE 'ZYD%' LIMIT 5 ON CONFLICT DO NOTHING;

INSERT INTO scooter_controllers (scooter_id, controller_serial, hw_version, sw_version, manufacturer, model, installation_odometer_km)
SELECT s.id, 'CTRL-' || substring(s.zyd_serial from 5) || '-01', s.hw_version, s.firmware_version,
       'Pure Electric', 'Gen3-CTRL-V1', 0.0
FROM scooters s WHERE s.zyd_serial LIKE 'ZYD%' LIMIT 5 ON CONFLICT DO NOTHING;

COMMENT ON TABLE scooter_batteries IS 'Battery serial number tracking with replacement history';
COMMENT ON TABLE scooter_motors IS 'Motor serial number tracking with replacement history';
COMMENT ON TABLE scooter_frames IS 'Frame/chassis serial number tracking with replacement history';
COMMENT ON TABLE scooter_controllers IS 'Controller serial number tracking with replacement history';
