-- ============================================================================
-- Scooter PIN Management - Simplified for Dashboard Deployment
-- Copy and paste this ENTIRE file into Supabase SQL Editor and click Run
-- ============================================================================

-- Step 1: Enable pgcrypto extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Step 2: Add PIN columns to scooters table
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS pin_encrypted TEXT;
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;
ALTER TABLE scooters ADD COLUMN IF NOT EXISTS pin_set_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Step 3: Add index
CREATE INDEX IF NOT EXISTS idx_scooters_pin_set_at ON scooters(pin_set_at) WHERE pin_encrypted IS NOT NULL;

-- Step 4: Create set_scooter_pin function
CREATE OR REPLACE FUNCTION set_scooter_pin(
  p_scooter_id UUID,
  p_pin TEXT,
  p_user_id UUID,
  p_encryption_key TEXT
) RETURNS VOID AS $$
BEGIN
  IF p_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;
  UPDATE scooters SET
    pin_encrypted = encode(pgp_sym_encrypt(p_pin, p_encryption_key), 'base64'),
    pin_set_at = now(),
    pin_set_by_user_id = p_user_id,
    updated_at = now()
  WHERE id = p_scooter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scooter not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 5: Create get_scooter_pin function
CREATE OR REPLACE FUNCTION get_scooter_pin(
  p_scooter_id UUID,
  p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
  encrypted_pin TEXT;
  decrypted_pin TEXT;
BEGIN
  SELECT pin_encrypted INTO encrypted_pin FROM scooters WHERE id = p_scooter_id;
  IF encrypted_pin IS NULL THEN
    RETURN NULL;
  END IF;
  decrypted_pin := pgp_sym_decrypt(decode(encrypted_pin, 'base64'), p_encryption_key);
  RETURN decrypted_pin;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt PIN: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 6: Create clear_scooter_pin function
CREATE OR REPLACE FUNCTION clear_scooter_pin(
  p_scooter_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE scooters SET
    pin_encrypted = NULL,
    pin_set_at = NULL,
    pin_set_by_user_id = NULL,
    updated_at = now()
  WHERE id = p_scooter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scooter not found';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create admin view
CREATE OR REPLACE VIEW scooter_pin_status AS
SELECT
  id,
  zyd_serial,
  distributor_id,
  CASE
    WHEN pin_encrypted IS NOT NULL THEN 'set'
    ELSE 'not_set'
  END AS pin_status,
  pin_set_at,
  pin_set_by_user_id
FROM scooters;

-- Step 8: Grant permissions
GRANT SELECT ON scooter_pin_status TO authenticated;

-- ============================================================================
-- Verification - Check results
-- ============================================================================

-- Should return 3 rows
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'scooters' AND column_name IN ('pin_encrypted', 'pin_set_at', 'pin_set_by_user_id');

-- Should return 3 rows
SELECT routine_name FROM information_schema.routines
WHERE routine_name IN ('set_scooter_pin', 'get_scooter_pin', 'clear_scooter_pin');

-- Should return 1 row
SELECT table_name FROM information_schema.tables WHERE table_name = 'scooter_pin_status';

-- Should return 1 row
SELECT indexname FROM pg_indexes WHERE tablename = 'scooters' AND indexname = 'idx_scooters_pin_set_at';

-- ============================================================================
-- SUCCESS! All components deployed.
-- Next: Run ./test_pin_system.sh to verify end-to-end functionality
-- ============================================================================
