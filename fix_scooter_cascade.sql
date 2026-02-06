-- Fix foreign key constraint to allow cascade delete of scooters
-- This allows deleting scooters that have firmware upload history

-- Drop the existing constraint
ALTER TABLE firmware_uploads
DROP CONSTRAINT IF EXISTS firmware_uploads_scooter_id_fkey;

-- Add it back with CASCADE delete
ALTER TABLE firmware_uploads
ADD CONSTRAINT firmware_uploads_scooter_id_fkey
FOREIGN KEY (scooter_id)
REFERENCES scooters(id)
ON DELETE CASCADE;

-- Verify the constraint was added
SELECT
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'firmware_uploads'
  AND kcu.column_name = 'scooter_id';
