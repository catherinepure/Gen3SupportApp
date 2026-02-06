-- Step 1: View all distributors to find the correct one
SELECT id, name, code, is_active
FROM distributors
ORDER BY name;

-- Step 2: Check current scooter assignment
SELECT
    s.id,
    s.zyd_serial,
    s.model,
    s.hw_version,
    s.distributor_id,
    d.name as current_distributor_name
FROM scooters s
LEFT JOIN distributors d ON s.distributor_id = d.id
WHERE s.id = '0e644ee4-3c35-43b7-8f3e-af5f9a6b33f2';

-- Step 3: Update the scooter to the correct distributor
-- Replace 'CORRECT_DISTRIBUTOR_ID_HERE' with the actual distributor ID from Step 1
-- UPDATE scooters
-- SET distributor_id = 'CORRECT_DISTRIBUTOR_ID_HERE'
-- WHERE id = '0e644ee4-3c35-43b7-8f3e-af5f9a6b33f2';

-- Step 4: Verify the update
-- SELECT
--     s.zyd_serial,
--     d.name as distributor_name
-- FROM scooters s
-- LEFT JOIN distributors d ON s.distributor_id = d.id
-- WHERE s.id = '0e644ee4-3c35-43b7-8f3e-af5f9a6b33f2';
