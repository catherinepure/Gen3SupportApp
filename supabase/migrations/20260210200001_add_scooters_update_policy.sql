-- Add RLS UPDATE policy on scooters table for anon role.
-- The mobile app needs to PATCH scooter records to update firmware version info
-- on each BLE connection. Without this, the PATCH silently affects 0 rows.

DO $$ BEGIN
  CREATE POLICY "anon_update_scooters"
    ON scooters FOR UPDATE TO anon USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
