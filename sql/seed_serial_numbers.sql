-- ============================================================================
-- Serial Number Seed Data
-- Run AFTER 005_serial_number_system.sql (which creates reference tables + seed data)
-- Updates all 30 existing scooters with serial numbers, model FKs, and
-- "at first registration" snapshot data.
-- ============================================================================


-- ============================================================================
-- STEP 1: Update scooters with reference table FKs and serial numbers
-- ============================================================================

-- Helper: Get reference table IDs by code
-- We use subqueries to look up IDs from the reference tables.

-- UK scooters (block=0, distributor: Pure Electric UK)
-- ZYD_1001001: Advance C Black  -> S008C1-000001
UPDATE scooters SET
    serial_number = 'S008C1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C1:00:00:01',
    original_serial_number = 'S008C1-000001',
    original_zyd_serial = 'ZYD_1001001',
    original_mac_address = 'PE:08:C1:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001001';

-- ZYD_1001002: Advance C Black  -> S008C1-000002
UPDATE scooters SET
    serial_number = 'S008C1-000002',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C1:00:00:02',
    original_serial_number = 'S008C1-000002',
    original_zyd_serial = 'ZYD_1001002',
    original_mac_address = 'PE:08:C1:00:00:02',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001002';

-- ZYD_1001003: Sport B Silver   -> S016B2-000001
UPDATE scooters SET
    serial_number = 'S016B2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:16:B2:00:00:01',
    original_serial_number = 'S016B2-000001',
    original_zyd_serial = 'ZYD_1001003',
    original_mac_address = 'PE:16:B2:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001003';

-- ZYD_1001004: Advance C Blue   -> S008C3-000001
UPDATE scooters SET
    serial_number = 'S008C3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C3:00:00:01',
    original_serial_number = 'S008C3-000001',
    original_zyd_serial = 'ZYD_1001004',
    original_mac_address = 'PE:08:C3:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001004';

-- ZYD_1001005: Sport B Black    -> S016B1-000001
UPDATE scooters SET
    serial_number = 'S016B1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:16:B1:00:00:01',
    original_serial_number = 'S016B1-000001',
    original_zyd_serial = 'ZYD_1001005',
    original_mac_address = 'PE:16:B1:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001005';

-- ZYD_1001006: Advance C Black  -> S008C1-000003
UPDATE scooters SET
    serial_number = 'S008C1-000003',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C1:00:00:03',
    original_serial_number = 'S008C1-000003',
    original_zyd_serial = 'ZYD_1001006',
    original_mac_address = 'PE:08:C1:00:00:03',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001006';

-- ZYD_1001007: Advance B Silver -> S008B2-000001
UPDATE scooters SET
    serial_number = 'S008B2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:B2:00:00:01',
    original_serial_number = 'S008B2-000001',
    original_zyd_serial = 'ZYD_1001007',
    original_mac_address = 'PE:08:B2:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001007';

-- ZYD_1001008: Sport C Black    -> S016C1-000001
UPDATE scooters SET
    serial_number = 'S016C1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:16:C1:00:00:01',
    original_serial_number = 'S016C1-000001',
    original_zyd_serial = 'ZYD_1001008',
    original_mac_address = 'PE:16:C1:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001008';

-- ZYD_1001009: Advance A Black  -> S008A1-000001 (decommissioned)
UPDATE scooters SET
    serial_number = 'S008A1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'A'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:A1:00:00:01',
    original_serial_number = 'S008A1-000001',
    original_zyd_serial = 'ZYD_1001009',
    original_mac_address = 'PE:08:A1:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001009';

-- ZYD_1001010: Advance C Silver -> S008C2-000001
UPDATE scooters SET
    serial_number = 'S008C2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C2:00:00:01',
    original_serial_number = 'S008C2-000001',
    original_zyd_serial = 'ZYD_1001010',
    original_mac_address = 'PE:08:C2:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001010';

-- ZYD_1001011: Sport B Blue     -> S016B3-000001 (Ireland)
UPDATE scooters SET
    serial_number = 'S016B3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:16:B3:00:00:01',
    original_serial_number = 'S016B3-000001',
    original_zyd_serial = 'ZYD_1001011',
    original_mac_address = 'PE:16:B3:00:00:01',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001011';

-- ZYD_1001012: Advance C Black  -> S008C1-000004 (stolen)
UPDATE scooters SET
    serial_number = 'S008C1-000004',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '0'),
    mac_address = 'PE:08:C1:00:00:04',
    original_serial_number = 'S008C1-000004',
    original_zyd_serial = 'ZYD_1001012',
    original_mac_address = 'PE:08:C1:00:00:04',
    first_registration_address = '{"line_1": "45 Electric Avenue", "line_2": "Unit 12", "city": "London", "region": "Greater London", "postcode": "SW9 8JQ", "country": "GB"}'::JSONB
WHERE zyd_serial = 'ZYD_1001012';


-- US scooters (block=1, distributor: EcoRide America)
-- ZYD_2001001: Advance C Black  -> S108C1-000001
UPDATE scooters SET
    serial_number = 'S108C1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:08:C1:01:00:01',
    original_serial_number = 'S108C1-000001',
    original_zyd_serial = 'ZYD_2001001',
    original_mac_address = 'PE:08:C1:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001001';

-- ZYD_2001002: Sport B Silver   -> S116B2-000001
UPDATE scooters SET
    serial_number = 'S116B2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:16:B2:01:00:01',
    original_serial_number = 'S116B2-000001',
    original_zyd_serial = 'ZYD_2001002',
    original_mac_address = 'PE:16:B2:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001002';

-- ZYD_2001003: Advance C Blue   -> S108C3-000001
UPDATE scooters SET
    serial_number = 'S108C3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:08:C3:01:00:01',
    original_serial_number = 'S108C3-000001',
    original_zyd_serial = 'ZYD_2001003',
    original_mac_address = 'PE:08:C3:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001003';

-- ZYD_2001004: Advance C Black  -> S108C1-000002
UPDATE scooters SET
    serial_number = 'S108C1-000002',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:08:C1:01:00:02',
    original_serial_number = 'S108C1-000002',
    original_zyd_serial = 'ZYD_2001004',
    original_mac_address = 'PE:08:C1:01:00:02',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001004';

-- ZYD_2001005: Sport B Black    -> S116B1-000001
UPDATE scooters SET
    serial_number = 'S116B1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:16:B1:01:00:01',
    original_serial_number = 'S116B1-000001',
    original_zyd_serial = 'ZYD_2001005',
    original_mac_address = 'PE:16:B1:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001005';

-- ZYD_2001006: Advance C Silver -> S108C2-000001
UPDATE scooters SET
    serial_number = 'S108C2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:08:C2:01:00:01',
    original_serial_number = 'S108C2-000001',
    original_zyd_serial = 'ZYD_2001006',
    original_mac_address = 'PE:08:C2:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001006';

-- ZYD_2001007: Advance B Black  -> S108B1-000001
UPDATE scooters SET
    serial_number = 'S108B1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:08:B1:01:00:01',
    original_serial_number = 'S108B1-000001',
    original_zyd_serial = 'ZYD_2001007',
    original_mac_address = 'PE:08:B1:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001007';

-- ZYD_2001008: Sport C Blue     -> S116C3-000001
UPDATE scooters SET
    serial_number = 'S116C3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '1'),
    mac_address = 'PE:16:C3:01:00:01',
    original_serial_number = 'S116C3-000001',
    original_zyd_serial = 'ZYD_2001008',
    original_mac_address = 'PE:16:C3:01:00:01',
    first_registration_address = '{"line_1": "1200 Innovation Drive", "line_2": "Suite 300", "city": "Austin", "region": "TX", "postcode": "78701", "country": "US"}'::JSONB
WHERE zyd_serial = 'ZYD_2001008';


-- DE/AT/CH scooters (block=2, distributor: VoltWerk Deutschland)
-- ZYD_3001001: Advance C Black  -> S208C1-000001
UPDATE scooters SET
    serial_number = 'S208C1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C1:02:00:01',
    original_serial_number = 'S208C1-000001',
    original_zyd_serial = 'ZYD_3001001',
    original_mac_address = 'PE:08:C1:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001001';

-- ZYD_3001002: Sport B Black    -> S216B1-000001
UPDATE scooters SET
    serial_number = 'S216B1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:16:B1:02:00:01',
    original_serial_number = 'S216B1-000001',
    original_zyd_serial = 'ZYD_3001002',
    original_mac_address = 'PE:16:B1:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001002';

-- ZYD_3001003: Advance C Silver -> S208C2-000001
UPDATE scooters SET
    serial_number = 'S208C2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C2:02:00:01',
    original_serial_number = 'S208C2-000001',
    original_zyd_serial = 'ZYD_3001003',
    original_mac_address = 'PE:08:C2:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001003';

-- ZYD_3001004: Advance C Black  -> S208C1-000002
UPDATE scooters SET
    serial_number = 'S208C1-000002',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C1:02:00:02',
    original_serial_number = 'S208C1-000002',
    original_zyd_serial = 'ZYD_3001004',
    original_mac_address = 'PE:08:C1:02:00:02',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001004';

-- ZYD_3001005: Sport B Blue     -> S216B3-000001
UPDATE scooters SET
    serial_number = 'S216B3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'B'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:16:B3:02:00:01',
    original_serial_number = 'S216B3-000001',
    original_zyd_serial = 'ZYD_3001005',
    original_mac_address = 'PE:16:B3:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001005';

-- ZYD_3001006: Advance C Blue   -> S208C3-000001
UPDATE scooters SET
    serial_number = 'S208C3-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '3'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C3:02:00:01',
    original_serial_number = 'S208C3-000001',
    original_zyd_serial = 'ZYD_3001006',
    original_mac_address = 'PE:08:C3:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001006';

-- ZYD_3001007: Advance C Black  -> S208C1-000003 (Austria)
UPDATE scooters SET
    serial_number = 'S208C1-000003',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C1:02:00:03',
    original_serial_number = 'S208C1-000003',
    original_zyd_serial = 'ZYD_3001007',
    original_mac_address = 'PE:08:C1:02:00:03',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001007';

-- ZYD_3001008: Sport C Silver   -> S216C2-000001 (Switzerland)
UPDATE scooters SET
    serial_number = 'S216C2-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '16'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '2'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:16:C2:02:00:01',
    original_serial_number = 'S216C2-000001',
    original_zyd_serial = 'ZYD_3001008',
    original_mac_address = 'PE:16:C2:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001008';

-- ZYD_3001009: Advance A Black  -> S208A1-000001 (decommissioned)
UPDATE scooters SET
    serial_number = 'S208A1-000001',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'A'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:A1:02:00:01',
    original_serial_number = 'S208A1-000001',
    original_zyd_serial = 'ZYD_3001009',
    original_mac_address = 'PE:08:A1:02:00:01',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001009';

-- ZYD_3001010: Advance C Black  -> S208C1-000004
UPDATE scooters SET
    serial_number = 'S208C1-000004',
    model_id = (SELECT id FROM scooter_models WHERE code = '08'),
    battery_variant_id = (SELECT id FROM battery_variants WHERE code = 'C'),
    colour_id = (SELECT id FROM colour_options WHERE code = '1'),
    block_code_id = (SELECT id FROM block_codes WHERE code = '2'),
    mac_address = 'PE:08:C1:02:00:04',
    original_serial_number = 'S208C1-000004',
    original_zyd_serial = 'ZYD_3001010',
    original_mac_address = 'PE:08:C1:02:00:04',
    first_registration_address = '{"line_1": "Voltastra\u00dfe 15", "city": "Berlin", "region": "Berlin", "postcode": "10179", "country": "DE"}'::JSONB
WHERE zyd_serial = 'ZYD_3001010';


-- ============================================================================
-- STEP 2: Seed serial_sequences to match the data we just inserted
-- This ensures the next auto-generated serial continues correctly
-- ============================================================================

INSERT INTO serial_sequences (sku_prefix, next_serial) VALUES
    ('S008C1', 5),   -- UK: 4 used (000001-000004)
    ('S016B2', 2),   -- UK: 1 used
    ('S008C3', 2),   -- UK+DE: 1+1 used (but different blocks, so 1 each actually)
    ('S016B1', 2),   -- UK: 1 used
    ('S008B2', 2),   -- UK: 1 used
    ('S016C1', 2),   -- UK: 1 used
    ('S008A1', 2),   -- UK: 1 used
    ('S008C2', 2),   -- UK: 1 used
    ('S016B3', 2),   -- UK: 1 used
    ('S108C1', 3),   -- US: 2 used
    ('S116B2', 2),   -- US: 1 used
    ('S108C3', 2),   -- US: 1 used
    ('S116B1', 2),   -- US: 1 used
    ('S108C2', 2),   -- US: 1 used
    ('S108B1', 2),   -- US: 1 used
    ('S116C3', 2),   -- US: 1 used
    ('S208C1', 5),   -- DE: 4 used
    ('S216B1', 2),   -- DE: 1 used
    ('S208C2', 2),   -- DE: 1 used
    ('S216B3', 2),   -- DE: 1 used
    ('S208C3', 2),   -- DE: 1 used
    ('S216C2', 2),   -- DE: 1 used
    ('S208A1', 2)    -- DE: 1 used
ON CONFLICT (sku_prefix) DO UPDATE SET next_serial = EXCLUDED.next_serial;


-- ============================================================================
-- STEP 3: Update model text field to use new names
-- ============================================================================

UPDATE scooters SET model = 'Advance' WHERE model = 'Gen3 Pro';
UPDATE scooters SET model = 'Sport'   WHERE model = 'Gen3 Sport';


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Updated: 30 scooters with serial_number, model_id, battery_variant_id,
--          colour_id, block_code_id, mac_address, and first-registration snapshot
-- Seeded:  23 serial_sequences entries
-- Renamed: Gen3 Pro -> Advance, Gen3 Sport -> Sport
-- ============================================================================
