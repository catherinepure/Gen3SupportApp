// Supabase Edge Function for User Login
// Deploy with: supabase functions deploy login

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface LoginRequest {
  email: string
  password: string
  device_info?: string
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      },
    })
  }

  try {
    const { email, password, device_info }: LoginRequest = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Hash password and find user
    const passwordHash = await hashPassword(password)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, user_level, roles, is_verified, is_active, distributor_id, workshop_id, first_name, last_name, home_country, current_country')
      .eq('email', email.toLowerCase())
      .eq('password_hash', passwordHash)
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Check if account is active
    if (!user.is_active) {
      return new Response(
        JSON.stringify({ error: 'Account is disabled' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Check if email is verified
    if (!user.is_verified) {
      return new Response(
        JSON.stringify({ error: 'Please verify your email before logging in' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create session token
    const sessionToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 30) // 30 days

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert({
        user_id: user.id,
        session_token: sessionToken,
        device_info: device_info || 'Unknown',
        expires_at: expiresAt.toISOString()
      })

    if (sessionError) {
      console.error('Session creation error:', sessionError)
      return new Response(
        JSON.stringify({ error: 'Failed to create session' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date().toISOString() })
      .eq('id', user.id)

    // Get user's scooters
    const { data: userScooters } = await supabase
      .rpc('get_user_scooters', { p_user_id: user.id })

    return new Response(
      JSON.stringify({
        success: true,
        session_token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.user_level,
          roles: user.roles || [],
          distributor_id: user.distributor_id,
          workshop_id: user.workshop_id,
          first_name: user.first_name,
          last_name: user.last_name,
          home_country: user.home_country,
          current_country: user.current_country,
          scooters: userScooters || []
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Login failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
