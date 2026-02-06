// Supabase Edge Function for Session Validation
// Deploy with: supabase functions deploy validate-session

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface ValidateRequest {
  session_token: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const { session_token }: ValidateRequest = await req.json()

    if (!session_token) {
      return new Response(
        JSON.stringify({ error: 'Session token required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find active session
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('user_id, expires_at')
      .eq('session_token', session_token)
      .single()

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Check if expired
    const expiresAt = new Date(session.expires_at)
    if (new Date() > expiresAt) {
      // Clean up expired session
      await supabase
        .from('user_sessions')
        .delete()
        .eq('session_token', session_token)

      return new Response(
        JSON.stringify({ error: 'Session expired' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Get user info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, user_level, roles, is_active, distributor_id, workshop_id, home_country, current_country')
      .eq('id', session.user_id)
      .single()

    if (userError || !user || !user.is_active) {
      return new Response(
        JSON.stringify({ error: 'User not found or inactive' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Update last activity
    await supabase
      .from('user_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('session_token', session_token)

    return new Response(
      JSON.stringify({
        valid: true,
        user: {
          id: user.id,
          email: user.email,
          role: user.user_level,
          roles: user.roles || [],
          distributor_id: user.distributor_id,
          workshop_id: user.workshop_id,
          home_country: user.home_country,
          current_country: user.current_country
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Validation error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Validation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
