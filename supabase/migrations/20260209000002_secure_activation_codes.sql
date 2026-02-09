-- ============================================================================
-- Migration: Secure Activation Codes with Hashing
-- Date: 2026-02-09
-- Description: Adds secure hashed activation codes with expiry dates for both
--              distributors and workshops. Keeps plaintext activation_code
--              temporarily for backward compatibility during migration.
-- ============================================================================

-- ============================================================================
-- PART 1: Add hash columns to distributors table
-- ============================================================================

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS activation_code_hash TEXT UNIQUE;

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS activation_code_expires_at TIMESTAMPTZ;

ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS activation_code_created_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN distributors.activation_code_hash IS 'Bcrypt hash of activation code. Never store plaintext after migration.';
COMMENT ON COLUMN distributors.activation_code_expires_at IS 'When the activation code expires. NULL = never expires.';
COMMENT ON COLUMN distributors.activation_code_created_at IS 'When the current activation code was generated.';

CREATE INDEX IF NOT EXISTS idx_distributors_activation_code_hash
  ON distributors(activation_code_hash)
  WHERE activation_code_hash IS NOT NULL;

-- ============================================================================
-- PART 2: Add hash columns to workshops table
-- ============================================================================

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS activation_code_hash TEXT UNIQUE;

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS activation_code_expires_at TIMESTAMPTZ;

ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS activation_code_created_at TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN workshops.activation_code_hash IS 'Bcrypt hash of activation code. Never store plaintext after migration.';
COMMENT ON COLUMN workshops.activation_code_expires_at IS 'When the activation code expires. NULL = never expires.';
COMMENT ON COLUMN workshops.activation_code_created_at IS 'When the current activation code was generated.';

CREATE INDEX IF NOT EXISTS idx_workshops_activation_code_hash
  ON workshops(activation_code_hash)
  WHERE activation_code_hash IS NOT NULL;

-- ============================================================================
-- PART 3: Add usage tracking to users table
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS activation_code_used_at TIMESTAMPTZ;

COMMENT ON COLUMN users.activation_code_used_at IS 'Timestamp when user registered using an activation code.';

-- ============================================================================
-- PART 4: Set default expiry for existing codes (90 days from now)
-- ============================================================================

-- For distributors with existing plaintext codes
UPDATE distributors
SET
  activation_code_expires_at = now() + interval '90 days',
  activation_code_created_at = now()
WHERE activation_code IS NOT NULL
  AND activation_code_expires_at IS NULL;

-- For workshops with existing plaintext codes
UPDATE workshops
SET
  activation_code_expires_at = now() + interval '90 days',
  activation_code_created_at = now()
WHERE activation_code IS NOT NULL
  AND activation_code_expires_at IS NULL;

-- ============================================================================
-- PART 5: Add admin notification view
-- ============================================================================

-- Create view to help admins identify which codes need migration
CREATE OR REPLACE VIEW unmigrated_activation_codes AS
SELECT
  'distributor' AS entity_type,
  id,
  name,
  activation_code IS NOT NULL AS has_plaintext,
  activation_code_hash IS NOT NULL AS has_hash,
  activation_code_expires_at
FROM distributors
WHERE activation_code IS NOT NULL AND activation_code_hash IS NULL

UNION ALL

SELECT
  'workshop' AS entity_type,
  id,
  name,
  activation_code IS NOT NULL AS has_plaintext,
  activation_code_hash IS NOT NULL AS has_hash,
  activation_code_expires_at
FROM workshops
WHERE activation_code IS NOT NULL AND activation_code_hash IS NULL;

COMMENT ON VIEW unmigrated_activation_codes IS 'Shows entities with plaintext codes that need migration to hashed codes.';

-- ============================================================================
-- NOTES FOR FUTURE MIGRATION STEPS
-- ============================================================================

-- After all codes have been migrated to hashes:
-- 1. Deploy Edge Functions that only validate hashes (no plaintext fallback)
-- 2. Verify all entities have activation_code_hash populated
-- 3. Run: ALTER TABLE distributors DROP COLUMN activation_code;
-- 4. Run: ALTER TABLE workshops DROP COLUMN activation_code;
-- 5. Drop the unmigrated_activation_codes view
