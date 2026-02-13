-- Workshop Demo Sample Data
-- Populates realistic data for the Pure Electric Service Centre London (GB/IE territory)
-- to demonstrate the Pure Fleet API workshop portal.

-- =============================================================================
-- 1. SCOOTER TELEMETRY — Battery health, fault codes, varied readings
-- =============================================================================
-- Scooters: cc100000-0000-0000-0000-000000000001 through ...0012
-- Distributor: d1000000-0000-0000-0000-000000000001 (Pure Electric UK)

-- ZYD_1001001 (Advance, active) — Good battery, no faults, multiple readings over time
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', 'V1.0', 'V2.3', 52.1, 0.3, 0, 1520, 24, 22, 82, 93, 156, 198, 46500, 50000, 'user_connection', 0, '2026-02-12T09:15:00Z'),
('cc100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', 'V1.0', 'V2.3', 51.8, 0.1, 0, 1480, 21, 20, 91, 93, 154, 196, 46500, 50000, 'user_connection', 0, '2026-02-10T14:30:00Z'),
('cc100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', 'V1.0', 'V2.3', 50.5, 2.1, 18, 1410, 35, 26, 65, 94, 148, 190, 47000, 50000, 'user_connection', 0, '2026-02-05T17:45:00Z'),
('cc100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', 'V1.0', 'V2.3', 52.4, 0.0, 0, 1320, 19, 18, 100, 94, 140, 182, 47000, 50000, 'user_connection', 0, '2026-01-28T08:20:00Z'),
('cc100000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', 'V1.0', 'V2.2', 51.2, 0.5, 0, 1180, 22, 20, 75, 95, 130, 170, 47500, 50000, 'user_connection', 0, '2026-01-15T11:00:00Z');

-- ZYD_1001002 (Advance, active) — Decent battery, one historical fault
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '736a3e7f-28aa-48e3-aba7-2fb5fe0f3fb0', 'V1.0', 'V2.3', 51.5, 0.2, 0, 2340, 23, 21, 88, 87, 210, 265, 43500, 50000, 'user_connection', 0, '2026-02-13T08:00:00Z'),
('cc100000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '736a3e7f-28aa-48e3-aba7-2fb5fe0f3fb0', 'V1.0', 'V2.3', 49.8, 3.5, 22, 2280, 42, 30, 55, 87, 205, 260, 43500, 50000, 'user_connection', 1024, '2026-02-08T16:20:00Z'),
('cc100000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001', '736a3e7f-28aa-48e3-aba7-2fb5fe0f3fb0', 'V1.0', 'V2.3', 51.9, 0.0, 0, 2150, 20, 19, 95, 88, 195, 248, 44000, 50000, 'user_connection', 0, '2026-01-30T10:10:00Z');

-- ZYD_1001003 (Sport, active) — Good battery health
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'a5e653f8-73f5-4e7e-9ce1-fbed4989a001', 'V1.1', 'V2.3-Sport', 53.2, 0.1, 0, 890, 20, 19, 92, 97, 85, 110, 48500, 50000, 'user_connection', 0, '2026-02-12T18:30:00Z'),
('cc100000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000001', 'a5e653f8-73f5-4e7e-9ce1-fbed4989a001', 'V1.1', 'V2.3-Sport', 52.8, 0.5, 0, 820, 25, 22, 78, 97, 80, 105, 48500, 50000, 'user_connection', 0, '2026-02-06T12:15:00Z');

-- ZYD_1001004 (Advance, active) — Aging battery, under_voltage fault active
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', '5fbae0c3-90cb-4ec3-861b-77492968eba8', 'V1.0', 'V2.3', 44.2, 0.8, 0, 3890, 28, 25, 32, 68, 380, 490, 34000, 50000, 'user_connection', 1024, '2026-02-13T07:45:00Z'),
('cc100000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', '5fbae0c3-90cb-4ec3-861b-77492968eba8', 'V1.0', 'V2.3', 45.1, 0.3, 0, 3820, 24, 22, 45, 69, 375, 485, 34500, 50000, 'user_connection', 1024, '2026-02-09T15:30:00Z'),
('cc100000-0000-0000-0000-000000000004', 'd1000000-0000-0000-0000-000000000001', '5fbae0c3-90cb-4ec3-861b-77492968eba8', 'V1.0', 'V2.2', 47.8, 0.0, 0, 3650, 20, 19, 70, 72, 360, 468, 36000, 50000, 'user_connection', 0, '2026-01-20T09:00:00Z');

-- ZYD_1001005 (Sport, in_service) — Battery draining issue, currently in workshop
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', '429ee27a-596b-4b00-99d6-8e34d9305c39', 'V1.1', 'V2.3-Sport', 48.1, 0.0, 0, 1650, 22, 20, 20, 62, 290, 375, 31000, 50000, 'workshop_scan', 32, '2026-02-11T10:00:00Z'),
('cc100000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', '429ee27a-596b-4b00-99d6-8e34d9305c39', 'V1.1', 'V2.3-Sport', 49.5, 1.2, 12, 1620, 38, 28, 35, 63, 285, 370, 31500, 50000, 'user_connection', 32, '2026-02-01T14:20:00Z');

-- ZYD_1001006 (Advance, active) — Normal usage
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000006', 'd1000000-0000-0000-0000-000000000001', NULL, 'V1.0', 'V2.3', 52.0, 0.1, 0, 560, 19, 18, 95, 98, 52, 68, 49000, 50000, 'distributor_scan', 0, '2026-02-11T14:00:00Z');

-- ZYD_1001007 (Advance, active) — Motor over-temp + throttle fault
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000001', '30995d78-fea5-46e5-8e54-9f504cfa7a1c', 'V1.0', 'V2.3', 50.8, 5.2, 25, 2780, 68, 35, 60, 82, 245, 320, 41000, 50000, 'user_connection', 5, '2026-02-12T17:40:00Z'),
('cc100000-0000-0000-0000-000000000007', 'd1000000-0000-0000-0000-000000000001', '30995d78-fea5-46e5-8e54-9f504cfa7a1c', 'V1.0', 'V2.3', 51.5, 0.0, 0, 2720, 25, 22, 85, 83, 240, 315, 41500, 50000, 'user_connection', 0, '2026-02-07T08:00:00Z');

-- ZYD_1001008 (Sport, active) — Excellent condition
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000001', '84ddf59a-6ec9-45ce-99ce-58e0e77fd0fc', 'V1.1', 'V2.3-Sport', 53.5, 0.2, 0, 420, 18, 17, 96, 99, 38, 50, 49500, 50000, 'user_connection', 0, '2026-02-13T06:30:00Z'),
('cc100000-0000-0000-0000-000000000008', 'd1000000-0000-0000-0000-000000000001', '84ddf59a-6ec9-45ce-99ce-58e0e77fd0fc', 'V1.1', 'V2.3-Sport', 52.9, 0.8, 8, 380, 28, 22, 72, 99, 35, 46, 49500, 50000, 'user_connection', 0, '2026-02-04T13:15:00Z');

-- ZYD_1001009 (Advance, decommissioned) — Low health, multiple faults before decommission
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000009', 'd1000000-0000-0000-0000-000000000001', NULL, 'V1.0', 'V2.1', 42.0, 0.0, 0, 5200, 18, 16, 15, 45, 520, 680, 22500, 50000, 'workshop_scan', 2088, '2026-01-25T11:00:00Z');

-- ZYD_1001010 (Advance, active) — Good condition, regular rider
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000001', 'fb3901ba-4587-418c-85c1-3e96fad8ccbe', 'V1.0', 'V2.3', 51.8, 0.4, 0, 1890, 22, 20, 80, 90, 178, 230, 45000, 50000, 'user_connection', 0, '2026-02-12T07:50:00Z'),
('cc100000-0000-0000-0000-000000000010', 'd1000000-0000-0000-0000-000000000001', 'fb3901ba-4587-418c-85c1-3e96fad8ccbe', 'V1.0', 'V2.3', 52.2, 0.0, 0, 1810, 19, 18, 100, 90, 172, 224, 45000, 50000, 'user_connection', 0, '2026-02-03T19:30:00Z');

-- ZYD_1001011 (Sport, active, IE) — Good condition
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000001', NULL, 'V1.1', 'V2.3-Sport', 53.0, 0.0, 0, 710, 20, 19, 90, 96, 65, 85, 48000, 50000, 'distributor_scan', 0, '2026-02-10T10:00:00Z');

-- ZYD_1001012 (Advance, stolen) — Last scan before reported stolen, controller fault
INSERT INTO scooter_telemetry (scooter_id, distributor_id, user_id, hw_version, sw_version, voltage, current, speed_kmh, odometer_km, motor_temp, battery_temp, battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, scan_type, fault_code, scanned_at)
VALUES
('cc100000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000001', NULL, 'V1.0', 'V2.2', 50.5, 0.0, 0, 1950, 22, 20, 70, 78, 220, 285, 39000, 50000, 'distributor_scan', 8, '2026-01-18T16:00:00Z');


-- =============================================================================
-- 2. COMPONENT RECORDS — Batteries, motors, frames, controllers
-- =============================================================================
-- Already have records for scooter 0001 and 0002. Adding for 0003-0012.

-- Batteries (0003-0012)
INSERT INTO scooter_batteries (scooter_id, battery_serial, manufacturer, model, capacity_mah, manufacture_date, installed_date, is_current, installation_odometer_km)
VALUES
('cc100000-0000-0000-0000-000000000003', 'BAT-2025-SP003', 'Samsung', 'LI48V20AH-S', 20000, '2025-03-15', '2025-06-10T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000004', 'BAT-2024-AD004', 'Samsung', 'LI48V15AH', 15000, '2024-11-20', '2025-03-05T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000005', 'BAT-2025-SP005', 'LG', 'LI48V20AH-P', 20000, '2025-04-10', '2025-07-15T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000005', 'BAT-2024-SP005-OLD', 'Samsung', 'LI48V20AH-S', 20000, '2024-08-01', '2025-01-15T09:00:00Z', false, 0),
('cc100000-0000-0000-0000-000000000006', 'BAT-2025-AD006', 'Samsung', 'LI48V15AH', 15000, '2025-06-01', '2025-09-20T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000007', 'BAT-2025-AD007', 'Samsung', 'LI48V15AH', 15000, '2025-01-10', '2025-04-12T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000008', 'BAT-2025-SP008', 'LG', 'LI48V20AH-P', 20000, '2025-08-20', '2025-10-01T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000009', 'BAT-2024-AD009', 'Samsung', 'LI48V15AH', 15000, '2024-06-15', '2024-09-10T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000010', 'BAT-2025-AD010', 'Samsung', 'LI48V15AH', 15000, '2025-05-20', '2025-08-15T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000011', 'BAT-2025-SP011', 'LG', 'LI48V20AH-P', 20000, '2025-07-01', '2025-09-25T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000012', 'BAT-2025-AD012', 'Samsung', 'LI48V15AH', 15000, '2025-02-10', '2025-05-18T09:00:00Z', true, 0);

-- Mark the replaced battery on scooter 0005
UPDATE scooter_batteries SET removed_date = '2025-07-15T10:30:00Z', is_current = false, removal_reason = 'Cell 3 failure — warranty replacement' WHERE battery_serial = 'BAT-2024-SP005-OLD';

-- Motors (0003-0012)
INSERT INTO scooter_motors (scooter_id, motor_serial, manufacturer, model, power_watts, manufacture_date, installed_date, is_current, installation_odometer_km)
VALUES
('cc100000-0000-0000-0000-000000000003', 'MOT-SP003-01', 'Bafang', 'HM-500S', 500, '2025-03-10', '2025-06-10T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000004', 'MOT-AD004-01', 'Bosch', 'BBS02B', 750, '2024-11-15', '2025-03-05T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000005', 'MOT-SP005-01', 'Bafang', 'HM-500S', 500, '2025-04-05', '2025-07-15T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000006', 'MOT-AD006-01', 'Bosch', 'BBS02B', 750, '2025-05-28', '2025-09-20T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000007', 'MOT-AD007-01', 'Bosch', 'BBS02B', 750, '2025-01-05', '2025-04-12T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000008', 'MOT-SP008-01', 'Bafang', 'HM-500S', 500, '2025-08-15', '2025-10-01T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000009', 'MOT-AD009-01', 'Bosch', 'BBS02B', 750, '2024-06-10', '2024-09-10T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000010', 'MOT-AD010-01', 'Bosch', 'BBS02B', 750, '2025-05-15', '2025-08-15T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000011', 'MOT-SP011-01', 'Bafang', 'HM-500S', 500, '2025-06-25', '2025-09-25T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000012', 'MOT-AD012-01', 'Bosch', 'BBS02B', 750, '2025-02-05', '2025-05-18T09:00:00Z', true, 0);

-- Frames (0003-0012, scooters 0001/0002 already have frame records)
INSERT INTO scooter_frames (scooter_id, frame_serial, frame_type, material, color, weight_kg, manufacture_date, installed_date, is_current, installation_odometer_km)
VALUES
('cc100000-0000-0000-0000-000000000003', 'FRM-UK003', 'Sport', 'Carbon Fibre', 'Racing Red', 11.8, '2025-03-08', '2025-06-10T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000004', 'FRM-UK004', 'Advance', 'Aluminium 6061', 'Matte Black', 14.5, '2024-11-10', '2025-03-05T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000005', 'FRM-UK005', 'Sport', 'Carbon Fibre', 'Midnight Blue', 11.8, '2025-04-01', '2025-07-15T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000006', 'FRM-UK006', 'Advance', 'Aluminium 6061', 'White', 14.5, '2025-05-25', '2025-09-20T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000007', 'FRM-UK007', 'Advance', 'Aluminium 6061', 'Matte Black', 14.5, '2025-01-02', '2025-04-12T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000008', 'FRM-UK008', 'Sport', 'Carbon Fibre', 'Racing Red', 11.8, '2025-08-12', '2025-10-01T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000009', 'FRM-UK009', 'Advance', 'Aluminium 6061', 'Silver', 14.5, '2024-06-05', '2024-09-10T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000010', 'FRM-UK010', 'Advance', 'Aluminium 6061', 'Matte Black', 14.5, '2025-05-12', '2025-08-15T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000011', 'FRM-UK011', 'Sport', 'Carbon Fibre', 'Midnight Blue', 11.8, '2025-06-20', '2025-09-25T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000012', 'FRM-UK012', 'Advance', 'Aluminium 6061', 'White', 14.5, '2025-02-01', '2025-05-18T09:00:00Z', true, 0);

-- Controllers (0003-0012, scooters 0001/0002 already have controller records)
INSERT INTO scooter_controllers (scooter_id, controller_serial, hw_version, sw_version, manufacturer, model, installed_date, is_current, installation_odometer_km)
VALUES
('cc100000-0000-0000-0000-000000000003', 'CTL-UK003', 'V1.1', 'V2.3-Sport', 'Pure', 'GEN3-SPT', '2025-06-10T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000004', 'CTL-UK004', 'V1.0', 'V2.3', 'Pure', 'GEN3-ADV', '2025-03-05T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000005', 'CTL-UK005', 'V1.1', 'V2.3-Sport', 'Pure', 'GEN3-SPT', '2025-07-15T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000006', 'CTL-UK006', 'V1.0', 'V2.3', 'Pure', 'GEN3-ADV', '2025-09-20T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000007', 'CTL-UK007', 'V1.0', 'V2.3', 'Pure', 'GEN3-ADV', '2025-04-12T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000008', 'CTL-UK008', 'V1.1', 'V2.3-Sport', 'Pure', 'GEN3-SPT', '2025-10-01T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000009', 'CTL-UK009', 'V1.0', 'V2.1', 'Pure', 'GEN3-ADV', '2024-09-10T09:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000010', 'CTL-UK010', 'V1.0', 'V2.3', 'Pure', 'GEN3-ADV', '2025-08-15T10:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000011', 'CTL-UK011', 'V1.1', 'V2.3-Sport', 'Pure', 'GEN3-SPT', '2025-09-25T11:00:00Z', true, 0),
('cc100000-0000-0000-0000-000000000012', 'CTL-UK012', 'V1.0', 'V2.2', 'Pure', 'GEN3-ADV', '2025-05-18T09:00:00Z', true, 0);


-- =============================================================================
-- 3. ADDITIONAL SERVICE JOBS at London Workshop
-- =============================================================================
-- Workshop: ee100000-0000-0000-0000-000000000001
-- Technician: f8affa5c-cb8b-4e27-852d-e255645818f1 (George Evans)

INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id, status, booked_date, started_date, completed_date, issue_description, technician_notes, parts_used, firmware_updated, created_at, updated_at)
VALUES
-- Completed: throttle replacement
('bb100000-0000-0000-0000-000000000101', 'cc100000-0000-0000-0000-000000000003', 'ee100000-0000-0000-0000-000000000001', 'a5e653f8-73f5-4e7e-9ce1-fbed4989a001', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'completed', '2026-01-15T09:00:00Z', '2026-01-16T10:00:00Z', '2026-01-16T14:30:00Z', 'Throttle response intermittent — cuts out at half twist', 'Replaced throttle sensor unit. Tested through full range. Cleared fault code 4 (throttle_fault).', '["Throttle sensor assembly P/N TS-GEN3-02"]', false, '2026-01-15T09:00:00Z', '2026-01-16T14:30:00Z'),

-- Completed: firmware update + inspection
('bb100000-0000-0000-0000-000000000102', 'cc100000-0000-0000-0000-000000000002', 'ee100000-0000-0000-0000-000000000001', '736a3e7f-28aa-48e3-aba7-2fb5fe0f3fb0', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'completed', '2026-01-22T09:00:00Z', '2026-01-23T09:30:00Z', '2026-01-23T12:00:00Z', 'Annual service — firmware update and general inspection', 'Updated firmware V2.2 to V2.3. Brake pads at 60% — recommend replacement at next service. Tyre pressure adjusted.', '[]', true, '2026-01-22T09:00:00Z', '2026-01-23T12:00:00Z'),

-- Awaiting parts: motor bearing replacement
('bb100000-0000-0000-0000-000000000103', 'cc100000-0000-0000-0000-000000000007', 'ee100000-0000-0000-0000-000000000001', '30995d78-fea5-46e5-8e54-9f504cfa7a1c', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'awaiting_parts', '2026-02-10T09:00:00Z', '2026-02-11T10:00:00Z', NULL, 'Grinding noise from rear motor at speeds above 20km/h. Motor over-temperature warning on display.', 'Motor bearing worn. Replacement bearing kit on order from Bosch (ETA 3 days). Motor temp sensor reading 68°C at idle — consistent with bearing friction.', '[]', false, '2026-02-10T09:00:00Z', '2026-02-11T14:00:00Z'),

-- Booked: tyre replacement
('bb100000-0000-0000-0000-000000000104', 'cc100000-0000-0000-0000-000000000010', 'ee100000-0000-0000-0000-000000000001', 'fb3901ba-4587-418c-85c1-3e96fad8ccbe', NULL, 'booked', '2026-02-14T09:00:00Z', NULL, NULL, 'Front tyre worn below minimum tread depth. Customer requesting replacement.', NULL, '[]', false, '2026-02-12T15:00:00Z', '2026-02-12T15:00:00Z'),

-- Booked: battery inspection for warranty claim
('bb100000-0000-0000-0000-000000000105', 'cc100000-0000-0000-0000-000000000004', 'ee100000-0000-0000-0000-000000000001', '5fbae0c3-90cb-4ec3-861b-77492968eba8', NULL, 'booked', '2026-02-15T09:00:00Z', NULL, NULL, 'Battery capacity dropped significantly — only getting 15km range. Health at 68%. Customer requesting warranty assessment.', NULL, '[]', false, '2026-02-13T09:30:00Z', '2026-02-13T09:30:00Z'),

-- Completed: decommission inspection (assigned to distributor user as internal job)
('bb100000-0000-0000-0000-000000000106', 'cc100000-0000-0000-0000-000000000009', 'ee100000-0000-0000-0000-000000000001', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'completed', '2026-01-20T09:00:00Z', '2026-01-22T09:00:00Z', '2026-01-25T16:00:00Z', 'End-of-life assessment. Multiple fault codes, battery health at 45%. Recommend decommission.', 'Battery health 45%, multiple persistent faults (under-voltage, controller over-temp, controller fault). Frame shows stress cracks near headstock. Recommended for decommission — parts salvaged for spares.', '[]', false, '2026-01-20T09:00:00Z', '2026-01-25T16:00:00Z'),

-- Ready for collection
('bb100000-0000-0000-0000-000000000107', 'cc100000-0000-0000-0000-000000000008', 'ee100000-0000-0000-0000-000000000001', '84ddf59a-6ec9-45ce-99ce-58e0e77fd0fc', 'f8affa5c-cb8b-4e27-852d-e255645818f1', 'ready_for_collection', '2026-02-08T09:00:00Z', '2026-02-10T09:00:00Z', NULL, 'Brake pads worn — front and rear. Customer also mentioned slight wobble at speed.', 'Replaced front and rear brake pads. Front wheel bearing had slight play — tightened. Test ride completed at 25km/h, no wobble. Ready for collection.', '["Brake pad set (front) P/N BP-F-GEN3", "Brake pad set (rear) P/N BP-R-GEN3"]', false, '2026-02-08T09:00:00Z', '2026-02-12T11:00:00Z');


-- =============================================================================
-- 4. FIRMWARE UPLOADS for GB scooters
-- =============================================================================
-- Using firmware V2.3 (id: b9ec1c58-7a34-4db5-8f98-a127b243dfbe, target: V1.0)
-- and V2.3-Sport (id: f1000000-0000-0000-0000-000000000005, target: V1.1)

INSERT INTO firmware_uploads (scooter_id, firmware_version_id, distributor_id, old_hw_version, old_sw_version, new_version, status, error_message, started_at, completed_at)
VALUES
-- Successful updates
('cc100000-0000-0000-0000-000000000001', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-01-28T10:15:00Z', '2026-01-28T10:22:00Z'),
('cc100000-0000-0000-0000-000000000002', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-01-23T09:45:00Z', '2026-01-23T09:52:00Z'),
('cc100000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'V1.1', 'V2.2-Sport', 'V2.3-Sport', 'completed', NULL, '2026-01-20T14:00:00Z', '2026-01-20T14:08:00Z'),
('cc100000-0000-0000-0000-000000000006', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-02-01T11:30:00Z', '2026-02-01T11:37:00Z'),
('cc100000-0000-0000-0000-000000000007', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-01-25T15:00:00Z', '2026-01-25T15:07:00Z'),
('cc100000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'V1.1', 'V2.2-Sport', 'V2.3-Sport', 'completed', NULL, '2026-01-30T10:00:00Z', '2026-01-30T10:07:00Z'),
('cc100000-0000-0000-0000-000000000010', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-02-03T16:00:00Z', '2026-02-03T16:06:00Z'),
('cc100000-0000-0000-0000-000000000011', 'f1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'V1.1', 'V2.2-Sport', 'V2.3-Sport', 'completed', NULL, '2026-02-05T13:00:00Z', '2026-02-05T13:08:00Z'),
-- Failed updates
('cc100000-0000-0000-0000-000000000004', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'failed', 'BLE connection lost during chunk 14/28 — scooter powered off', '2026-01-22T11:00:00Z', '2026-01-22T11:05:00Z'),
('cc100000-0000-0000-0000-000000000004', 'b9ec1c58-7a34-4db5-8f98-a127b243dfbe', 'd1000000-0000-0000-0000-000000000001', 'V1.0', 'V2.2', 'V2.3', 'completed', NULL, '2026-01-22T11:30:00Z', '2026-01-22T11:37:00Z'),
('cc100000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'V1.1', 'V2.2-Sport', 'V2.3-Sport', 'failed', 'D0 upgrade permission denied — controller rejected firmware signature', '2026-01-18T14:00:00Z', '2026-01-18T14:01:00Z'),
('cc100000-0000-0000-0000-000000000005', 'f1000000-0000-0000-0000-000000000005', 'd1000000-0000-0000-0000-000000000001', 'V1.1', 'V2.2-Sport', 'V2.3-Sport', 'completed', NULL, '2026-01-19T09:00:00Z', '2026-01-19T09:08:00Z');


-- =============================================================================
-- 5. ACTIVITY EVENTS for GB scooters
-- =============================================================================

INSERT INTO activity_events (event_type, scooter_id, user_id, payload, timestamp)
VALUES
-- Scooter registrations
('scooter_registered', 'cc100000-0000-0000-0000-000000000001', NULL, '{"zyd_serial": "ZYD_1001001", "model": "Advance", "country": "GB"}', '2025-04-20T09:00:00Z'),
('scooter_registered', 'cc100000-0000-0000-0000-000000000003', NULL, '{"zyd_serial": "ZYD_1001003", "model": "Sport", "country": "GB"}', '2025-06-10T10:00:00Z'),
('scooter_registered', 'cc100000-0000-0000-0000-000000000008', NULL, '{"zyd_serial": "ZYD_1001008", "model": "Sport", "country": "GB"}', '2025-10-01T10:00:00Z'),

-- Status changes
('scooter_status_changed', 'cc100000-0000-0000-0000-000000000005', NULL, '{"old_status": "active", "new_status": "in_service", "reason": "Booked for battery inspection"}', '2026-02-02T21:58:00Z'),
('scooter_status_changed', 'cc100000-0000-0000-0000-000000000009', NULL, '{"old_status": "active", "new_status": "decommissioned", "reason": "End-of-life — multiple faults, battery degraded"}', '2026-01-25T16:00:00Z'),
('scooter_status_changed', 'cc100000-0000-0000-0000-000000000012', NULL, '{"old_status": "active", "new_status": "stolen", "reason": "Reported stolen by owner"}', '2026-01-20T10:00:00Z'),

-- Service job events
('service_job_created', 'cc100000-0000-0000-0000-000000000005', '429ee27a-596b-4b00-99d6-8e34d9305c39', '{"job_id": "bb100000-0000-0000-0000-000000000001", "issue": "Battery not holding charge"}', '2026-02-02T21:58:00Z'),
('service_job_created', 'cc100000-0000-0000-0000-000000000007', '30995d78-fea5-46e5-8e54-9f504cfa7a1c', '{"job_id": "bb100000-0000-0000-0000-000000000103", "issue": "Grinding noise from rear motor"}', '2026-02-10T09:00:00Z'),
('service_job_completed', 'cc100000-0000-0000-0000-000000000003', 'a5e653f8-73f5-4e7e-9ce1-fbed4989a001', '{"job_id": "bb100000-0000-0000-0000-000000000101", "resolution": "Throttle sensor replaced"}', '2026-01-16T14:30:00Z'),
('service_job_completed', 'cc100000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', '{"job_id": "bb100000-0000-0000-0000-000000000002", "resolution": "Front brake pads replaced"}', '2026-01-12T15:00:00Z'),

-- Firmware events
('firmware_update_started', 'cc100000-0000-0000-0000-000000000001', NULL, '{"firmware_version": "V2.3", "old_version": "V2.2"}', '2026-01-28T10:15:00Z'),
('firmware_update_completed', 'cc100000-0000-0000-0000-000000000001', NULL, '{"firmware_version": "V2.3", "old_version": "V2.2"}', '2026-01-28T10:22:00Z'),
('firmware_update_started', 'cc100000-0000-0000-0000-000000000004', NULL, '{"firmware_version": "V2.3", "old_version": "V2.2"}', '2026-01-22T11:00:00Z'),
('firmware_update_failed', 'cc100000-0000-0000-0000-000000000004', NULL, '{"firmware_version": "V2.3", "old_version": "V2.2", "error": "BLE connection lost"}', '2026-01-22T11:05:00Z'),
('firmware_update_completed', 'cc100000-0000-0000-0000-000000000004', NULL, '{"firmware_version": "V2.3", "old_version": "V2.2", "note": "Retry successful"}', '2026-01-22T11:37:00Z'),

-- User linked to scooter
('user_scooter_linked', 'cc100000-0000-0000-0000-000000000001', 'b073ba3b-a340-4b56-98db-770d743d0a30', '{"user_email": "james.wilson@example.com"}', '2025-08-21T10:00:00Z'),
('user_scooter_linked', 'cc100000-0000-0000-0000-000000000003', 'a5e653f8-73f5-4e7e-9ce1-fbed4989a001', '{"user_email": "david.brown@example.com"}', '2025-09-10T10:00:00Z'),
('user_scooter_linked', 'cc100000-0000-0000-0000-000000000008', '84ddf59a-6ec9-45ce-99ce-58e0e77fd0fc', '{"user_email": "amelia.roberts@example.com"}', '2025-10-30T10:00:00Z');


-- =============================================================================
-- 6. UPDATE scooters with firmware version info (for analytics/firmware)
-- =============================================================================
UPDATE scooters SET controller_hw_version = 'V1.0', controller_sw_version = 'V2.3' WHERE id IN (
  'cc100000-0000-0000-0000-000000000001',
  'cc100000-0000-0000-0000-000000000002',
  'cc100000-0000-0000-0000-000000000004',
  'cc100000-0000-0000-0000-000000000006',
  'cc100000-0000-0000-0000-000000000007',
  'cc100000-0000-0000-0000-000000000010'
);
UPDATE scooters SET controller_hw_version = 'V1.1', controller_sw_version = 'V2.3-Sport' WHERE id IN (
  'cc100000-0000-0000-0000-000000000003',
  'cc100000-0000-0000-0000-000000000005',
  'cc100000-0000-0000-0000-000000000008',
  'cc100000-0000-0000-0000-000000000011'
);
UPDATE scooters SET controller_hw_version = 'V1.0', controller_sw_version = 'V2.1' WHERE id = 'cc100000-0000-0000-0000-000000000009';
UPDATE scooters SET controller_hw_version = 'V1.0', controller_sw_version = 'V2.2' WHERE id = 'cc100000-0000-0000-0000-000000000012';
