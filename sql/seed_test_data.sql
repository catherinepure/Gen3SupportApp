-- ============================================================================
-- Comprehensive Test Data Seed
-- Run this in the Supabase SQL Editor
--
-- ASSUMES: seed_test_users.sql has ALREADY been run (50 users exist).
-- This script adds everything else around those users and fills gaps.
--
-- Creates:
--   3 Distributors (UK, USA, Germany) with addresses
--   3 Workshops (one per region) with addresses
--   30 Scooters across the 3 distributors
--   Updates existing users to link staff to distributors/workshops
--   Adds ~23 new users (admins, extra staff, extra customers for US region)
--   User-Scooter links (by email lookup — works with any user UUIDs)
--   6 Service jobs
--   Activity events
--   Firmware versions
--
-- Password for all test users: password123
-- SHA-256: ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
-- ============================================================================


-- ============================================================================
-- STEP 1: Distributors (3 regions)
-- ============================================================================

INSERT INTO distributors (id, name, is_active, countries, phone, email, created_at)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Pure Electric UK', true,
   ARRAY['GB', 'IE']::TEXT[], '+44 20 7946 0958', 'ops@pureelectric-uk.example.com',
   NOW() - INTERVAL '365 days'),

  ('d1000000-0000-0000-0000-000000000002', 'EcoRide America', true,
   ARRAY['US']::TEXT[], '+1 555-0142', 'ops@ecoride-us.example.com',
   NOW() - INTERVAL '300 days'),

  ('d1000000-0000-0000-0000-000000000003', 'VoltWerk Deutschland', true,
   ARRAY['DE', 'AT', 'CH']::TEXT[], '+49 30 12345678', 'ops@voltwerk-de.example.com',
   NOW() - INTERVAL '280 days')
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- STEP 2: Addresses for distributors (using new distributor_addresses table)
-- ============================================================================

INSERT INTO distributor_addresses (id, distributor_id, line_1, line_2, city, region, postcode, country, is_primary)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
   '45 Electric Avenue', 'Unit 12', 'London', 'Greater London', 'SW9 8JQ', 'GB', true),

  ('a1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002',
   '1200 Innovation Drive', 'Suite 300', 'Austin', 'TX', '78701', 'US', true),

  ('a1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000003',
   'Voltastraße 15', NULL, 'Berlin', 'Berlin', '10179', 'DE', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- STEP 3: Workshops (1 per region, linked to distributors)
-- ============================================================================

INSERT INTO workshops (id, name, phone, email, parent_distributor_id, service_area_countries, is_active, created_at)
VALUES
  ('ee100000-0000-0000-0000-000000000001', 'Pure Electric Service Centre London', '+44 20 7946 1234',
   'service-london@pureelectric-uk.example.com', 'd1000000-0000-0000-0000-000000000001',
   ARRAY['GB', 'IE']::TEXT[], true, NOW() - INTERVAL '300 days'),

  ('ee100000-0000-0000-0000-000000000002', 'EcoRide Austin Service Hub', '+1 555-0199',
   'service-austin@ecoride-us.example.com', 'd1000000-0000-0000-0000-000000000002',
   ARRAY['US']::TEXT[], true, NOW() - INTERVAL '250 days'),

  ('ee100000-0000-0000-0000-000000000003', 'VoltWerk Berlin Werkstatt', '+49 30 98765432',
   'werkstatt-berlin@voltwerk-de.example.com', 'd1000000-0000-0000-0000-000000000003',
   ARRAY['DE', 'AT', 'CH']::TEXT[], true, NOW() - INTERVAL '240 days')
ON CONFLICT DO NOTHING;


-- ============================================================================
-- STEP 4: Addresses for workshops (using new workshop_addresses table)
-- ============================================================================

INSERT INTO workshop_addresses (id, workshop_id, line_1, line_2, city, region, postcode, country, is_primary)
VALUES
  ('a1000000-0000-0000-0000-000000000011', 'ee100000-0000-0000-0000-000000000001',
   '12 Tooley Street', 'Arch 4', 'London', 'Greater London', 'SE1 2TF', 'GB', true),

  ('a1000000-0000-0000-0000-000000000012', 'ee100000-0000-0000-0000-000000000002',
   '850 Workshop Lane', NULL, 'Austin', 'TX', '78702', 'US', true),

  ('a1000000-0000-0000-0000-000000000013', 'ee100000-0000-0000-0000-000000000003',
   'Werkstattweg 8', NULL, 'Berlin', 'Berlin', '10245', 'DE', true)
ON CONFLICT (id) DO NOTHING;


-- ============================================================================
-- STEP 5: Scooters (30 total — 12 UK, 8 US, 10 DE)
-- ============================================================================

INSERT INTO scooters (id, zyd_serial, distributor_id, model, hw_version, status, firmware_version, country_of_registration, created_at)
VALUES
  -- UK scooters (Pure Electric UK) — 12 units
  ('cc100000-0000-0000-0000-000000000001', 'ZYD_1001001', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.3', 'GB', NOW() - INTERVAL '180 days'),
  ('cc100000-0000-0000-0000-000000000002', 'ZYD_1001002', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.3', 'GB', NOW() - INTERVAL '170 days'),
  ('cc100000-0000-0000-0000-000000000003', 'ZYD_1001003', 'd1000000-0000-0000-0000-000000000001', 'Sport', 'V1.1', 'active',         'V2.3', 'GB', NOW() - INTERVAL '160 days'),
  ('cc100000-0000-0000-0000-000000000004', 'ZYD_1001004', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.2', 'GB', NOW() - INTERVAL '150 days'),
  ('cc100000-0000-0000-0000-000000000005', 'ZYD_1001005', 'd1000000-0000-0000-0000-000000000001', 'Sport', 'V1.1', 'in_service',     'V2.3', 'GB', NOW() - INTERVAL '140 days'),
  ('cc100000-0000-0000-0000-000000000006', 'ZYD_1001006', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.3', 'GB', NOW() - INTERVAL '130 days'),
  ('cc100000-0000-0000-0000-000000000007', 'ZYD_1001007', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.1', 'GB', NOW() - INTERVAL '120 days'),
  ('cc100000-0000-0000-0000-000000000008', 'ZYD_1001008', 'd1000000-0000-0000-0000-000000000001', 'Sport', 'V1.1', 'active',         'V2.3', 'GB', NOW() - INTERVAL '110 days'),
  ('cc100000-0000-0000-0000-000000000009', 'ZYD_1001009', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'decommissioned', 'V2.0', 'GB', NOW() - INTERVAL '300 days'),
  ('cc100000-0000-0000-0000-000000000010', 'ZYD_1001010', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'active',         'V2.3', 'GB', NOW() - INTERVAL '90 days'),
  ('cc100000-0000-0000-0000-000000000011', 'ZYD_1001011', 'd1000000-0000-0000-0000-000000000001', 'Sport', 'V1.1', 'active',         'V2.3', 'IE', NOW() - INTERVAL '80 days'),
  ('cc100000-0000-0000-0000-000000000012', 'ZYD_1001012', 'd1000000-0000-0000-0000-000000000001', 'Advance',   'V1.0', 'stolen',         'V2.3', 'GB', NOW() - INTERVAL '200 days'),

  -- US scooters (EcoRide America) — 8 units
  ('cc100000-0000-0000-0000-000000000021', 'ZYD_2001001', 'd1000000-0000-0000-0000-000000000002', 'Advance',   'V1.0', 'active',     'V2.3', 'US', NOW() - INTERVAL '150 days'),
  ('cc100000-0000-0000-0000-000000000022', 'ZYD_2001002', 'd1000000-0000-0000-0000-000000000002', 'Sport', 'V1.1', 'active',     'V2.3', 'US', NOW() - INTERVAL '140 days'),
  ('cc100000-0000-0000-0000-000000000023', 'ZYD_2001003', 'd1000000-0000-0000-0000-000000000002', 'Advance',   'V1.0', 'active',     'V2.2', 'US', NOW() - INTERVAL '130 days'),
  ('cc100000-0000-0000-0000-000000000024', 'ZYD_2001004', 'd1000000-0000-0000-0000-000000000002', 'Advance',   'V1.0', 'active',     'V2.3', 'US', NOW() - INTERVAL '120 days'),
  ('cc100000-0000-0000-0000-000000000025', 'ZYD_2001005', 'd1000000-0000-0000-0000-000000000002', 'Sport', 'V1.1', 'in_service', 'V2.3', 'US', NOW() - INTERVAL '100 days'),
  ('cc100000-0000-0000-0000-000000000026', 'ZYD_2001006', 'd1000000-0000-0000-0000-000000000002', 'Advance',   'V1.0', 'active',     'V2.3', 'US', NOW() - INTERVAL '90 days'),
  ('cc100000-0000-0000-0000-000000000027', 'ZYD_2001007', 'd1000000-0000-0000-0000-000000000002', 'Advance',   'V1.0', 'active',     'V2.1', 'US', NOW() - INTERVAL '80 days'),
  ('cc100000-0000-0000-0000-000000000028', 'ZYD_2001008', 'd1000000-0000-0000-0000-000000000002', 'Sport', 'V1.1', 'active',     'V2.3', 'US', NOW() - INTERVAL '60 days'),

  -- German scooters (VoltWerk Deutschland) — 10 units
  ('cc100000-0000-0000-0000-000000000031', 'ZYD_3001001', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'active',         'V2.3', 'DE', NOW() - INTERVAL '160 days'),
  ('cc100000-0000-0000-0000-000000000032', 'ZYD_3001002', 'd1000000-0000-0000-0000-000000000003', 'Sport', 'V1.1', 'active',         'V2.3', 'DE', NOW() - INTERVAL '150 days'),
  ('cc100000-0000-0000-0000-000000000033', 'ZYD_3001003', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'active',         'V2.2', 'DE', NOW() - INTERVAL '140 days'),
  ('cc100000-0000-0000-0000-000000000034', 'ZYD_3001004', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'active',         'V2.3', 'DE', NOW() - INTERVAL '130 days'),
  ('cc100000-0000-0000-0000-000000000035', 'ZYD_3001005', 'd1000000-0000-0000-0000-000000000003', 'Sport', 'V1.1', 'active',         'V2.3', 'DE', NOW() - INTERVAL '120 days'),
  ('cc100000-0000-0000-0000-000000000036', 'ZYD_3001006', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'in_service',     'V2.3', 'DE', NOW() - INTERVAL '110 days'),
  ('cc100000-0000-0000-0000-000000000037', 'ZYD_3001007', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'active',         'V2.3', 'AT', NOW() - INTERVAL '100 days'),
  ('cc100000-0000-0000-0000-000000000038', 'ZYD_3001008', 'd1000000-0000-0000-0000-000000000003', 'Sport', 'V1.1', 'active',         'V2.3', 'CH', NOW() - INTERVAL '90 days'),
  ('cc100000-0000-0000-0000-000000000039', 'ZYD_3001009', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'decommissioned', 'V2.0', 'DE', NOW() - INTERVAL '280 days'),
  ('cc100000-0000-0000-0000-000000000040', 'ZYD_3001010', 'd1000000-0000-0000-0000-000000000003', 'Advance',   'V1.0', 'active',         'V2.3', 'DE', NOW() - INTERVAL '70 days')
ON CONFLICT (zyd_serial) DO NOTHING;


-- ============================================================================
-- STEP 6a: UPDATE existing users to link staff to distributors/workshops
-- These users were inserted by seed_test_users.sql with NULL distributor/workshop
-- ============================================================================

-- UK distributor staff
UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000001',
  user_level = 'distributor',
  roles = ARRAY['distributor_staff']::TEXT[]
WHERE email = 'emma.davies@example.com';

UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000001',
  user_level = 'distributor',
  roles = ARRAY['distributor_staff']::TEXT[]
WHERE email = 'sophie.walker@example.com';

-- UK workshop staff
UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000001',
  workshop_id = 'ee100000-0000-0000-0000-000000000001',
  user_level = 'maintenance',
  roles = ARRAY['workshop_staff']::TEXT[]
WHERE email = 'george.evans@example.com';

-- DE distributor staff
UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000003',
  user_level = 'distributor',
  roles = ARRAY['distributor_staff']::TEXT[]
WHERE email = 'max.weber@example.com';

-- DE workshop staff
UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000003',
  workshop_id = 'ee100000-0000-0000-0000-000000000003',
  user_level = 'maintenance',
  roles = ARRAY['workshop_staff']::TEXT[]
WHERE email = 'stefan.braun@example.com';

-- US users: mike.johnson was a customer in old seed — promote to distributor_staff
UPDATE users SET
  distributor_id = 'd1000000-0000-0000-0000-000000000002',
  user_level = 'distributor',
  roles = ARRAY['distributor_staff']::TEXT[],
  home_country = 'US',
  current_country = 'US'
WHERE email = 'mike.johnson@example.com';

-- jennifer.davis was US customer — make sure country is set
UPDATE users SET
  home_country = 'US',
  current_country = 'US'
WHERE email = 'jennifer.davis@example.com'
  AND (home_country IS NULL OR home_country != 'US');


-- ============================================================================
-- STEP 6b: INSERT new users not in the old seed
-- These are admins, extra staff, and extra US/DE customers
-- ============================================================================

INSERT INTO users (
    email, password_hash, first_name, last_name,
    user_level, roles, home_country, current_country,
    distributor_id, workshop_id,
    is_verified, is_active, gender, date_of_birth,
    scooter_use_type, created_at, last_login
) VALUES

-- UK Manufacturer Admin
('catherine.ives@pureelectric.example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Catherine', 'Ives', 'admin', ARRAY['manufacturer_admin']::TEXT[],
 'GB', 'GB', NULL, NULL,
 true, true, 'Female', '1980-06-15', NULL,
 NOW() - INTERVAL '365 days', NOW() - INTERVAL '1 hour'),

-- UK extra workshop staff
('peter.reynolds@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Peter', 'Reynolds', 'maintenance', ARRAY['workshop_staff']::TEXT[],
 'GB', 'GB', 'd1000000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
 true, true, 'Male', '1979-09-22', NULL,
 NOW() - INTERVAL '180 days', NOW() - INTERVAL '3 days'),

-- UK extra customers
('fiona.byrne@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Fiona', 'Byrne', 'user', ARRAY['customer']::TEXT[],
 'IE', 'IE', NULL, NULL,
 true, true, 'Female', '1994-11-03', 'Pleasure',
 NOW() - INTERVAL '95 days', NOW() - INTERVAL '5 days'),

('ben.cooper@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Ben', 'Cooper', 'user', ARRAY['customer']::TEXT[],
 'GB', 'GB', NULL, NULL,
 true, true, 'Male', '1987-06-30', 'Pleasure',
 NOW() - INTERVAL '60 days', NOW() - INTERVAL '2 days'),

-- US Manufacturer Admin
('admin.us@ecoride.example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Rachel', 'Chen', 'admin', ARRAY['manufacturer_admin']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Female', '1983-04-22', NULL,
 NOW() - INTERVAL '300 days', NOW() - INTERVAL '2 hours'),

-- US Workshop Staff
('carlos.mendez@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Carlos', 'Mendez', 'maintenance', ARRAY['workshop_staff']::TEXT[],
 'US', 'US', 'd1000000-0000-0000-0000-000000000002', 'ee100000-0000-0000-0000-000000000002',
 true, true, 'Male', '1981-08-15', NULL,
 NOW() - INTERVAL '180 days', NOW() - INTERVAL '1 day'),

-- US Customers (9 new)
('brandon.lee@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Brandon', 'Lee', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Male', '1990-03-18', 'Both',
 NOW() - INTERVAL '120 days', NOW() - INTERVAL '4 days'),

('ashley.martinez@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Ashley', 'Martinez', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Female', '1995-07-04', 'Pleasure',
 NOW() - INTERVAL '100 days', NOW() - INTERVAL '2 days'),

('tyler.wilson@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Tyler', 'Wilson', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Male', '1998-11-20', 'Pleasure',
 NOW() - INTERVAL '80 days', NOW() - INTERVAL '6 days'),

('samantha.taylor@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Samantha', 'Taylor', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, false, 'Female', '1988-02-14', 'Business',
 NOW() - INTERVAL '250 days', NOW() - INTERVAL '45 days'),

('kevin.nguyen@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Kevin', 'Nguyen', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 false, true, 'Male', '2001-06-11', 'Pleasure',
 NOW() - INTERVAL '25 days', NULL),

('emily.anderson@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Emily', 'Anderson', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Female', '1993-09-08', 'Both',
 NOW() - INTERVAL '70 days', NOW() - INTERVAL '1 day'),

('jason.patel@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Jason', 'Patel', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Male', '1985-01-25', 'Business',
 NOW() - INTERVAL '55 days', NOW() - INTERVAL '8 days'),

('megan.campbell@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Megan', 'Campbell', 'user', ARRAY['customer']::TEXT[],
 'US', 'US', NULL, NULL,
 true, true, 'Female', '1997-04-30', 'Pleasure',
 NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days'),

-- DE extra distributor staff
('nina.richter@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Nina', 'Richter', 'distributor', ARRAY['distributor_staff']::TEXT[],
 'DE', 'DE', 'd1000000-0000-0000-0000-000000000003', NULL,
 true, true, 'Female', '1991-05-14', NULL,
 NOW() - INTERVAL '150 days', NOW() - INTERVAL '1 day'),

-- DE extra workshop staff
('lisa.zimmermann@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Lisa', 'Zimmermann', 'maintenance', ARRAY['workshop_staff']::TEXT[],
 'DE', 'DE', 'd1000000-0000-0000-0000-000000000003', 'ee100000-0000-0000-0000-000000000003',
 true, true, 'Female', '1989-07-19', NULL,
 NOW() - INTERVAL '140 days', NOW() - INTERVAL '2 days'),

-- DE/AT/CH extra customers
('tobias.keller@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Tobias', 'Keller', 'user', ARRAY['customer']::TEXT[],
 'DE', 'DE', NULL, NULL,
 true, true, 'Male', '1992-03-21', 'Both',
 NOW() - INTERVAL '105 days', NOW() - INTERVAL '4 days'),

('markus.huber@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Markus', 'Huber', 'user', ARRAY['customer']::TEXT[],
 'AT', 'AT', NULL, NULL,
 true, true, 'Male', '1986-08-07', 'Business',
 NOW() - INTERVAL '85 days', NOW() - INTERVAL '6 days'),

('sophie.meier@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Sophie', 'Meier', 'user', ARRAY['customer']::TEXT[],
 'CH', 'CH', NULL, NULL,
 true, true, 'Female', '1993-12-18', 'Pleasure',
 NOW() - INTERVAL '75 days', NOW() - INTERVAL '3 days'),

('felix.lang@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Felix', 'Lang', 'user', ARRAY['customer']::TEXT[],
 'DE', 'DE', NULL, NULL,
 true, true, 'Male', '1998-10-05', 'Pleasure',
 NOW() - INTERVAL '35 days', NOW() - INTERVAL '2 days'),

('claudia.wolf@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Claudia', 'Wolf', 'user', ARRAY['customer']::TEXT[],
 'DE', 'DE', NULL, NULL,
 true, false, 'Female', '1985-04-27', 'Both',
 NOW() - INTERVAL '260 days', NOW() - INTERVAL '70 days'),

('lukas.schwarz@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Lukas', 'Schwarz', 'user', ARRAY['customer']::TEXT[],
 'DE', 'DE', NULL, NULL,
 true, true, 'Male', '1991-06-14', 'Pleasure',
 NOW() - INTERVAL '45 days', NOW() - INTERVAL '7 days'),

('hannah.berger@example.com',
 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
 'Hannah', 'Berger', 'user', ARRAY['customer']::TEXT[],
 'DE', 'DE', NULL, NULL,
 false, true, 'Female', '2000-02-22', 'Pleasure',
 NOW() - INTERVAL '12 days', NULL)

ON CONFLICT (email) DO NOTHING;


-- ============================================================================
-- STEP 7: User-Scooter Links (using email subqueries for user IDs)
-- This works regardless of what UUIDs the users have in the database.
-- ============================================================================

INSERT INTO user_scooters (user_id, scooter_id, zyd_serial, is_primary, registered_at, last_connected_at,
    controller_hw_version, controller_sw_version, initial_odometer_km, initial_battery_soc)

-- UK customers → UK scooters
SELECT u.id, 'cc100000-0000-0000-0000-000000000001'::uuid, 'ZYD_1001001', true,
  NOW() - INTERVAL '170 days', NOW() - INTERVAL '2 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'james.wilson@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000001'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000002'::uuid, 'ZYD_1001002', true,
  NOW() - INTERVAL '160 days', NOW() - INTERVAL '1 day', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'sarah.thompson@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000002'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000003'::uuid, 'ZYD_1001003', true,
  NOW() - INTERVAL '150 days', NOW() - INTERVAL '5 days', 'V1.1', 'V2.3', 0, 98
FROM users u WHERE u.email = 'david.brown@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000003'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000004'::uuid, 'ZYD_1001004', true,
  NOW() - INTERVAL '140 days', NOW() - INTERVAL '3 days', 'V1.0', 'V2.2', 0, 100
FROM users u WHERE u.email = 'oliver.jones@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000004'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000005'::uuid, 'ZYD_1001005', true,
  NOW() - INTERVAL '130 days', NOW() - INTERVAL '30 days', 'V1.1', 'V2.3', 0, 95
FROM users u WHERE u.email = 'charlotte.taylor@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000005'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000006'::uuid, 'ZYD_1001006', true,
  NOW() - INTERVAL '120 days', NOW() - INTERVAL '60 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'lucy.white@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000006'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000007'::uuid, 'ZYD_1001007', true,
  NOW() - INTERVAL '110 days', NOW() - INTERVAL '7 days', 'V1.0', 'V2.1', 0, 100
FROM users u WHERE u.email = 'harry.clark@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000007'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000008'::uuid, 'ZYD_1001008', true,
  NOW() - INTERVAL '100 days', NOW() - INTERVAL '4 days', 'V1.1', 'V2.3', 0, 97
FROM users u WHERE u.email = 'amelia.roberts@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000008'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000010'::uuid, 'ZYD_1001010', true,
  NOW() - INTERVAL '80 days', NOW() - INTERVAL '10 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'thomas.hall@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000010'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000011'::uuid, 'ZYD_1001011', true,
  NOW() - INTERVAL '70 days', NOW() - INTERVAL '10 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'liam.murphy@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000011'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000012'::uuid, 'ZYD_1001012', true,
  NOW() - INTERVAL '190 days', NOW() - INTERVAL '90 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'ben.cooper@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000012'::uuid)

-- David Brown's second scooter (decommissioned old one)
UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000009'::uuid, 'ZYD_1001009', false,
  NOW() - INTERVAL '290 days', NOW() - INTERVAL '200 days', 'V1.0', 'V2.0', 0, 100
FROM users u WHERE u.email = 'david.brown@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000009'::uuid)

-- US customers → US scooters
UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000021'::uuid, 'ZYD_2001001', true,
  NOW() - INTERVAL '140 days', NOW() - INTERVAL '3 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'jennifer.davis@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000021'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000022'::uuid, 'ZYD_2001002', true,
  NOW() - INTERVAL '130 days', NOW() - INTERVAL '4 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'brandon.lee@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000022'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000023'::uuid, 'ZYD_2001003', true,
  NOW() - INTERVAL '120 days', NOW() - INTERVAL '2 days', 'V1.0', 'V2.2', 0, 98
FROM users u WHERE u.email = 'ashley.martinez@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000023'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000024'::uuid, 'ZYD_2001004', true,
  NOW() - INTERVAL '110 days', NOW() - INTERVAL '6 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'tyler.wilson@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000024'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000025'::uuid, 'ZYD_2001005', true,
  NOW() - INTERVAL '90 days', NOW() - INTERVAL '45 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'samantha.taylor@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000025'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000026'::uuid, 'ZYD_2001006', true,
  NOW() - INTERVAL '80 days', NOW() - INTERVAL '1 day', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'emily.anderson@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000026'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000027'::uuid, 'ZYD_2001007', true,
  NOW() - INTERVAL '70 days', NOW() - INTERVAL '8 days', 'V1.0', 'V2.1', 0, 100
FROM users u WHERE u.email = 'jason.patel@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000027'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000028'::uuid, 'ZYD_2001008', true,
  NOW() - INTERVAL '50 days', NOW() - INTERVAL '3 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'megan.campbell@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000028'::uuid)

-- DE/AT/CH customers → DE scooters
UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000031'::uuid, 'ZYD_3001001', true,
  NOW() - INTERVAL '150 days', NOW() - INTERVAL '3 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'hans.mueller@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000031'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000032'::uuid, 'ZYD_3001002', true,
  NOW() - INTERVAL '140 days', NOW() - INTERVAL '1 day', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'anna.schmidt@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000032'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000033'::uuid, 'ZYD_3001003', true,
  NOW() - INTERVAL '130 days', NOW() - INTERVAL '5 days', 'V1.0', 'V2.2', 0, 99
FROM users u WHERE u.email = 'lena.fischer@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000033'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000034'::uuid, 'ZYD_3001004', true,
  NOW() - INTERVAL '120 days', NOW() - INTERVAL '90 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'karl.wagner@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000034'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000035'::uuid, 'ZYD_3001005', true,
  NOW() - INTERVAL '110 days', NOW() - INTERVAL '8 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'julia.becker@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000035'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000036'::uuid, 'ZYD_3001006', true,
  NOW() - INTERVAL '100 days', NOW() - INTERVAL '30 days', 'V1.0', 'V2.3', 0, 96
FROM users u WHERE u.email = 'tobias.keller@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000036'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000037'::uuid, 'ZYD_3001007', true,
  NOW() - INTERVAL '90 days', NOW() - INTERVAL '1 day', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'katarina.novak@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000037'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000038'::uuid, 'ZYD_3001008', true,
  NOW() - INTERVAL '80 days', NOW() - INTERVAL '3 days', 'V1.1', 'V2.3', 0, 100
FROM users u WHERE u.email = 'sophie.meier@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000038'::uuid)

UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000040'::uuid, 'ZYD_3001010', true,
  NOW() - INTERVAL '60 days', NOW() - INTERVAL '7 days', 'V1.0', 'V2.3', 0, 100
FROM users u WHERE u.email = 'lukas.schwarz@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000040'::uuid)

-- Hans Mueller's second scooter (decommissioned old one)
UNION ALL
SELECT u.id, 'cc100000-0000-0000-0000-000000000039'::uuid, 'ZYD_3001009', false,
  NOW() - INTERVAL '270 days', NOW() - INTERVAL '180 days', 'V1.0', 'V2.0', 0, 100
FROM users u WHERE u.email = 'hans.mueller@example.com'
  AND NOT EXISTS (SELECT 1 FROM user_scooters us WHERE us.user_id = u.id AND us.scooter_id = 'cc100000-0000-0000-0000-000000000039'::uuid)
;


-- ============================================================================
-- STEP 8: Service Jobs (using email subqueries for user IDs)
-- ============================================================================

-- UK: Charlotte Taylor's scooter UK05 in service
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000001',
  'cc100000-0000-0000-0000-000000000005', 'ee100000-0000-0000-0000-000000000001',
  cust.id, tech.id,
  'in_progress', NOW() - INTERVAL '5 days', NOW() - INTERVAL '3 days', NULL,
  'Battery not holding charge — drains from 100% to 20% within 10km',
  'Inspected battery cells. Cell 3 showing low voltage. Ordering replacement pack.',
  false, NOW() - INTERVAL '5 days'
FROM users cust, users tech
WHERE cust.email = 'charlotte.taylor@example.com'
  AND tech.email = 'george.evans@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000001');

-- UK: Completed job on James Wilson's scooter UK01
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000002',
  'cc100000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
  cust.id, tech.id,
  'completed', NOW() - INTERVAL '30 days', NOW() - INTERVAL '28 days', NOW() - INTERVAL '26 days',
  'Front brake squealing and reduced stopping power',
  'Replaced front brake pads. Adjusted cable tension. Test ride OK.',
  false, NOW() - INTERVAL '30 days'
FROM users cust, users tech
WHERE cust.email = 'james.wilson@example.com'
  AND tech.email = 'peter.reynolds@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000002');

-- US: Samantha Taylor's scooter US05 awaiting parts
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000003',
  'cc100000-0000-0000-0000-000000000025', 'ee100000-0000-0000-0000-000000000002',
  cust.id, tech.id,
  'awaiting_parts', NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days', NULL,
  'Controller error code E04 — motor stuttering at low speed',
  'Diagnosed faulty motor controller. Part on order from factory — ETA 5 business days.',
  false, NOW() - INTERVAL '10 days'
FROM users cust, users tech
WHERE cust.email = 'samantha.taylor@example.com'
  AND tech.email = 'carlos.mendez@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000003');

-- US: Jennifer Davis's scooter US01 — completed annual service
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000004',
  'cc100000-0000-0000-0000-000000000021', 'ee100000-0000-0000-0000-000000000002',
  cust.id, tech.id,
  'completed', NOW() - INTERVAL '45 days', NOW() - INTERVAL '44 days', NOW() - INTERVAL '43 days',
  'Annual service and firmware update',
  'Routine check completed. All components within spec. Updated firmware V2.2 → V2.3.',
  true, NOW() - INTERVAL '45 days'
FROM users cust, users tech
WHERE cust.email = 'jennifer.davis@example.com'
  AND tech.email = 'carlos.mendez@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000004');

-- DE: Tobias Keller's scooter DE06 — ready for collection
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000005',
  'cc100000-0000-0000-0000-000000000036', 'ee100000-0000-0000-0000-000000000003',
  cust.id, tech.id,
  'ready_for_collection', NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days', NULL,
  'Rear tyre puncture and wheel alignment check',
  'Replaced inner tube. Wheel trued and aligned. Ready for collection.',
  false, NOW() - INTERVAL '7 days'
FROM users cust, users tech
WHERE cust.email = 'tobias.keller@example.com'
  AND tech.email = 'stefan.braun@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000005');

-- DE: Anna Schmidt's scooter DE02 — booked for future
INSERT INTO service_jobs (id, scooter_id, workshop_id, customer_id, technician_id,
    status, booked_date, started_date, completed_date,
    issue_description, technician_notes, firmware_updated, created_at)
SELECT
  'bb100000-0000-0000-0000-000000000006',
  'cc100000-0000-0000-0000-000000000032', 'ee100000-0000-0000-0000-000000000003',
  cust.id, NULL,
  'booked', NOW() + INTERVAL '3 days', NULL, NULL,
  'Firmware update and general inspection requested',
  NULL, false, NOW()
FROM users cust
WHERE cust.email = 'anna.schmidt@example.com'
  AND NOT EXISTS (SELECT 1 FROM service_jobs WHERE id = 'bb100000-0000-0000-0000-000000000006');


-- ============================================================================
-- STEP 9: Firmware Versions
-- ============================================================================

INSERT INTO firmware_versions (id, version_label, file_path, file_size_bytes, target_hw_version, min_sw_version, release_notes, access_level, is_active, created_at)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'V2.0', 'controller_v2_0.bin', 524288, 'V1.0', NULL,
   'Initial production firmware. Basic motor control and battery management.', 'distributor', false,
   NOW() - INTERVAL '365 days'),
  ('f1000000-0000-0000-0000-000000000002', 'V2.1', 'controller_v2_1.bin', 548864, 'V1.0', 'V2.0',
   'Bug fixes for battery SOC calculation. Improved regenerative braking.', 'distributor', false,
   NOW() - INTERVAL '250 days'),
  ('f1000000-0000-0000-0000-000000000003', 'V2.2', 'controller_v2_2.bin', 573440, 'V1.0', 'V2.0',
   'Added error code reporting. Speed limiter compliance for EU regulations.', 'distributor', true,
   NOW() - INTERVAL '150 days'),
  ('f1000000-0000-0000-0000-000000000004', 'V2.3', 'controller_v2_3.bin', 598016, 'V1.0', 'V2.1',
   'Latest stable release. Enhanced battery health monitoring. Bluetooth connectivity improvements.', 'distributor', true,
   NOW() - INTERVAL '60 days'),
  ('f1000000-0000-0000-0000-000000000005', 'V2.3-Sport', 'controller_v2_3_sport.bin', 610304, 'V1.1', 'V2.1',
   'Sport model variant of V2.3. Tuned motor profiles for V1.1 hardware.', 'distributor', true,
   NOW() - INTERVAL '55 days')
ON CONFLICT DO NOTHING;

INSERT INTO firmware_hw_targets (firmware_version_id, hw_version)
VALUES
  ('f1000000-0000-0000-0000-000000000001', 'V1.0'),
  ('f1000000-0000-0000-0000-000000000002', 'V1.0'),
  ('f1000000-0000-0000-0000-000000000003', 'V1.0'),
  ('f1000000-0000-0000-0000-000000000004', 'V1.0'),
  ('f1000000-0000-0000-0000-000000000005', 'V1.1')
ON CONFLICT DO NOTHING;


-- ============================================================================
-- STEP 10: Activity Events (using email subqueries)
-- ============================================================================

-- Recent logins
INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'user_login', NULL, u.id, 'GB', 'd1000000-0000-0000-0000-000000000001',
  '{"device": "Chrome/Mac"}'::JSONB, NOW() - INTERVAL '1 hour'
FROM users u WHERE u.email = 'catherine.ives@pureelectric.example.com'
  AND NOT EXISTS (SELECT 1 FROM activity_events ae WHERE ae.user_id = u.id AND ae.event_type = 'user_login' AND ae.timestamp > NOW() - INTERVAL '2 hours');

INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'user_login', NULL, u.id, 'GB', 'd1000000-0000-0000-0000-000000000001',
  '{"device": "Gen3 App/iOS"}'::JSONB, NOW() - INTERVAL '2 days'
FROM users u WHERE u.email = 'james.wilson@example.com';

INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'user_login', NULL, u.id, 'US', 'd1000000-0000-0000-0000-000000000002',
  '{"device": "Gen3 App/Android"}'::JSONB, NOW() - INTERVAL '3 days'
FROM users u WHERE u.email = 'jennifer.davis@example.com';

-- Scooter registrations
INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'scooter_registered', 'cc100000-0000-0000-0000-000000000028', u.id, 'US', 'd1000000-0000-0000-0000-000000000002',
  '{"serial": "ZYD_2001008", "model": "Gen3 Sport"}'::JSONB, NOW() - INTERVAL '50 days'
FROM users u WHERE u.email = 'megan.campbell@example.com';

INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'scooter_registered', 'cc100000-0000-0000-0000-000000000040', u.id, 'DE', 'd1000000-0000-0000-0000-000000000003',
  '{"serial": "ZYD_3001010", "model": "Gen3 Pro"}'::JSONB, NOW() - INTERVAL '60 days'
FROM users u WHERE u.email = 'lukas.schwarz@example.com';

-- Bluetooth connections
INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'bluetooth_connected', 'cc100000-0000-0000-0000-000000000001', u.id, 'GB', 'd1000000-0000-0000-0000-000000000001',
  '{"rssi": -45, "connection_time_ms": 1200}'::JSONB, NOW() - INTERVAL '2 days'
FROM users u WHERE u.email = 'james.wilson@example.com';

INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, payload, timestamp)
SELECT 'bluetooth_connected', 'cc100000-0000-0000-0000-000000000031', u.id, 'DE', 'd1000000-0000-0000-0000-000000000003',
  '{"rssi": -52, "connection_time_ms": 1500}'::JSONB, NOW() - INTERVAL '3 days'
FROM users u WHERE u.email = 'hans.mueller@example.com';

-- Service job events
INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, workshop_id, payload, timestamp)
SELECT 'service_job_booked', 'cc100000-0000-0000-0000-000000000005', u.id, 'GB',
  'd1000000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
  '{"issue": "Battery not holding charge"}'::JSONB, NOW() - INTERVAL '5 days'
FROM users u WHERE u.email = 'charlotte.taylor@example.com';

INSERT INTO activity_events (event_type, scooter_id, user_id, country, distributor_id, workshop_id, payload, timestamp)
SELECT 'service_job_started', 'cc100000-0000-0000-0000-000000000005', u.id, 'GB',
  'd1000000-0000-0000-0000-000000000001', 'ee100000-0000-0000-0000-000000000001',
  '{"technician": "George Evans"}'::JSONB, NOW() - INTERVAL '3 days'
FROM users u WHERE u.email = 'george.evans@example.com';


-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Distributors:  3  (Pure Electric UK, EcoRide America, VoltWerk Deutschland)
-- Workshops:     3  (London, Austin, Berlin — one per distributor)
-- Addresses:     6  (3 distributor + 3 workshop)
-- Scooters:     30  (12 UK, 8 US, 10 DE)
-- Users:        ~73 total in database (50 from old seed + ~23 new)
--   Existing users UPDATED: emma.davies, sophie.walker, george.evans, max.weber,
--     stefan.braun, mike.johnson → linked to distributors/workshops
--   New users INSERTED: catherine.ives (admin), rachel.chen (admin), peter.reynolds,
--     carlos.mendez, nina.richter, lisa.zimmermann (staff), plus US/DE customers
-- User-Scooter:  32 links
-- Service Jobs:   6
-- Firmware:       5 versions
-- Events:        ~10 sample events
--
-- All passwords: password123
-- ============================================================================
