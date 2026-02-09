-- ============================================================================
-- Migration: Add Plaintext Activation Codes for Admin Viewing
-- Date: 2026-02-09
-- Description: Adds plaintext activation code columns so manufacturer admins
--              can view and share codes with distributors/workshops.
--              Codes are still hashed for validation, but plaintext stored
--              for admin convenience. Only accessible via admin Edge Function.
-- ============================================================================

-- Add plaintext code column to distributors
ALTER TABLE distributors
  ADD COLUMN IF NOT EXISTS activation_code_plaintext TEXT;

COMMENT ON COLUMN distributors.activation_code_plaintext IS 'Plaintext activation code for admin viewing. Only accessible to manufacturer_admin via admin Edge Function.';

-- Add plaintext code column to workshops
ALTER TABLE workshops
  ADD COLUMN IF NOT EXISTS activation_code_plaintext TEXT;

COMMENT ON COLUMN workshops.activation_code_plaintext IS 'Plaintext activation code for admin viewing. Only accessible to manufacturer_admin via admin Edge Function.';

-- Add index for uniqueness (optional, but good practice)
CREATE UNIQUE INDEX IF NOT EXISTS idx_distributors_activation_code_plaintext
  ON distributors(activation_code_plaintext)
  WHERE activation_code_plaintext IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workshops_activation_code_plaintext
  ON workshops(activation_code_plaintext)
  WHERE activation_code_plaintext IS NOT NULL;

-- ============================================================================
-- SECURITY NOTE:
-- These columns should ONLY be accessed via the admin Edge Function which
-- checks for manufacturer_admin role. Never expose via direct table queries.
-- RLS policies should be updated to prevent direct access.
-- ============================================================================
