-- Fix get_latest_terms: use explicit column list instead of tc.*
-- The tc.* approach broke when new columns were added to terms_conditions
-- (column order mismatch: file_size_bytes BIGINT landed in a TEXT slot)

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
    SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
           tc.document_type, tc.title, tc.storage_path, tc.public_url,
           tc.effective_date, tc.file_size_bytes, tc.is_active
    FROM terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.state_code = p_state_code
      AND tc.language_code = p_language_code
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;

    IF FOUND THEN
      RETURN;
    END IF;
  END IF;

  -- Fall back to country-level (no state specified)
  RETURN QUERY
  SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
         tc.document_type, tc.title, tc.storage_path, tc.public_url,
         tc.effective_date, tc.file_size_bytes, tc.is_active
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
    SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
           tc.document_type, tc.title, tc.storage_path, tc.public_url,
           tc.effective_date, tc.file_size_bytes, tc.is_active
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
'Get latest active T&C with state-level fallback: state-specific -> country-level -> English fallback';
