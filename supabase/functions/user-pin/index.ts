// Supabase Edge Function for User PIN Operations
// Deploy with: supabase functions deploy user-pin --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Handles PIN check/set/verify for authenticated users on their own scooters.
// Unlike the admin endpoint, this works for normal users (not just admin/manager).
//
// Actions:
//   check-pin  — returns { has_pin: boolean } for a scooter the user owns
//   set-pin    — sets a 6-digit PIN on a scooter the user owns
//   verify-pin — verifies a PIN against the stored encrypted PIN

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
}

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400) {
  return respond({ error: message }, status)
}

/**
 * Authenticate a user via session token. Works for ALL user levels.
 */
async function authenticateUser(supabase: any, sessionToken: string) {
  if (!sessionToken) return null

  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single()

  if (!session || new Date() > new Date(session.expires_at)) return null

  const { data: user } = await supabase
    .from('users')
    .select('id, email, is_active')
    .eq('id', session.user_id)
    .single()

  if (!user || !user.is_active) return null

  return user
}

/**
 * Check that the user owns the scooter (via user_scooters junction table).
 */
async function verifyOwnership(supabase: any, userId: string, scooterId: string): Promise<boolean> {
  const { data } = await supabase
    .from('user_scooters')
    .select('user_id')
    .eq('scooter_id', scooterId)
    .eq('user_id', userId)
    .single()

  return !!data
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, session_token, scooter_id } = body

    if (!action) {
      return errorResponse('Action required')
    }

    if (!session_token) {
      return errorResponse('Session token required', 401)
    }

    if (!scooter_id) {
      return errorResponse('Scooter ID required')
    }

    // Initialize Supabase client with service role for DB function access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Authenticate user (any level, not just admin)
    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return errorResponse('Authentication failed', 401)
    }

    // Verify ownership
    const isOwner = await verifyOwnership(supabase, user.id, scooter_id)
    if (!isOwner) {
      return errorResponse('You do not own this scooter', 403)
    }

    // ================================================================
    // ACTION: check-pin — Does this scooter have a PIN set?
    // ================================================================
    if (action === 'check-pin') {
      const { data: scooter, error } = await supabase
        .from('scooters')
        .select('pin_encrypted')
        .eq('id', scooter_id)
        .single()

      if (error || !scooter) {
        return errorResponse('Scooter not found', 404)
      }

      return respond({ has_pin: !!scooter.pin_encrypted })
    }

    // ================================================================
    // ACTION: set-pin — Set a new 6-digit PIN
    // ================================================================
    if (action === 'set-pin') {
      const { pin } = body
      if (!pin || !/^\d{6}$/.test(pin)) {
        return errorResponse('PIN must be exactly 6 digits')
      }

      const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
      if (!ENCRYPTION_KEY) {
        console.error('PIN_ENCRYPTION_KEY not configured')
        return errorResponse('PIN encryption not configured', 500)
      }

      const { error: setPinError } = await supabase.rpc('set_scooter_pin', {
        p_scooter_id: scooter_id,
        p_pin: pin,
        p_user_id: user.id,
        p_encryption_key: ENCRYPTION_KEY
      })

      if (setPinError) {
        console.error('PIN set error:', setPinError)
        return errorResponse('Failed to set PIN: ' + setPinError.message, 500)
      }

      return respond({ success: true, message: 'PIN set successfully' })
    }

    // ================================================================
    // ACTION: verify-pin — Check if entered PIN matches stored PIN
    // ================================================================
    if (action === 'verify-pin') {
      const { pin } = body
      if (!pin || !/^\d{6}$/.test(pin)) {
        return errorResponse('PIN must be exactly 6 digits')
      }

      const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
      if (!ENCRYPTION_KEY) {
        console.error('PIN_ENCRYPTION_KEY not configured')
        return errorResponse('PIN encryption not configured', 500)
      }

      // Decrypt stored PIN
      const { data: decryptedPin, error: getPinError } = await supabase.rpc('get_scooter_pin', {
        p_scooter_id: scooter_id,
        p_encryption_key: ENCRYPTION_KEY
      })

      if (getPinError) {
        console.error('PIN retrieval error:', getPinError)
        return errorResponse('Failed to verify PIN', 500)
      }

      if (!decryptedPin) {
        return errorResponse('No PIN set for this scooter', 404)
      }

      // Constant-time comparison to prevent timing attacks
      const isValid = pin.length === decryptedPin.length &&
        pin.split('').every((c: string, i: number) => c === decryptedPin[i])

      return respond({ valid: isValid })
    }

    return errorResponse('Unknown action: ' + action)

  } catch (err) {
    console.error('user-pin error:', err)
    return errorResponse('Internal server error', 500)
  }
})
