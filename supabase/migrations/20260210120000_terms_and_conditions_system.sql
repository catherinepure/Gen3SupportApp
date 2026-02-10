-- Migration: Terms & Conditions System
-- Date: 2026-02-10
-- Purpose: Add T&C storage, versioning, consent tracking, and multilingual support

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- STEP 1: Terms & Conditions Metadata Table
-- ============================================================================

-- Tracks T&C versions and their storage locations in Supabase bucket
CREATE TABLE IF NOT EXISTS terms_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identification
  version TEXT NOT NULL,
  language_code TEXT NOT NULL,  -- ISO 639-1: en, es, fr, de, zh, etc.
  region_code TEXT NOT NULL,    -- US, GB, EU, CN, or "global"
  document_type TEXT NOT NULL CHECK (document_type IN ('terms', 'privacy', 'other')),

  -- Storage (files stored in Supabase Storage bucket)
  storage_path TEXT NOT NULL,   -- Path in bucket: "US/terms-1.0-en.html"
  public_url TEXT NOT NULL,     -- Full CDN/storage URL
  file_size_bytes BIGINT,
  sha256_hash TEXT,             -- For integrity verification

  -- Metadata
  title TEXT NOT NULL,
  effective_date TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,

  -- Management
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,  -- NULL for global T&C

  -- Constraints
  UNIQUE(version, language_code, region_code, document_type)
);

-- Indexes for performance
CREATE INDEX idx_tc_active ON terms_conditions(is_active, region_code, document_type, effective_date DESC);
CREATE INDEX idx_tc_region_lang ON terms_conditions(region_code, language_code);
CREATE INDEX idx_tc_distributor ON terms_conditions(distributor_id) WHERE distributor_id IS NOT NULL;
CREATE INDEX idx_tc_version ON terms_conditions(version, effective_date DESC);
CREATE INDEX idx_tc_lookup ON terms_conditions(region_code, language_code, document_type, is_active);

-- Comments
COMMENT ON TABLE terms_conditions IS
'Metadata for T&C documents stored in Supabase Storage bucket. Files are versioned and region/language specific.';

COMMENT ON COLUMN terms_conditions.storage_path IS
'Relative path in storage bucket, e.g., "US/terms-1.0-en.html"';

COMMENT ON COLUMN terms_conditions.region_code IS
'ISO 3166-1 alpha-2 country code (US, GB, EU, CN) or "global" for worldwide policies';

COMMENT ON COLUMN terms_conditions.distributor_id IS
'If set, this T&C is managed by a specific distributor for their region';

-- ============================================================================
-- STEP 2: User Consent Tracking Table
-- ============================================================================

-- Tracks which users accepted which versions (full audit trail)
CREATE TABLE IF NOT EXISTS user_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- User & Document
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  terms_id UUID NOT NULL REFERENCES terms_conditions(id) ON DELETE CASCADE,

  -- What they accepted
  version TEXT NOT NULL,
  language_code TEXT NOT NULL,
  region_code TEXT NOT NULL,
  document_type TEXT NOT NULL,

  -- Acceptance details
  accepted BOOLEAN NOT NULL DEFAULT true,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Audit trail
  ip_address INET,
  user_agent TEXT,
  device_info TEXT,
  scrolled_to_bottom BOOLEAN DEFAULT false,  -- Did user scroll to bottom?
  time_to_read_seconds INTEGER,              -- How long they took to read

  -- Only one acceptance per user per terms document
  UNIQUE(user_id, terms_id)
);

-- Indexes for queries
CREATE INDEX idx_consent_user ON user_consent(user_id, accepted_at DESC);
CREATE INDEX idx_consent_terms ON user_consent(terms_id);
CREATE INDEX idx_consent_version ON user_consent(version, region_code, accepted_at DESC);
CREATE INDEX idx_consent_accepted ON user_consent(accepted, accepted_at DESC);
CREATE INDEX idx_consent_user_version ON user_consent(user_id, version, document_type);

-- Comments
COMMENT ON TABLE user_consent IS
'Tracks user acceptance of T&C versions with full audit trail for legal compliance';

COMMENT ON COLUMN user_consent.scrolled_to_bottom IS
'Tracks whether user scrolled to bottom of T&C before accepting (Android app tracks this)';

COMMENT ON COLUMN user_consent.time_to_read_seconds IS
'How many seconds elapsed between opening T&C and accepting';

-- ============================================================================
-- STEP 3: Add Language & Region Preferences to Users
-- ============================================================================

-- Add language and region tracking to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS detected_region TEXT,
ADD COLUMN IF NOT EXISTS current_terms_version TEXT,
ADD COLUMN IF NOT EXISTS last_terms_check TIMESTAMPTZ;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_language ON users(preferred_language);
CREATE INDEX IF NOT EXISTS idx_users_region ON users(detected_region);
CREATE INDEX IF NOT EXISTS idx_users_terms_check ON users(last_terms_check);

-- Comments
COMMENT ON COLUMN users.preferred_language IS
'User''s preferred language for UI and T&C (ISO 639-1 code: en, es, fr, de, zh, etc.)';

COMMENT ON COLUMN users.detected_region IS
'Region detected during registration via GPS/IP (ISO 3166-1 alpha-2: US, GB, CN, etc.)';

COMMENT ON COLUMN users.current_terms_version IS
'Most recent T&C version this user has accepted';

COMMENT ON COLUMN users.last_terms_check IS
'Last time app checked if user needs to accept new T&C version (checked daily)';

-- ============================================================================
-- STEP 4: Helper Functions
-- ============================================================================

-- Function: Get latest T&C version for a region/language
CREATE OR REPLACE FUNCTION get_latest_terms(
  p_region_code TEXT,
  p_language_code TEXT DEFAULT 'en',
  p_document_type TEXT DEFAULT 'terms'
)
RETURNS TABLE (
  id UUID,
  version TEXT,
  language_code TEXT,
  region_code TEXT,
  document_type TEXT,
  title TEXT,
  public_url TEXT,
  effective_date TIMESTAMPTZ,
  file_size_bytes BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tc.id,
    tc.version,
    tc.language_code,
    tc.region_code,
    tc.document_type,
    tc.title,
    tc.public_url,
    tc.effective_date,
    tc.file_size_bytes
  FROM terms_conditions tc
  WHERE tc.region_code = p_region_code
    AND tc.language_code = p_language_code
    AND tc.document_type = p_document_type
    AND tc.is_active = true
  ORDER BY tc.effective_date DESC
  LIMIT 1;

  -- Fallback to English if requested language not available
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      tc.id,
      tc.version,
      tc.language_code,
      tc.region_code,
      tc.document_type,
      tc.title,
      tc.public_url,
      tc.effective_date,
      tc.file_size_bytes
    FROM terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.language_code = 'en'
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_latest_terms IS
'Get latest active T&C version for a region/language. Falls back to English if requested language unavailable.';

-- Function: Check if user has accepted latest version
CREATE OR REPLACE FUNCTION check_user_consent(
  p_user_id UUID,
  p_region_code TEXT,
  p_document_type TEXT DEFAULT 'terms'
)
RETURNS TABLE (
  needs_acceptance BOOLEAN,
  current_version TEXT,
  latest_version TEXT,
  last_accepted_at TIMESTAMPTZ
) AS $$
DECLARE
  v_latest_version TEXT;
  v_user_version TEXT;
  v_last_accepted TIMESTAMPTZ;
BEGIN
  -- Get latest version for region
  SELECT version INTO v_latest_version
  FROM terms_conditions
  WHERE region_code = p_region_code
    AND document_type = p_document_type
    AND is_active = true
  ORDER BY effective_date DESC
  LIMIT 1;

  -- Get user's current accepted version
  SELECT uc.version, uc.accepted_at
  INTO v_user_version, v_last_accepted
  FROM user_consent uc
  JOIN terms_conditions tc ON uc.terms_id = tc.id
  WHERE uc.user_id = p_user_id
    AND tc.region_code = p_region_code
    AND tc.document_type = p_document_type
    AND uc.accepted = true
  ORDER BY uc.accepted_at DESC
  LIMIT 1;

  -- Compare versions
  RETURN QUERY SELECT
    (v_user_version IS NULL OR v_user_version != v_latest_version) AS needs_acceptance,
    v_user_version AS current_version,
    v_latest_version AS latest_version,
    v_last_accepted AS last_accepted_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_user_consent IS
'Check if user needs to accept new T&C version. Returns true if user has never accepted or if latest version is newer.';

-- ============================================================================
-- STEP 5: RLS Policies
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE terms_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_consent ENABLE ROW LEVEL SECURITY;

-- Terms & Conditions: Public read, admin/distributor write
CREATE POLICY terms_public_read ON terms_conditions
  FOR SELECT
  USING (is_active = true);

CREATE POLICY terms_admin_all ON terms_conditions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.user_level IN ('admin', 'manager')
    )
  );

-- User Consent: Users see their own, admins see all
CREATE POLICY consent_user_own ON user_consent
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY consent_user_insert ON user_consent
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY consent_admin_all ON user_consent
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.user_level IN ('admin', 'manager')
    )
  );

-- Service role can do everything (for Edge Functions)
CREATE POLICY terms_service_role ON terms_conditions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY consent_service_role ON user_consent
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- STEP 6: Sample Data (Optional - for testing)
-- ============================================================================

-- Insert sample T&C metadata (files must exist in storage bucket)
-- Uncomment after creating storage bucket and uploading files

/*
INSERT INTO terms_conditions (version, language_code, region_code, document_type, title, storage_path, public_url, effective_date, is_active)
VALUES
  ('1.0', 'en', 'US', 'terms', 'Terms & Conditions', 'US/terms-1.0-en.html',
   'https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/US/terms-1.0-en.html',
   '2025-01-01', true),

  ('1.0', 'en', 'GB', 'terms', 'Terms & Conditions', 'GB/terms-1.0-en.html',
   'https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/GB/terms-1.0-en.html',
   '2025-01-01', true),

  ('1.0', 'en', 'global', 'privacy', 'Privacy Policy', 'global/privacy-policy-1.0-en.html',
   'https://hhpxmlrpdharhhzwjxuc.supabase.co/storage/v1/object/public/terms-and-conditions/global/privacy-policy-1.0-en.html',
   '2025-01-01', true);
*/

-- ============================================================================
-- STEP 7: Grants
-- ============================================================================

-- Grant usage on functions
GRANT EXECUTE ON FUNCTION get_latest_terms TO authenticated, anon;
GRANT EXECUTE ON FUNCTION check_user_consent TO authenticated;
