-- Migration: Fix user_consent FK behavior and add updated_at to terms_conditions
-- Date: 2026-02-10
-- Purpose:
--   1. Change user_consent.user_id FK from CASCADE to SET NULL (preserve audit trail)
--   2. Add updated_at column and trigger to terms_conditions
--   3. Add index on terms_conditions for state_code queries

-- ============================================================================
-- STEP 1: Change user_consent.user_id FK to SET NULL
-- Preserves consent audit records when a user is deleted (compliance requirement)
-- ============================================================================

-- Drop the existing CASCADE constraint
ALTER TABLE user_consent
DROP CONSTRAINT IF EXISTS user_consent_user_id_fkey;

-- Make user_id nullable (required for SET NULL)
ALTER TABLE user_consent
ALTER COLUMN user_id DROP NOT NULL;

-- Re-add with SET NULL behavior
ALTER TABLE user_consent
ADD CONSTRAINT user_consent_user_id_fkey
FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- ============================================================================
-- STEP 2: Add updated_at to terms_conditions
-- ============================================================================

ALTER TABLE terms_conditions
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Auto-update trigger
CREATE OR REPLACE FUNCTION update_terms_conditions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_terms_conditions_updated_at ON terms_conditions;
CREATE TRIGGER trigger_terms_conditions_updated_at
  BEFORE UPDATE ON terms_conditions
  FOR EACH ROW
  EXECUTE FUNCTION update_terms_conditions_updated_at();

-- ============================================================================
-- STEP 3: Add index for state_code queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tc_state ON terms_conditions(region_code, state_code, language_code, document_type)
  WHERE state_code IS NOT NULL;

-- ============================================================================
-- STEP 4: Update unique constraint to include state_code
-- The 140000 migration added state_code but didn't update the unique constraint.
-- Drop old constraint and add new one that includes state_code.
-- ============================================================================

ALTER TABLE terms_conditions
DROP CONSTRAINT IF EXISTS terms_conditions_version_language_code_region_code_document_key;

ALTER TABLE terms_conditions
ADD CONSTRAINT terms_conditions_version_lang_region_state_doctype_key
UNIQUE(version, language_code, region_code, state_code, document_type);
