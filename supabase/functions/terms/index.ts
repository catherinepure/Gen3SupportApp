// Supabase Edge Function: Terms & Conditions API
// Deploy with: supabase functions deploy terms
//
// Endpoints:
//   GET  /latest - Get latest T&C version for region/language
//   GET  /check-acceptance - Check if user needs to accept new version
//   POST /record-consent - Record user consent
//   POST /upload - Upload new T&C (admin only)
//   GET  /acceptance-history - Get consent history (admin only)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Session-Token',
}

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

function errorResponse(msg: string, status = 400) {
  return respond({ error: msg }, status)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // ========================================================================
    // GET /latest - Get latest T&C version
    // ========================================================================
    if (req.method === 'GET' && path === 'latest') {
      const region = url.searchParams.get('region') || 'US'
      const language = url.searchParams.get('language') || 'en'
      const state = url.searchParams.get('state') || null
      const docType = url.searchParams.get('document_type') || 'terms'

      // Call database function with state-level fallback support
      const { data, error } = await supabaseAdmin
        .rpc('get_latest_terms', {
          p_region_code: region,
          p_language_code: language,
          p_state_code: state,
          p_document_type: docType
        })

      if (error) {
        console.error('Error fetching latest terms:', error)
        return errorResponse('Failed to fetch terms', 500)
      }

      if (!data || data.length === 0) {
        return errorResponse(`No terms found for region ${region}`, 404)
      }

      return respond(data[0])
    }

    // ========================================================================
    // GET /check-acceptance - Check if user needs to accept new version
    // ========================================================================
    if (req.method === 'GET' && path === 'check-acceptance') {
      const userId = url.searchParams.get('user_id')
      const sessionToken = req.headers.get('X-Session-Token') || url.searchParams.get('session_token')

      if (!userId || !sessionToken) {
        return errorResponse('Missing user_id or session_token', 400)
      }

      // Validate session
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', sessionToken)
        .single()

      if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
        return errorResponse('Invalid or expired session', 401)
      }

      if (sessionData.user_id !== userId) {
        return errorResponse('User ID mismatch', 403)
      }

      // Get user's region, state, and language
      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('detected_region, detected_state, preferred_language')
        .eq('id', userId)
        .single()

      const region = userData?.detected_region || 'US'
      const state = userData?.detected_state || null
      const language = userData?.preferred_language || 'en'

      // Check consent status
      const { data: consentData } = await supabaseAdmin
        .rpc('check_user_consent', {
          p_user_id: userId,
          p_region_code: region,
          p_document_type: 'terms'
        })

      if (!consentData || consentData.length === 0) {
        return errorResponse('Failed to check consent', 500)
      }

      const status = consentData[0]

      // Get latest terms URL and ID (with state-level fallback)
      const { data: latestTerms } = await supabaseAdmin
        .rpc('get_latest_terms', {
          p_region_code: region,
          p_language_code: language,
          p_state_code: state,
          p_document_type: 'terms'
        })

      return respond({
        needs_acceptance: status.needs_acceptance,
        current_version: status.current_version,
        latest_version: status.latest_version,
        last_accepted_at: status.last_accepted_at,
        region,
        language,
        terms_url: latestTerms?.[0]?.public_url || null,
        terms_id: latestTerms?.[0]?.id || null,
        terms_title: latestTerms?.[0]?.title || null
      })
    }

    // ========================================================================
    // POST /record-consent - Record user consent
    // ========================================================================
    if (req.method === 'POST' && path === 'record-consent') {
      const body = await req.json()
      const {
        session_token,
        user_id,
        terms_id,
        version,
        language_code,
        region_code,
        document_type,
        accepted,
        scrolled_to_bottom,
        time_to_read_seconds,
        ip_address,
        user_agent,
        device_info
      } = body

      if (!session_token || !user_id || !terms_id) {
        return errorResponse('Missing required fields', 400)
      }

      // Validate session
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id, expires_at')
        .eq('session_token', session_token)
        .single()

      if (!sessionData || new Date(sessionData.expires_at) < new Date()) {
        return errorResponse('Invalid or expired session', 401)
      }

      if (sessionData.user_id !== user_id) {
        return errorResponse('User ID mismatch', 403)
      }

      // Insert consent record
      const { data: consentData, error: consentError } = await supabaseAdmin
        .from('user_consent')
        .insert({
          user_id,
          terms_id,
          version,
          language_code,
          region_code,
          document_type,
          accepted,
          scrolled_to_bottom,
          time_to_read_seconds,
          ip_address,
          user_agent,
          device_info
        })
        .select()
        .single()

      if (consentError) {
        console.error('Error recording consent:', consentError)
        return errorResponse('Failed to record consent', 500)
      }

      // Update user's current version
      await supabaseAdmin
        .from('users')
        .update({
          current_terms_version: version,
          last_terms_check: new Date().toISOString()
        })
        .eq('id', user_id)

      return respond({
        success: true,
        consent_id: consentData.id,
        user_version_updated: true
      })
    }

    // ========================================================================
    // POST /upload - Upload new T&C (admin only)
    // ========================================================================
    if (req.method === 'POST' && path === 'upload') {
      const body = await req.json()
      const {
        session_token,
        version,
        language_code,
        region_code,
        state_code,
        document_type,
        title,
        storage_path: providedStoragePath,
        public_url: providedPublicUrl,
        effective_date,
        file_size_bytes,
        sha256_hash,
        distributor_id,
        file_content,
        file_name
      } = body

      if (!session_token) {
        return errorResponse('Missing session_token', 400)
      }

      // Validate session and check admin/manager role
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', session_token)
        .single()

      if (!sessionData) {
        return errorResponse('Invalid session', 401)
      }

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('user_level, distributor_id')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData || !['admin', 'manager'].includes(userData.user_level)) {
        return errorResponse('Admin or manager access required', 403)
      }

      // Managers can only upload for their own region
      if (userData.user_level === 'manager' && distributor_id !== userData.distributor_id) {
        return errorResponse('Can only upload terms for your own region', 403)
      }

      let storagePath = providedStoragePath
      let publicUrl = providedPublicUrl

      // If file_content is provided (base64), upload to storage server-side
      if (file_content && !storagePath) {
        const statePrefix = state_code ? `${state_code}/` : ''
        storagePath = `${region_code}/${statePrefix}terms-${version}-${language_code}.html`

        // Decode base64 to Uint8Array
        const binaryString = atob(file_content)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }

        // Upload to storage using service_role (server-side only)
        const { error: uploadError } = await supabaseAdmin.storage
          .from('terms-and-conditions')
          .upload(storagePath, bytes, {
            contentType: 'text/html',
            upsert: false
          })

        if (uploadError) {
          console.error('Storage upload error:', uploadError)
          if (uploadError.message?.includes('already exists') || uploadError.message?.includes('Duplicate')) {
            return errorResponse(`Version ${version} already exists for ${region_code}/${language_code}. Please use a unique version number.`, 409)
          }
          return errorResponse('Failed to upload file to storage: ' + uploadError.message, 500)
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('terms-and-conditions')
          .getPublicUrl(storagePath)

        publicUrl = urlData.publicUrl
      }

      if (!storagePath || !publicUrl) {
        return errorResponse('Missing storage_path/public_url or file_content', 400)
      }

      // Insert terms metadata
      const { data: termsData, error: termsError } = await supabaseAdmin
        .from('terms_conditions')
        .insert({
          version,
          language_code,
          region_code,
          state_code,
          document_type,
          title,
          storage_path: storagePath,
          public_url: publicUrl,
          effective_date,
          file_size_bytes,
          sha256_hash,
          created_by: sessionData.user_id,
          distributor_id,
          is_active: true
        })
        .select()
        .single()

      if (termsError) {
        console.error('Error inserting terms metadata:', termsError)
        return errorResponse('Failed to save terms metadata', 500)
      }

      return respond({
        success: true,
        terms_id: termsData.id,
        storage_path: termsData.storage_path,
        public_url: termsData.public_url
      })
    }

    // ========================================================================
    // GET /list - List T&C versions (admin only)
    // ========================================================================
    if (req.method === 'GET' && path === 'list') {
      const sessionToken = req.headers.get('X-Session-Token') || url.searchParams.get('session_token')

      if (!sessionToken) {
        return errorResponse('Missing session_token', 400)
      }

      // Validate session and check admin/manager role
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', sessionToken)
        .single()

      if (!sessionData) {
        return errorResponse('Invalid session', 401)
      }

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('user_level, detected_region')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData || !['admin', 'manager'].includes(userData.user_level)) {
        return errorResponse('Admin or manager access required', 403)
      }

      // Managers only see their region, admins see all
      const regionFilter = userData.user_level === 'manager' ? userData.detected_region : url.searchParams.get('region')

      let query = supabaseAdmin
        .from('terms_conditions')
        .select('*')
        .order('effective_date', { ascending: false })

      if (regionFilter) {
        query = query.eq('region_code', regionFilter)
      }

      const { data: terms, error } = await query

      if (error) {
        console.error('Error fetching terms:', error)
        return errorResponse('Failed to fetch terms', 500)
      }

      // Get acceptance counts for each version
      const termsWithStats = await Promise.all(terms.map(async (term) => {
        const { count: acceptanceCount } = await supabaseAdmin
          .from('user_consent')
          .select('*', { count: 'exact', head: true })
          .eq('terms_id', term.id)
          .eq('accepted', true)

        return {
          ...term,
          acceptance_count: acceptanceCount || 0
        }
      }))

      return respond({ terms: termsWithStats })
    }

    // ========================================================================
    // PATCH /update-metadata - Update T&C metadata (admin only)
    // ========================================================================
    if (req.method === 'PATCH' && path === 'update-metadata') {
      const body = await req.json()
      const {
        session_token,
        terms_id,
        title,
        state_code,
        effective_date,
        is_active
      } = body

      if (!session_token || !terms_id) {
        return errorResponse('Missing session_token or terms_id', 400)
      }

      // Validate session and check admin role
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', session_token)
        .single()

      if (!sessionData) {
        return errorResponse('Invalid session', 401)
      }

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('user_level')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData || userData.user_level !== 'admin') {
        return errorResponse('Admin access required', 403)
      }

      // Build update object (only include fields that are provided)
      const updates: any = { updated_at: new Date().toISOString() }
      if (title !== undefined) updates.title = title
      if (state_code !== undefined) updates.state_code = state_code || null
      if (effective_date !== undefined) updates.effective_date = effective_date
      if (is_active !== undefined) updates.is_active = is_active

      // Update the record
      const { data: updatedTerm, error } = await supabaseAdmin
        .from('terms_conditions')
        .update(updates)
        .eq('id', terms_id)
        .select()
        .single()

      if (error) {
        console.error('Error updating terms metadata:', error)
        return errorResponse('Failed to update metadata', 500)
      }

      return respond({
        success: true,
        term: updatedTerm
      })
    }

    // ========================================================================
    // POST /toggle-active - Toggle T&C active status (admin only)
    // ========================================================================
    if (req.method === 'POST' && path === 'toggle-active') {
      const body = await req.json()
      const {
        session_token,
        terms_id,
        is_active
      } = body

      if (!session_token || !terms_id || is_active === undefined) {
        return errorResponse('Missing session_token, terms_id, or is_active', 400)
      }

      // Validate session and check admin role
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', session_token)
        .single()

      if (!sessionData) {
        return errorResponse('Invalid session', 401)
      }

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('user_level')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData || userData.user_level !== 'admin') {
        return errorResponse('Admin access required', 403)
      }

      // Update the active status
      const { data: updatedTerm, error } = await supabaseAdmin
        .from('terms_conditions')
        .update({
          is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', terms_id)
        .select()
        .single()

      if (error) {
        console.error('Error toggling active status:', error)
        return errorResponse('Failed to toggle status', 500)
      }

      return respond({
        success: true,
        term: updatedTerm,
        is_active: updatedTerm.is_active
      })
    }

    // ========================================================================
    // GET /acceptance-history - Get consent history (admin only)
    // ========================================================================
    if (req.method === 'GET' && path === 'acceptance-history') {
      const sessionToken = req.headers.get('X-Session-Token') || url.searchParams.get('session_token')

      if (!sessionToken) {
        return errorResponse('Missing session_token', 400)
      }

      // Validate session and check admin/manager role
      const { data: sessionData } = await supabaseAdmin
        .from('user_sessions')
        .select('user_id')
        .eq('session_token', sessionToken)
        .single()

      if (!sessionData) {
        return errorResponse('Invalid session', 401)
      }

      const { data: userData } = await supabaseAdmin
        .from('users')
        .select('user_level, distributor_id')
        .eq('id', sessionData.user_id)
        .single()

      if (!userData || !['admin', 'manager'].includes(userData.user_level)) {
        return errorResponse('Admin or manager access required', 403)
      }

      // Build query filters
      const region = url.searchParams.get('region')
      const version = url.searchParams.get('version')
      const userId = url.searchParams.get('user_id')
      const limit = parseInt(url.searchParams.get('limit') || '100')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      let query = supabaseAdmin
        .from('user_consent')
        .select(`
          *,
          users!inner(email, first_name, last_name, distributor_id)
        `)
        .order('accepted_at', { ascending: false })
        .range(offset, offset + limit - 1)

      // Managers can only see their region
      if (userData.user_level === 'manager') {
        // Get distributor's region
        const { data: distData } = await supabaseAdmin
          .from('distributors')
          .select('country')
          .eq('id', userData.distributor_id)
          .single()

        if (distData) {
          query = query.eq('region_code', distData.country)
        }
      } else if (region) {
        query = query.eq('region_code', region)
      }

      if (version) {
        query = query.eq('version', version)
      }

      if (userId) {
        query = query.eq('user_id', userId)
      }

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching acceptance history:', error)
        return errorResponse('Failed to fetch history', 500)
      }

      return respond({
        total_count: count || data?.length || 0,
        records: data || []
      })
    }

    return errorResponse('Invalid endpoint', 404)

  } catch (error) {
    console.error('Function error:', error)
    return errorResponse(error.message || 'Internal server error', 500)
  }
})
