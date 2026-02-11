import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Execute each SQL statement
    const statements = [
      `ALTER TABLE terms_conditions ADD COLUMN IF NOT EXISTS state_code TEXT`,

      `COMMENT ON COLUMN terms_conditions.state_code IS 'Optional state/province code for regional subdivisions (e.g., CA for California, NSW for New South Wales). NULL means applies to entire country. Uses ISO 3166-2 subdivision codes.'`,

      `ALTER TABLE user_consent ADD COLUMN IF NOT EXISTS state_code TEXT`,

      `COMMENT ON COLUMN user_consent.state_code IS 'State/province where user accepted terms (from their profile or GPS location).'`,

      `ALTER TABLE users ADD COLUMN IF NOT EXISTS detected_state TEXT`,

      `COMMENT ON COLUMN users.detected_state IS 'Detected state/province code (ISO 3166-2 subdivision) from GPS or IP geolocation.'`,

      `CREATE OR REPLACE FUNCTION get_latest_terms(
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

          IF FOUND THEN
            RETURN;
          END IF;
        END IF;

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
      $$ LANGUAGE plpgsql SECURITY DEFINER`,

      `COMMENT ON FUNCTION get_latest_terms IS 'Get latest active T&C with state-level fallback: state-specific → country-level → English fallback'`
    ]

    const results = []
    for (const sql of statements) {
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql })
        if (error) {
          results.push({ sql: sql.substring(0, 80) + '...', error: error.message })
        } else {
          results.push({ sql: sql.substring(0, 80) + '...', success: true })
        }
      } catch (e: any) {
        results.push({ sql: sql.substring(0, 80) + '...', error: e.message })
      }
    }

    return new Response(
      JSON.stringify({ message: 'Migration executed', results }, null, 2),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
