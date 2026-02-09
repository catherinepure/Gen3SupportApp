-- Migration: Add activation codes for workshops
-- Date: 2026-02-09
-- Purpose: Enable workshop staff to register using unique activation codes

-- Add activation_code to workshops table
ALTER TABLE workshops
ADD COLUMN IF NOT EXISTS activation_code TEXT UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_workshops_activation_code
ON workshops(activation_code)
WHERE activation_code IS NOT NULL;

-- Add comment
COMMENT ON COLUMN workshops.activation_code IS 'Unique code for workshop staff registration (format: WORK-XXXX-XXXX)';

-- Generate activation codes for existing workshops that don't have one
-- Using format WORK-XXXX-XXXX (similar to distributor codes but with WORK prefix)
UPDATE workshops
SET activation_code = 'WORK-' ||
  substring(md5(random()::text || id::text) from 1 for 4) || '-' ||
  substring(md5(random()::text || id::text || now()::text) from 1 for 4)
WHERE activation_code IS NULL;

-- Update users table to track which activation code was used
ALTER TABLE users
ADD COLUMN IF NOT EXISTS workshop_activation_code_used TEXT;

COMMENT ON COLUMN users.workshop_activation_code_used IS 'Activation code used during workshop staff registration';
