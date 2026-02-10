-- Add state/province subdivision support for T&C
-- For countries like US (states) and AU (states/territories)

-- Add state_code to terms_conditions
ALTER TABLE terms_conditions 
ADD COLUMN IF NOT EXISTS state_code TEXT;

COMMENT ON COLUMN terms_conditions.state_code IS 
'Optional state/province code for regional subdivisions (e.g., CA for California, NSW for New South Wales). 
NULL means applies to entire country. Uses ISO 3166-2 subdivision codes.';

-- Add state_code to user_consent for tracking
ALTER TABLE user_consent
ADD COLUMN IF NOT EXISTS state_code TEXT;

COMMENT ON COLUMN user_consent.state_code IS 
'State/province where user accepted terms (from their profile or GPS location).';

-- Add state_code to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS detected_state TEXT;

COMMENT ON COLUMN users.detected_state IS 
'Detected state/province code (ISO 3166-2 subdivision) from GPS or IP geolocation.';

-- Update get_latest_terms function to support state-level fallback
CREATE OR REPLACE FUNCTION get_latest_terms(
  p_region_code TEXT,
  p_language_code TEXT,
  p_state_code TEXT DEFAULT NULL,
  p_document_type TEXT DEFAULT 'terms'
)
RETURNS TABLE (
  id UUID,
  version TEXT,
  language_code TEXT,
  region_code TEXT,
  state_code TEXT,
  document_type TEXT,
  title TEXT,
  storage_path TEXT,
  public_url TEXT,
  effective_date TIMESTAMPTZ,
  file_size_bytes BIGINT,
  is_active BOOLEAN
) AS $$
BEGIN
  -- Try to find state-specific version first (if state provided)
  IF p_state_code IS NOT NULL THEN
    RETURN QUERY
    SELECT tc.*
    FROM terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.state_code = p_state_code
      AND tc.language_code = p_language_code
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;

    -- Return if state-specific version found
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fall back to country-level (no state specified)
  RETURN QUERY
  SELECT tc.*
  FROM terms_conditions tc
  WHERE tc.region_code = p_region_code
    AND tc.state_code IS NULL
    AND tc.language_code = p_language_code
    AND tc.document_type = p_document_type
    AND tc.is_active = true
  ORDER BY tc.effective_date DESC
  LIMIT 1;

  -- If no match with requested language, fall back to English
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT tc.*
    FROM terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.state_code IS NULL
      AND tc.language_code = 'en'
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_latest_terms(TEXT, TEXT, TEXT, TEXT) IS
'Get latest active T&C with state-level fallback: state-specific → country-level → English fallback';
