-- ============================================================================
-- SUPERSEDED — Use seed_test_data.sql instead
-- That file includes distributors, workshops, scooters, user-scooter links,
-- service jobs, firmware, and activity events in addition to users.
-- ============================================================================
-- Seed Data: 50 Test Users (users only — no relationships)
-- Run this in the Supabase SQL Editor
-- Password for all test users: password123
-- SHA-256 hash: ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
-- ============================================================================

-- Note: distributor_id and workshop_id are left NULL for most users.
-- Set them manually if needed after checking your actual distributor/workshop UUIDs.

INSERT INTO users (
    email, password_hash, first_name, last_name,
    user_level, roles, home_country, current_country,
    is_verified, is_active, gender, date_of_birth,
    created_at, last_login
) VALUES
-- UK Users (15)
('james.wilson@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'James', 'Wilson', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', '1985-03-15', NOW() - INTERVAL '180 days', NOW() - INTERVAL '2 days'),
('sarah.thompson@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Sarah', 'Thompson', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Female', '1992-07-22', NOW() - INTERVAL '150 days', NOW() - INTERVAL '1 day'),
('david.brown@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'David', 'Brown', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', '1978-11-08', NOW() - INTERVAL '120 days', NOW() - INTERVAL '5 days'),
('emma.davies@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Emma', 'Davies', 'distributor', ARRAY['distributor_staff']::TEXT[], 'GB', 'GB', true, true, 'Female', '1988-01-30', NOW() - INTERVAL '200 days', NOW() - INTERVAL '1 day'),
('oliver.jones@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Oliver', 'Jones', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', '1995-06-12', NOW() - INTERVAL '90 days', NOW() - INTERVAL '3 days'),
('charlotte.taylor@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Charlotte', 'Taylor', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', false, true, 'Female', '2000-09-05', NOW() - INTERVAL '30 days', NULL),
('george.evans@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'George', 'Evans', 'maintenance', ARRAY['workshop_staff']::TEXT[], 'GB', 'GB', true, true, 'Male', '1982-04-18', NOW() - INTERVAL '250 days', NOW() - INTERVAL '1 day'),
('lucy.white@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Lucy', 'White', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, false, 'Female', '1990-12-01', NOW() - INTERVAL '300 days', NOW() - INTERVAL '60 days'),
('harry.clark@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Harry', 'Clark', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', '1997-08-25', NOW() - INTERVAL '45 days', NOW() - INTERVAL '7 days'),
('amelia.roberts@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Amelia', 'Roberts', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Female', '1993-02-14', NOW() - INTERVAL '100 days', NOW() - INTERVAL '4 days'),
('thomas.hall@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Thomas', 'Hall', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', NULL, NOW() - INTERVAL '75 days', NOW() - INTERVAL '10 days'),
('sophie.walker@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Sophie', 'Walker', 'distributor', ARRAY['distributor_staff']::TEXT[], 'GB', 'GB', true, true, 'Female', '1986-10-20', NOW() - INTERVAL '160 days', NOW() - INTERVAL '2 days'),
('jack.wright@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Jack', 'Wright', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', false, true, 'Male', '1999-05-07', NOW() - INTERVAL '15 days', NULL),
('isabella.green@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Isabella', 'Green', 'user', ARRAY['customer']::TEXT[], 'GB', 'FR', true, true, 'Female', '1991-03-28', NOW() - INTERVAL '130 days', NOW() - INTERVAL '6 days'),
('william.harris@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'William', 'Harris', 'user', ARRAY['customer']::TEXT[], 'GB', 'GB', true, true, 'Male', '1975-07-11', NOW() - INTERVAL '220 days', NOW() - INTERVAL '14 days'),

-- German Users (8)
('hans.mueller@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Hans', 'Mueller', 'user', ARRAY['customer']::TEXT[], 'DE', 'DE', true, true, 'Male', '1987-09-14', NOW() - INTERVAL '140 days', NOW() - INTERVAL '3 days'),
('anna.schmidt@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Anna', 'Schmidt', 'user', ARRAY['customer']::TEXT[], 'DE', 'DE', true, true, 'Female', '1994-04-02', NOW() - INTERVAL '110 days', NOW() - INTERVAL '1 day'),
('max.weber@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Max', 'Weber', 'distributor', ARRAY['distributor_staff']::TEXT[], 'DE', 'DE', true, true, 'Male', '1980-12-25', NOW() - INTERVAL '190 days', NOW() - INTERVAL '2 days'),
('lena.fischer@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Lena', 'Fischer', 'user', ARRAY['customer']::TEXT[], 'DE', 'DE', true, true, 'Female', '1996-08-19', NOW() - INTERVAL '80 days', NOW() - INTERVAL '5 days'),
('karl.wagner@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Karl', 'Wagner', 'user', ARRAY['customer']::TEXT[], 'DE', 'DE', true, false, 'Male', '1973-06-30', NOW() - INTERVAL '280 days', NOW() - INTERVAL '90 days'),
('julia.becker@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Julia', 'Becker', 'user', ARRAY['customer']::TEXT[], 'DE', 'AT', true, true, 'Female', '1989-11-15', NOW() - INTERVAL '60 days', NOW() - INTERVAL '8 days'),
('stefan.braun@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Stefan', 'Braun', 'maintenance', ARRAY['workshop_staff']::TEXT[], 'DE', 'DE', true, true, 'Male', '1984-02-28', NOW() - INTERVAL '170 days', NOW() - INTERVAL '1 day'),
('marie.hoffmann@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Marie', 'Hoffmann', 'user', ARRAY['customer']::TEXT[], 'DE', 'DE', false, true, 'Female', '2001-01-10', NOW() - INTERVAL '20 days', NULL),

-- French Users (6)
('pierre.dubois@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Pierre', 'Dubois', 'user', ARRAY['customer']::TEXT[], 'FR', 'FR', true, true, 'Male', '1983-05-22', NOW() - INTERVAL '200 days', NOW() - INTERVAL '4 days'),
('claire.martin@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Claire', 'Martin', 'user', ARRAY['customer']::TEXT[], 'FR', 'FR', true, true, 'Female', '1991-10-08', NOW() - INTERVAL '125 days', NOW() - INTERVAL '2 days'),
('jean.petit@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Jean', 'Petit', 'distributor', ARRAY['distributor_staff']::TEXT[], 'FR', 'FR', true, true, 'Male', '1979-07-17', NOW() - INTERVAL '240 days', NOW() - INTERVAL '1 day'),
('sophie.bernard@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Sophie', 'Bernard', 'user', ARRAY['customer']::TEXT[], 'FR', 'FR', true, true, 'Female', '1998-03-04', NOW() - INTERVAL '55 days', NOW() - INTERVAL '9 days'),
('marc.durand@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Marc', 'Durand', 'user', ARRAY['customer']::TEXT[], 'FR', 'BE', true, false, 'Male', '1986-12-12', NOW() - INTERVAL '310 days', NOW() - INTERVAL '100 days'),
('amelie.moreau@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Amelie', 'Moreau', 'user', ARRAY['customer']::TEXT[], 'FR', 'FR', true, true, 'Female', '1993-08-26', NOW() - INTERVAL '95 days', NOW() - INTERVAL '3 days'),

-- Italian Users (4)
('marco.rossi@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Marco', 'Rossi', 'user', ARRAY['customer']::TEXT[], 'IT', 'IT', true, true, 'Male', '1988-06-09', NOW() - INTERVAL '165 days', NOW() - INTERVAL '6 days'),
('giulia.romano@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Giulia', 'Romano', 'user', ARRAY['customer']::TEXT[], 'IT', 'IT', true, true, 'Female', '1995-01-20', NOW() - INTERVAL '85 days', NOW() - INTERVAL '2 days'),
('luca.ferrari@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Luca', 'Ferrari', 'maintenance', ARRAY['workshop_staff']::TEXT[], 'IT', 'IT', true, true, 'Male', '1981-09-03', NOW() - INTERVAL '210 days', NOW() - INTERVAL '1 day'),
('elena.colombo@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Elena', 'Colombo', 'user', ARRAY['customer']::TEXT[], 'IT', 'IT', false, true, 'Female', '2002-04-15', NOW() - INTERVAL '10 days', NULL),

-- Spanish Users (4)
('carlos.garcia@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Carlos', 'Garcia', 'user', ARRAY['customer']::TEXT[], 'ES', 'ES', true, true, 'Male', '1990-02-28', NOW() - INTERVAL '135 days', NOW() - INTERVAL '4 days'),
('maria.lopez@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Maria', 'Lopez', 'user', ARRAY['customer']::TEXT[], 'ES', 'ES', true, true, 'Female', '1987-11-11', NOW() - INTERVAL '175 days', NOW() - INTERVAL '7 days'),
('alejandro.martinez@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Alejandro', 'Martinez', 'distributor', ARRAY['distributor_staff']::TEXT[], 'ES', 'ES', true, true, 'Male', '1976-08-05', NOW() - INTERVAL '260 days', NOW() - INTERVAL '2 days'),
('lucia.sanchez@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Lucia', 'Sanchez', 'user', ARRAY['customer']::TEXT[], 'ES', 'PT', true, true, 'Female', '1994-06-18', NOW() - INTERVAL '70 days', NOW() - INTERVAL '5 days'),

-- Netherlands Users (3)
('jan.devries@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Jan', 'de Vries', 'user', ARRAY['customer']::TEXT[], 'NL', 'NL', true, true, 'Male', '1992-04-10', NOW() - INTERVAL '105 days', NOW() - INTERVAL '3 days'),
('anouk.bakker@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Anouk', 'Bakker', 'user', ARRAY['customer']::TEXT[], 'NL', 'NL', true, true, 'Female', '1996-12-07', NOW() - INTERVAL '65 days', NOW() - INTERVAL '1 day'),
('pieter.dejong@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Pieter', 'de Jong', 'distributor', ARRAY['distributor_staff']::TEXT[], 'NL', 'NL', true, true, 'Male', '1977-03-22', NOW() - INTERVAL '230 days', NOW() - INTERVAL '2 days'),

-- Scandinavian Users (4)
('erik.johansson@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Erik', 'Johansson', 'user', ARRAY['customer']::TEXT[], 'SE', 'SE', true, true, 'Male', '1989-07-30', NOW() - INTERVAL '145 days', NOW() - INTERVAL '8 days'),
('ingrid.larsen@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Ingrid', 'Larsen', 'user', ARRAY['customer']::TEXT[], 'NO', 'NO', true, true, 'Female', '1993-10-14', NOW() - INTERVAL '115 days', NOW() - INTERVAL '4 days'),
('anders.nielsen@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Anders', 'Nielsen', 'user', ARRAY['customer']::TEXT[], 'DK', 'DK', true, false, 'Male', '1985-01-25', NOW() - INTERVAL '290 days', NOW() - INTERVAL '75 days'),
('freya.olsen@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Freya', 'Olsen', 'user', ARRAY['customer']::TEXT[], 'NO', 'SE', true, true, 'Female', '1998-05-19', NOW() - INTERVAL '40 days', NOW() - INTERVAL '2 days'),

-- Other European Users (4)
('pawel.kowalski@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Pawel', 'Kowalski', 'user', ARRAY['customer']::TEXT[], 'PL', 'PL', true, true, 'Male', '1991-08-12', NOW() - INTERVAL '155 days', NOW() - INTERVAL '6 days'),
('katarina.novak@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Katarina', 'Novak', 'user', ARRAY['customer']::TEXT[], 'AT', 'AT', true, true, 'Female', '1994-02-03', NOW() - INTERVAL '50 days', NOW() - INTERVAL '1 day'),
('rui.santos@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Rui', 'Santos', 'maintenance', ARRAY['workshop_staff']::TEXT[], 'PT', 'PT', true, true, 'Male', '1983-11-28', NOW() - INTERVAL '185 days', NOW() - INTERVAL '3 days'),
('liam.murphy@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Liam', 'Murphy', 'user', ARRAY['customer']::TEXT[], 'IE', 'IE', true, true, 'Male', '1990-09-16', NOW() - INTERVAL '130 days', NOW() - INTERVAL '10 days'),

-- US Users (2)
('mike.johnson@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Mike', 'Johnson', 'user', ARRAY['customer']::TEXT[], 'US', 'US', true, true, 'Male', '1986-04-07', NOW() - INTERVAL '95 days', NOW() - INTERVAL '12 days'),
('jennifer.davis@example.com', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Jennifer', 'Davis', 'user', ARRAY['customer']::TEXT[], 'US', 'GB', true, true, 'Female', '1992-12-30', NOW() - INTERVAL '75 days', NOW() - INTERVAL '5 days');

-- Summary:
-- 50 users total
-- Countries: GB(15), DE(8), FR(6), IT(4), ES(4), NL(3), SE(1), NO(2), DK(1), PL(1), AT(1), PT(1), IE(1), US(2)
-- User levels: user(37), distributor(7), maintenance(5), admin(0)
-- Roles: customer(37), distributor_staff(7), workshop_staff(5), manufacturer_admin(0)
-- Active: 45 active, 5 inactive (lucy.white, karl.wagner, marc.durand, anders.nielsen + existing)
-- Verified: 44 verified, 6 unverified (charlotte.taylor, jack.wright, marie.hoffmann, elena.colombo + existing)
-- Gender: ~50/50 male/female mix
-- Passwords: all 'password123'
