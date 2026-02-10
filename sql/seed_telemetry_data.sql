-- ============================================================================
-- Telemetry Seed Data
-- Run this in the Supabase SQL Editor AFTER seed_test_data.sql
--
-- Creates ~29 telemetry snapshots across UK, US, and DE scooters.
-- Battery: 10S Li-ion pack (30V empty — 36V nominal — 42V full)
-- Max speed: 25 km/h
-- Embedded serial format: S{block}{model}{variant}{colour}-{serial}
--   block = region code, model = 2-digit, variant = battery, colour = colour code
--
-- ASSUMES: seed_test_data.sql has already been run (scooters and users exist).
-- ============================================================================

-- UK Scooter Telemetry (12 records — 2 for ZYD_1001001, 1 each for rest)
INSERT INTO scooter_telemetry (
    scooter_id, distributor_id, user_id, hw_version, sw_version,
    embedded_serial,
    voltage, current, speed_kmh, odometer_km,
    motor_temp, battery_temp, battery_soc, battery_health,
    battery_charge_cycles, battery_discharge_cycles,
    remaining_capacity_mah, full_capacity_mah,
    scan_type, notes, scanned_at, created_at
)
SELECT s.id, s.distributor_id, us.user_id,
    s.hw_version, s.firmware_version,
    v.embedded,
    v.voltage, v.current_val, v.speed, v.odometer,
    v.motor_temp, v.battery_temp, v.soc, v.health,
    v.charge_cycles, v.discharge_cycles,
    v.remaining_cap, v.full_cap,
    v.scan_type, v.notes, v.scan_time, v.scan_time
FROM scooters s
LEFT JOIN user_scooters us ON us.scooter_id = s.id AND us.is_primary = true
CROSS JOIN (VALUES
    -- ZYD_1001001: Recent idle scan (Advance 12Ah Black)
    ('ZYD_1001001', 'S008C1-000001', 38.5, 0.2, 0, 1245, 22, 21, 78, 95, 142, 185, 47500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days'),
    -- ZYD_1001001: Older ride scan
    ('ZYD_1001001', 'S008C1-000001', 37.2, 5.8, 22, 1250, 38, 28, 72, 95, 142, 186, 47200, 50000,
     'user_scan', NULL, NOW() - INTERVAL '5 days'),
    -- ZYD_1001002: Good condition (Advance 12Ah Black)
    ('ZYD_1001002', 'S008C1-000002', 40.1, 0.1, 0, 890, 20, 19, 92, 98, 98, 112, 49000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '1 day'),
    -- ZYD_1001003: Sport model, some vibration (Sport 9.6Ah Silver)
    ('ZYD_1001003', 'S016B2-000001', 35.8, 4.3, 18, 2100, 35, 25, 65, 90, 210, 265, 45000, 50000,
     'user_scan', 'Slight vibration at high speed', NOW() - INTERVAL '3 days'),
    -- ZYD_1001004: Good condition (Advance 12Ah Blue)
    ('ZYD_1001004', 'S008C3-000001', 37.5, 0.0, 0, 1580, 18, 17, 81, 93, 158, 198, 46500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '4 days'),
    -- ZYD_1001005: In service — low SOC (Sport 9.6Ah Black)
    ('ZYD_1001005', 'S016B1-000001', 33.0, 0.0, 0, 3200, 20, 20, 18, 72, 380, 425, 36000, 50000,
     'workshop_scan', 'Battery draining fast - in for service', NOW() - INTERVAL '5 days'),
    -- ZYD_1001006: Mid-ride (Advance 12Ah Black)
    ('ZYD_1001006', 'S008C1-000003', 39.8, 3.2, 15, 780, 30, 24, 88, 97, 82, 95, 48500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '7 days'),
    -- ZYD_1001007: Older firmware (Advance 9.6Ah Silver)
    ('ZYD_1001007', 'S008B2-000001', 36.5, 0.3, 0, 1890, 21, 20, 70, 88, 195, 240, 44000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '6 days'),
    -- ZYD_1001008: Sport model at top speed (Sport 12Ah Black)
    ('ZYD_1001008', 'S016C1-000001', 38.8, 5.1, 25, 1450, 36, 26, 82, 96, 150, 180, 48000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days'),
    -- ZYD_1001010: Low mileage, great condition (Advance 12Ah Silver)
    ('ZYD_1001010', 'S008C2-000001', 40.5, 0.0, 0, 520, 19, 18, 95, 99, 55, 62, 49500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '8 days'),
    -- ZYD_1001011: Ireland-registered Sport (Sport 9.6Ah Blue)
    ('ZYD_1001011', 'S016B3-000001', 38.2, 4.5, 20, 680, 33, 23, 90, 98, 72, 85, 49000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '3 days'),
    -- ZYD_1001012: Stolen — last scan before lockout (Advance 12Ah Black)
    ('ZYD_1001012', 'S008C1-000004', 31.5, 0.0, 0, 4500, 18, 18, 5, 60, 520, 580, 30000, 50000,
     'distributor_scan', 'Reported stolen - last scan before lockout', NOW() - INTERVAL '90 days')
) AS v(serial, embedded, voltage, current_val, speed, odometer,
       motor_temp, battery_temp, soc, health,
       charge_cycles, discharge_cycles,
       remaining_cap, full_cap, scan_type, notes, scan_time)
WHERE s.zyd_serial = v.serial
ON CONFLICT DO NOTHING;


-- US Scooter Telemetry (8 records)
INSERT INTO scooter_telemetry (
    scooter_id, distributor_id, user_id, hw_version, sw_version,
    embedded_serial,
    voltage, current, speed_kmh, odometer_km,
    motor_temp, battery_temp, battery_soc, battery_health,
    battery_charge_cycles, battery_discharge_cycles,
    remaining_capacity_mah, full_capacity_mah,
    scan_type, notes, scanned_at, created_at
)
SELECT s.id, s.distributor_id, us.user_id,
    s.hw_version, s.firmware_version,
    v.embedded,
    v.voltage, v.current_val, v.speed, v.odometer,
    v.motor_temp, v.battery_temp, v.soc, v.health,
    v.charge_cycles, v.discharge_cycles,
    v.remaining_cap, v.full_cap,
    v.scan_type, v.notes, v.scan_time, v.scan_time
FROM scooters s
LEFT JOIN user_scooters us ON us.scooter_id = s.id AND us.is_primary = true
CROSS JOIN (VALUES
    -- ZYD_2001001: Good condition (Advance 12Ah Black)
    ('ZYD_2001001', 'S108C1-000001', 38.8, 0.1, 0, 1100, 25, 28, 85, 96, 115, 140, 48000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '3 days'),
    -- ZYD_2001002: Sport model riding (Sport 9.6Ah Silver)
    ('ZYD_2001002', 'S116B2-000001', 37.8, 5.2, 24, 1350, 38, 30, 75, 94, 138, 168, 47000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '1 day'),
    -- ZYD_2001003: Older firmware (Advance 12Ah Blue)
    ('ZYD_2001003', 'S108C3-000001', 37.0, 0.0, 0, 980, 22, 24, 80, 95, 102, 125, 47500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days'),
    -- ZYD_2001004: Mid-ride (Advance 12Ah Black)
    ('ZYD_2001004', 'S108C1-000002', 40.0, 3.5, 18, 1620, 34, 27, 70, 92, 168, 205, 46000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '4 days'),
    -- ZYD_2001005: In service — motor error (Sport 9.6Ah Black)
    ('ZYD_2001005', 'S116B1-000001', 34.2, 0.0, 0, 2800, 20, 22, 25, 78, 310, 365, 39000, 50000,
     'workshop_scan', 'Motor stuttering - E04 error', NOW() - INTERVAL '8 days'),
    -- ZYD_2001006: Recent low-mileage (Advance 12Ah Silver)
    ('ZYD_2001006', 'S108C2-000001', 39.5, 0.3, 0, 650, 21, 23, 92, 98, 68, 78, 49200, 50000,
     'user_scan', NULL, NOW() - INTERVAL '1 day'),
    -- ZYD_2001007: Older firmware, high usage (Advance 9.6Ah Black)
    ('ZYD_2001007', 'S108B1-000001', 35.8, 0.0, 0, 1950, 23, 25, 68, 87, 200, 252, 43500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '5 days'),
    -- ZYD_2001008: Brand new, top speed (Sport 12Ah Blue)
    ('ZYD_2001008', 'S116C3-000001', 40.8, 6.2, 25, 420, 40, 29, 96, 99, 44, 50, 49800, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days')
) AS v(serial, embedded, voltage, current_val, speed, odometer,
       motor_temp, battery_temp, soc, health,
       charge_cycles, discharge_cycles,
       remaining_cap, full_cap, scan_type, notes, scan_time)
WHERE s.zyd_serial = v.serial
ON CONFLICT DO NOTHING;


-- DE/AT/CH Scooter Telemetry (9 records)
INSERT INTO scooter_telemetry (
    scooter_id, distributor_id, user_id, hw_version, sw_version,
    embedded_serial,
    voltage, current, speed_kmh, odometer_km,
    motor_temp, battery_temp, battery_soc, battery_health,
    battery_charge_cycles, battery_discharge_cycles,
    remaining_capacity_mah, full_capacity_mah,
    scan_type, notes, scanned_at, created_at
)
SELECT s.id, s.distributor_id, us.user_id,
    s.hw_version, s.firmware_version,
    v.embedded,
    v.voltage, v.current_val, v.speed, v.odometer,
    v.motor_temp, v.battery_temp, v.soc, v.health,
    v.charge_cycles, v.discharge_cycles,
    v.remaining_cap, v.full_cap,
    v.scan_type, v.notes, v.scan_time, v.scan_time
FROM scooters s
LEFT JOIN user_scooters us ON us.scooter_id = s.id AND us.is_primary = true
CROSS JOIN (VALUES
    -- ZYD_3001001: Good condition (Advance 12Ah Black)
    ('ZYD_3001001', 'S208C1-000001', 39.0, 0.2, 0, 1380, 20, 18, 80, 94, 142, 175, 47000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days'),
    -- ZYD_3001002: Sport model riding (Sport 9.6Ah Black)
    ('ZYD_3001002', 'S216B1-000001', 38.2, 4.8, 22, 1650, 35, 22, 73, 92, 170, 210, 46000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '1 day'),
    -- ZYD_3001003: Older firmware (Advance 12Ah Silver)
    ('ZYD_3001003', 'S208C2-000001', 37.5, 0.0, 0, 1200, 19, 17, 82, 95, 125, 150, 47500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '4 days'),
    -- ZYD_3001004: Inactive for 3 months (Advance 12Ah Black)
    ('ZYD_3001004', 'S208C1-000002', 35.2, 0.0, 0, 2450, 18, 16, 55, 82, 258, 310, 41000, 50000,
     'user_scan', 'Not ridden in 3 months', NOW() - INTERVAL '90 days'),
    -- ZYD_3001005: Sport model (Sport 9.6Ah Blue)
    ('ZYD_3001005', 'S216B3-000001', 39.5, 4.0, 20, 920, 33, 21, 88, 97, 95, 112, 48500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '3 days'),
    -- ZYD_3001006: In service — puncture (Advance 12Ah Blue)
    ('ZYD_3001006', 'S208C3-000001', 34.5, 0.0, 0, 2980, 20, 19, 30, 80, 325, 380, 40000, 50000,
     'workshop_scan', 'Tyre puncture repair', NOW() - INTERVAL '7 days'),
    -- ZYD_3001007: Austria-registered (Advance 12Ah Black)
    ('ZYD_3001007', 'S208C1-000003', 39.2, 0.1, 0, 780, 21, 20, 90, 98, 80, 95, 49000, 50000,
     'user_scan', NULL, NOW() - INTERVAL '1 day'),
    -- ZYD_3001008: Switzerland-registered Sport (Sport 12Ah Silver)
    ('ZYD_3001008', 'S216C2-000001', 40.0, 5.5, 24, 550, 37, 22, 93, 99, 58, 68, 49500, 50000,
     'user_scan', NULL, NOW() - INTERVAL '2 days'),
    -- ZYD_3001010: Very new (Advance 12Ah Black)
    ('ZYD_3001010', 'S208C1-000004', 41.0, 0.0, 0, 320, 18, 17, 98, 100, 32, 38, 49800, 50000,
     'user_scan', NULL, NOW() - INTERVAL '5 days')
) AS v(serial, embedded, voltage, current_val, speed, odometer,
       motor_temp, battery_temp, soc, health,
       charge_cycles, discharge_cycles,
       remaining_cap, full_cap, scan_type, notes, scan_time)
WHERE s.zyd_serial = v.serial
ON CONFLICT DO NOTHING;


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Total telemetry records: 29
--   UK scooters: 12 records (2 for ZYD_1001001, 1 each for others)
--   US scooters:  8 records
--   DE scooters:  9 records
--
-- Battery: 10S Li-ion (30V min — 36V nominal — 42V max)
-- Max speed: 25 km/h
-- Embedded serial format: S{block}{model}{variant}{colour}-{serial}
--   block = region (0=UK, 1=US, 2=DACH), model = 2-digit (08=Advance, 16=Sport)
--   variant = battery (A=7.2Ah, B=9.6Ah, C=12Ah), colour = (1=Black, 2=Silver, 3=Blue)
--
-- Notable data points:
--   ZYD_1001005: Low SOC (18%), workshop_scan — battery issue
--   ZYD_1001012: Very low SOC (5%), stolen scooter — old scan
--   ZYD_2001005: Workshop scan — motor error E04
--   ZYD_3001004: Inactive 3 months — low health
--   ZYD_3001006: Workshop scan — tyre puncture
-- ============================================================================
