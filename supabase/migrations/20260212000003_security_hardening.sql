-- Security Hardening Migration
-- Addresses findings from security audit equivalent to Supabase Security Advisor
-- Date: 2026-02-12
--
-- Changes:
--   1. Fix 9 SECURITY DEFINER functions: add SET search_path = ''
--   2. Revoke EXECUTE on sensitive functions from anon role
--   3. Tighten anon write policies on scooters and firmware_uploads
--   4. Remove anon INSERT policies on activity_events and user_audit_log
--   5. Fix email_change_requests policy (was granted to public, not service_role)
--   6. Add explicit service_role policies to 4 tables missing them
--   7. Remove duplicate password_reset_tokens policy

-- ============================================================================
-- 1. SECURITY DEFINER FUNCTIONS: Add SET search_path = ''
--    Prevents search_path hijacking attacks on elevated-privilege functions
-- ============================================================================

-- 1a. check_user_consent
CREATE OR REPLACE FUNCTION public.check_user_consent(p_user_id uuid, p_region_code text, p_document_type text DEFAULT 'terms'::text)
 RETURNS TABLE(needs_acceptance boolean, current_version text, latest_version text, last_accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_latest_version TEXT;
  v_user_version TEXT;
  v_last_accepted TIMESTAMPTZ;
BEGIN
  SELECT version INTO v_latest_version
  FROM public.terms_conditions
  WHERE region_code = p_region_code
    AND document_type = p_document_type
    AND is_active = true
  ORDER BY effective_date DESC
  LIMIT 1;

  SELECT uc.version, uc.accepted_at
  INTO v_user_version, v_last_accepted
  FROM public.user_consent uc
  JOIN public.terms_conditions tc ON uc.terms_id = tc.id
  WHERE uc.user_id = p_user_id
    AND tc.region_code = p_region_code
    AND tc.document_type = p_document_type
    AND uc.accepted = true
  ORDER BY uc.accepted_at DESC
  LIMIT 1;

  RETURN QUERY SELECT
    (v_user_version IS NULL OR v_user_version != v_latest_version) AS needs_acceptance,
    v_user_version AS current_version,
    v_latest_version AS latest_version,
    v_last_accepted AS last_accepted_at;
END;
$function$;

-- 1b. cleanup_old_reset_attempts
CREATE OR REPLACE FUNCTION public.cleanup_old_reset_attempts()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  DELETE FROM public.password_reset_attempts WHERE created_at < now() - INTERVAL '24 hours';
END;
$function$;

-- 1c. clear_scooter_pin
CREATE OR REPLACE FUNCTION public.clear_scooter_pin(p_scooter_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  UPDATE public.scooters SET
    pin_encrypted = NULL,
    pin_set_at = NULL,
    pin_set_by_user_id = NULL,
    updated_at = now()
  WHERE id = p_scooter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scooter not found';
  END IF;
END;
$function$;

-- 1d. get_available_firmware
CREATE OR REPLACE FUNCTION public.get_available_firmware(p_hw_version text, p_access_level text DEFAULT 'public'::text, p_current_sw_version text DEFAULT NULL::text)
 RETURNS TABLE(firmware_id uuid, version_label text, file_path text, file_size_bytes integer, release_notes text, min_sw_version text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
    RETURN QUERY
    SELECT DISTINCT
        fv.id,
        fv.version_label,
        fv.file_path,
        fv.file_size_bytes,
        fv.release_notes,
        fv.min_sw_version,
        fv.created_at
    FROM public.firmware_versions fv
    INNER JOIN public.firmware_hw_targets fht ON fv.id = fht.firmware_version_id
    WHERE fv.is_active = true
        AND fht.hw_version = p_hw_version
        AND (
            (p_access_level = 'public' AND fv.access_level = 'public')
            OR (p_access_level = 'distributor' AND fv.access_level IN ('public', 'distributor'))
        )
        AND (
            fv.min_sw_version IS NULL
            OR p_current_sw_version IS NULL
            OR p_current_sw_version >= fv.min_sw_version
        )
    ORDER BY fv.created_at DESC;
END;
$function$;

-- 1e. get_latest_terms (3-param overload)
CREATE OR REPLACE FUNCTION public.get_latest_terms(p_region_code text, p_language_code text DEFAULT 'en'::text, p_document_type text DEFAULT 'terms'::text)
 RETURNS TABLE(id uuid, version text, language_code text, region_code text, document_type text, title text, public_url text, effective_date timestamp with time zone, file_size_bytes bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
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
  FROM public.terms_conditions tc
  WHERE tc.region_code = p_region_code
    AND tc.language_code = p_language_code
    AND tc.document_type = p_document_type
    AND tc.is_active = true
  ORDER BY tc.effective_date DESC
  LIMIT 1;

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
    FROM public.terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.language_code = 'en'
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;
  END IF;
END;
$function$;

-- 1f. get_latest_terms (4-param overload with state_code)
CREATE OR REPLACE FUNCTION public.get_latest_terms(p_region_code text, p_language_code text, p_state_code text DEFAULT NULL::text, p_document_type text DEFAULT 'terms'::text)
 RETURNS TABLE(id uuid, version text, language_code text, region_code text, state_code text, document_type text, title text, storage_path text, public_url text, effective_date timestamp with time zone, file_size_bytes bigint, is_active boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF p_state_code IS NOT NULL THEN
    RETURN QUERY
    SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
           tc.document_type, tc.title, tc.storage_path, tc.public_url,
           tc.effective_date, tc.file_size_bytes, tc.is_active
    FROM public.terms_conditions tc
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

  RETURN QUERY
  SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
         tc.document_type, tc.title, tc.storage_path, tc.public_url,
         tc.effective_date, tc.file_size_bytes, tc.is_active
  FROM public.terms_conditions tc
  WHERE tc.region_code = p_region_code
    AND tc.state_code IS NULL
    AND tc.language_code = p_language_code
    AND tc.document_type = p_document_type
    AND tc.is_active = true
  ORDER BY tc.effective_date DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT tc.id, tc.version, tc.language_code, tc.region_code, tc.state_code,
           tc.document_type, tc.title, tc.storage_path, tc.public_url,
           tc.effective_date, tc.file_size_bytes, tc.is_active
    FROM public.terms_conditions tc
    WHERE tc.region_code = p_region_code
      AND tc.state_code IS NULL
      AND tc.language_code = 'en'
      AND tc.document_type = p_document_type
      AND tc.is_active = true
    ORDER BY tc.effective_date DESC
    LIMIT 1;
  END IF;
END;
$function$;

-- 1g. get_scooter_pin
CREATE OR REPLACE FUNCTION public.get_scooter_pin(p_scooter_id uuid, p_encryption_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  encrypted_pin TEXT;
  decrypted_pin TEXT;
BEGIN
  SELECT pin_encrypted INTO encrypted_pin FROM public.scooters WHERE id = p_scooter_id;
  IF encrypted_pin IS NULL THEN
    RETURN NULL;
  END IF;
  decrypted_pin := pgp_sym_decrypt(decode(encrypted_pin, 'base64'), p_encryption_key);
  RETURN decrypted_pin;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to decrypt PIN: %', SQLERRM;
END;
$function$;

-- 1h. record_telemetry
CREATE OR REPLACE FUNCTION public.record_telemetry(p_zyd_serial text, p_hw_version text, p_sw_version text, p_odometer_km numeric DEFAULT NULL::numeric, p_battery_cycles integer DEFAULT NULL::integer, p_firmware_upload_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
    v_snapshot_id UUID;
BEGIN
    INSERT INTO public.telemetry_snapshots (
        zyd_serial,
        hw_version,
        sw_version,
        odometer_km,
        battery_cycles,
        firmware_upload_id,
        notes
    ) VALUES (
        p_zyd_serial,
        p_hw_version,
        p_sw_version,
        p_odometer_km,
        p_battery_cycles,
        p_firmware_upload_id,
        p_notes
    )
    RETURNING id INTO v_snapshot_id;

    RETURN v_snapshot_id;
END;
$function$;

-- 1i. set_scooter_pin
CREATE OR REPLACE FUNCTION public.set_scooter_pin(p_scooter_id uuid, p_pin text, p_user_id uuid, p_encryption_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
BEGIN
  IF p_pin !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 6 digits';
  END IF;
  UPDATE public.scooters SET
    pin_encrypted = encode(pgp_sym_encrypt(p_pin, p_encryption_key), 'base64'),
    pin_set_at = now(),
    pin_set_by_user_id = p_user_id,
    updated_at = now()
  WHERE id = p_scooter_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scooter not found';
  END IF;
END;
$function$;

-- ============================================================================
-- 2. REVOKE EXECUTE on sensitive functions from anon
--    These are only called from Edge Functions (service_role) or authenticated users
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.clear_scooter_pin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_scooter_pin(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_scooter_pin(uuid, text, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_sessions() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_verification_tokens() FROM anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_reset_attempts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.next_serial_number(character, character varying, character, character) FROM anon;

-- ============================================================================
-- 3. TIGHTEN ANON WRITE POLICIES
-- ============================================================================

-- 3a. scooters: Replace wide-open anon UPDATE with one that protects sensitive fields
--     App only updates: controller_*_version, meter_*_version, bms_*_version,
--     embedded_serial, model, last_connected_at
--     Must NOT allow changing: pin_encrypted, pin_set_at, pin_set_by_user_id,
--     status, serial_number, zyd_serial
DROP POLICY IF EXISTS anon_update_scooters ON scooters;
CREATE POLICY anon_update_scooters ON scooters
  FOR UPDATE TO anon
  USING (true)
  WITH CHECK (
    -- Prevent changing sensitive fields by ensuring they match the existing row
    pin_encrypted IS NOT DISTINCT FROM (SELECT s.pin_encrypted FROM public.scooters s WHERE s.id = scooters.id)
    AND pin_set_at IS NOT DISTINCT FROM (SELECT s.pin_set_at FROM public.scooters s WHERE s.id = scooters.id)
    AND pin_set_by_user_id IS NOT DISTINCT FROM (SELECT s.pin_set_by_user_id FROM public.scooters s WHERE s.id = scooters.id)
    AND status IS NOT DISTINCT FROM (SELECT s.status FROM public.scooters s WHERE s.id = scooters.id)
    AND serial_number IS NOT DISTINCT FROM (SELECT s.serial_number FROM public.scooters s WHERE s.id = scooters.id)
    AND zyd_serial IS NOT DISTINCT FROM (SELECT s.zyd_serial FROM public.scooters s WHERE s.id = scooters.id)
  );

-- 3b. firmware_uploads: Replace wide-open anon UPDATE with time-limited policy
--     Only allow updates within 1 hour of creation (for upload progress tracking)
DROP POLICY IF EXISTS anon_update_firmware_uploads ON firmware_uploads;
CREATE POLICY anon_update_firmware_uploads ON firmware_uploads
  FOR UPDATE TO anon
  USING (started_at > now() - INTERVAL '1 hour')
  WITH CHECK (started_at > now() - INTERVAL '1 hour');

-- 3c. Remove anon INSERT on tables only written via Edge Functions (service_role)
DROP POLICY IF EXISTS "Anonymous insert activity_events" ON activity_events;
DROP POLICY IF EXISTS anon_insert_user_audit_log ON user_audit_log;

-- ============================================================================
-- 4. FIX email_change_requests POLICY
--    Currently granted to {public} — anyone can read/write/delete email changes
--    Should be service_role only
-- ============================================================================

DROP POLICY IF EXISTS "Service role full access on email_change_requests" ON email_change_requests;
CREATE POLICY service_role_all_email_change_requests ON email_change_requests
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 5. ADD EXPLICIT service_role POLICIES to tables missing them
--    These tables have RLS enabled but zero policies — currently work because
--    service_role bypasses RLS, but should have explicit policies
-- ============================================================================

CREATE POLICY service_role_all_device_tokens ON device_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_notification_templates ON notification_templates
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_push_notifications ON push_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY service_role_all_pin_verification_attempts ON pin_verification_attempts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 6. REMOVE DUPLICATE password_reset_tokens POLICY
-- ============================================================================

DROP POLICY IF EXISTS "Service role can manage password reset tokens" ON password_reset_tokens;
-- Keeps: service_role_all_password_reset_tokens
