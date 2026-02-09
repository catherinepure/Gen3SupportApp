-- ============================================================================
-- Territory Scoping Test Users
-- Run this AFTER seed_test_data.sql to add test users for each admin role
--
-- Creates test users for territory scoping verification:
--   1 Manufacturer Admin (global access)
--   2 Distributor Staff (UK and US territories)
--   2 Workshop Staff (one linked, one independent)
--
-- Password for all: password123
-- SHA-256 hash: ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
--
-- ASSUMES: seed_test_data.sql has been run (distributors and workshops exist)
-- ============================================================================

-- ============================================================================
-- 1. Manufacturer Admin (Global Access)
-- ============================================================================

INSERT INTO users (
    id, email, password_hash, first_name, last_name,
    user_level, roles,
    home_country, current_country,
    is_verified, is_active,
    created_at, last_login
) VALUES
(
    '11111111-1111-1111-1111-111111111111',
    'admin@pure.com',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Admin',
    'Pure',
    'admin',
    ARRAY['manufacturer_admin']::TEXT[],
    'GB',
    'GB',
    true,
    true,
    NOW() - INTERVAL '500 days',
    NOW() - INTERVAL '1 hour'
)
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['manufacturer_admin']::TEXT[],
    user_level = 'admin',
    is_active = true,
    is_verified = true;

-- ============================================================================
-- 2. Distributor Staff - UK/IE Territory
-- ============================================================================

INSERT INTO users (
    id, email, password_hash, first_name, last_name,
    user_level, roles,
    distributor_id,
    home_country, current_country,
    is_verified, is_active,
    created_at, last_login
) VALUES
(
    '22222222-2222-2222-2222-222222222222',
    'dist-uk@pure.com',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Emma',
    'Davies',
    'distributor',
    ARRAY['distributor_staff']::TEXT[],
    'd1000000-0000-0000-0000-000000000001',  -- Pure Electric UK (GB, IE)
    'GB',
    'GB',
    true,
    true,
    NOW() - INTERVAL '400 days',
    NOW() - INTERVAL '2 hours'
)
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['distributor_staff']::TEXT[],
    user_level = 'distributor',
    distributor_id = 'd1000000-0000-0000-0000-000000000001',
    is_active = true,
    is_verified = true;

-- ============================================================================
-- 3. Distributor Staff - US Territory
-- ============================================================================

INSERT INTO users (
    id, email, password_hash, first_name, last_name,
    user_level, roles,
    distributor_id,
    home_country, current_country,
    is_verified, is_active,
    created_at, last_login
) VALUES
(
    '33333333-3333-3333-3333-333333333333',
    'dist-us@pure.com',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Sarah',
    'Johnson',
    'distributor',
    ARRAY['distributor_staff']::TEXT[],
    'd1000000-0000-0000-0000-000000000002',  -- EcoRide America (US)
    'US',
    'US',
    true,
    true,
    NOW() - INTERVAL '350 days',
    NOW() - INTERVAL '3 hours'
)
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['distributor_staff']::TEXT[],
    user_level = 'distributor',
    distributor_id = 'd1000000-0000-0000-0000-000000000002',
    is_active = true,
    is_verified = true;

-- ============================================================================
-- 4. Workshop Staff - Linked to UK Distributor
-- ============================================================================

INSERT INTO users (
    id, email, password_hash, first_name, last_name,
    user_level, roles,
    workshop_id,
    home_country, current_country,
    is_verified, is_active,
    created_at, last_login
) VALUES
(
    '44444444-4444-4444-4444-444444444444',
    'workshop-london@pure.com',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'George',
    'Evans',
    'maintenance',
    ARRAY['workshop_staff']::TEXT[],
    'ee100000-0000-0000-0000-000000000001',  -- London workshop (linked to UK distributor)
    'GB',
    'GB',
    true,
    true,
    NOW() - INTERVAL '300 days',
    NOW() - INTERVAL '4 hours'
)
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['workshop_staff']::TEXT[],
    user_level = 'maintenance',
    workshop_id = 'ee100000-0000-0000-0000-000000000001',
    is_active = true,
    is_verified = true;

-- ============================================================================
-- 5. Workshop Staff - Independent Workshop (US)
-- ============================================================================

-- First create the independent workshop
INSERT INTO workshops (id, name, phone, email, parent_distributor_id, service_area_countries, is_active, created_at)
VALUES
(
    'ee100000-0000-0000-0000-000000000099',
    'Independent Scooter Shop NYC',
    '+1 555-0299',
    'shop@indyscooter-nyc.example.com',
    NULL,  -- Independent (no parent distributor)
    ARRAY['US']::TEXT[],
    true,
    NOW() - INTERVAL '200 days'
)
ON CONFLICT DO NOTHING;

-- Now create the workshop staff user
INSERT INTO users (
    id, email, password_hash, first_name, last_name,
    user_level, roles,
    workshop_id,
    home_country, current_country,
    is_verified, is_active,
    created_at, last_login
) VALUES
(
    '55555555-5555-5555-5555-555555555555',
    'workshop-indie@pure.com',
    'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
    'Mike',
    'Rodriguez',
    'maintenance',
    ARRAY['workshop_staff']::TEXT[],
    'ee100000-0000-0000-0000-000000000099',  -- Independent NYC workshop
    'US',
    'US',
    true,
    true,
    NOW() - INTERVAL '250 days',
    NOW() - INTERVAL '5 hours'
)
ON CONFLICT (email) DO UPDATE SET
    roles = ARRAY['workshop_staff']::TEXT[],
    user_level = 'maintenance',
    workshop_id = 'ee100000-0000-0000-0000-000000000099',
    is_active = true,
    is_verified = true;

-- ============================================================================
-- Summary
-- ============================================================================
--
-- Test Users Created:
--   admin@pure.com - Manufacturer Admin (global access to ALL data)
--   dist-uk@pure.com - Distributor Staff for UK/IE territory
--   dist-us@pure.com - Distributor Staff for US territory
--   workshop-london@pure.com - Workshop Staff (linked to UK distributor)
--   workshop-indie@pure.com - Workshop Staff (independent, US only)
--
-- Territory Mappings:
--   - UK Distributor (d1...001): countries=['GB', 'IE']
--   - US Distributor (d1...002): countries=['US']
--   - DE Distributor (d1...003): countries=['DE', 'AT', 'CH']
--   - London Workshop (ee1...001): linked to UK distributor
--   - Independent NYC Workshop (ee1...099): service_area_countries=['US']
--
-- Password for all: password123
-- ============================================================================
