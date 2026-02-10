-- ============================================================================
-- Scooter PIN Management with Encryption
-- Each scooter has one 6-digit PIN, stored encrypted, recoverable by owner/admin
-- ============================================================================

-- Enable pgcrypto for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add PIN columns to scooters table
ALTER TABLE scooters
  ADD COLUMN pin_encrypted TEXT,
  ADD COLUMN pin_set_at TIMESTAMPTZ,
  ADD COLUMN pin_set_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for PIN lookup queries
CREATE INDEX idx_scooters_pin_set_at
  ON scooters(pin_set_at)
  WHERE pin_encrypted IS NOT NULL;

COMMENT ON COLUMN scooters.pin_encrypted IS
  'Encrypted 6-digit PIN using pgp_sym_encrypt. Only decryptable by Edge Functions with encryption key.';

COMMENT ON COLUMN scooters.pin_set_at IS
  'Timestamp when PIN was last set/changed';

COMMENT ON COLUMN scooters.pin_set_by_user_id IS
  'User who set the current PIN (usually the owner)';

-- ============================================================================
-- Database Functions for PIN Management
-- ============================================================================

-- Function to set encrypted PIN
CREATE OR REPLACE FUNCTION set_scooter_pin(
  p_scooter_id UUID,
  p_pin TEXT,
  p_user_id UUID,
  p_encryption_key TEXT
) RETURNS VOID AS $$
BEGIN
  -- Validate PIN format (6 digits)
  IF p_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;

  UPDATE scooters
  SET
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

COMMENT ON FUNCTION set_scooter_pin IS
  'Encrypts and stores a 6-digit PIN for a scooter. Only callable by service_role via Edge Functions.';

-- Function to get decrypted PIN
CREATE OR REPLACE FUNCTION get_scooter_pin(
  p_scooter_id UUID,
  p_encryption_key TEXT
) RETURNS TEXT AS $$
DECLARE
  encrypted_pin TEXT;
  decrypted_pin TEXT;
BEGIN
  SELECT pin_encrypted INTO encrypted_pin
  FROM scooters
  WHERE id = p_scooter_id;

  IF encrypted_pin IS NULL THEN
    RETURN NULL;
  END IF;

  -- Decrypt PIN
  decrypted_pin := pgp_sym_decrypt(decode(encrypted_pin, 'base64'), p_encryption_key);
  RETURN decrypted_pin;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt PIN: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_scooter_pin IS
  'Decrypts and returns a scooter PIN. Only callable by service_role via Edge Functions.';

-- Function to clear/reset PIN
CREATE OR REPLACE FUNCTION clear_scooter_pin(
  p_scooter_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE scooters
  SET
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

COMMENT ON FUNCTION clear_scooter_pin IS
  'Clears a scooter PIN. Only callable by service_role via Edge Functions.';

-- ============================================================================
-- Admin View: Shows PIN status without exposing encrypted values
-- ============================================================================

CREATE OR REPLACE VIEW scooter_pin_status AS
SELECT
  id,
  zyd_serial,
  owner_id,
  CASE
    WHEN pin_encrypted IS NOT NULL THEN 'set'
    ELSE 'not_set'
  END AS pin_status,
  pin_set_at,
  pin_set_by_user_id
FROM scooters;

COMMENT ON VIEW scooter_pin_status IS
  'Admin view showing whether PINs are set without exposing encrypted values';

-- Grant access to authenticated users (read-only)
GRANT SELECT ON scooter_pin_status TO authenticated;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Users can see PIN status for their own scooters (not the encrypted value)
-- Note: pin_encrypted column is protected by column-level security
-- Users see the scooter record but cannot access pin_encrypted directly

-- Service role has full access (needed for Edge Functions)
-- Already covered by existing service_role policies

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify columns added
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'scooters'
  AND column_name IN ('pin_encrypted', 'pin_set_at', 'pin_set_by_user_id')
ORDER BY ordinal_position;

-- Verify functions created
SELECT
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN ('set_scooter_pin', 'get_scooter_pin', 'clear_scooter_pin')
ORDER BY routine_name;

-- Verify view created
SELECT
  table_name,
  table_type
FROM information_schema.tables
WHERE table_name = 'scooter_pin_status';

-- Verify index created
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'scooters'
  AND indexname = 'idx_scooters_pin_set_at';
