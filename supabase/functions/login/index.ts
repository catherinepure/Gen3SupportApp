// Supabase Edge Function for User Login
// Deploy with: supabase functions deploy login
//
// Supports bcrypt passwords (new) with SHA-256 fallback (legacy).
// On successful SHA-256 login, auto-migrates the password to bcrypt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

interface LoginRequest {
  email: string
  password: string
  device_info?: string
}

/** Legacy SHA-256 hash (for fallback comparison only) */
async function sha256Hash(password: string): Promise<string> {
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

// Origin validation: set ALLOWED_ORIGINS env var as comma-separated list.
// If not set, allows all origins (development mode).
const ALLOWED_ORIGINS: string[] = (() => {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  if (env) return env.split(',').map(o => o.trim()).filter(Boolean)
  return []
})()

function validateOrigin(req: Request): string | null {
  if (ALLOWED_ORIGINS.length === 0) return null
  const origin = req.headers.get('Origin') || req.headers.get('Referer')
  if (!origin) return null  // allow no-origin (mobile apps, server calls)
  const originUrl = origin.replace(/\/$/, '')
  for (const allowed of ALLOWED_ORIGINS) {
    if (originUrl === allowed.replace(/\/$/, '')) return null
    if (origin.startsWith(allowed.replace(/\/$/, ''))) return null
  }
  return `Origin '${origin}' is not allowed`
}

const corsOrigin = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      },
    })
  }

  try {
    // Validate origin
    const originError = validateOrigin(req)
    if (originError) {
      return new Response(
        JSON.stringify({ error: originError }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    const { email, password, device_info }: LoginRequest = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Fetch user by email (don't filter by password_hash - we need to check both bcrypt and sha256)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email, password_hash, user_level, roles, is_verified, is_active, distributor_id, workshop_id, first_name, last_name, home_country, current_country')
      .eq('email', email.toLowerCase())
      .single()

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Try bcrypt first (new passwords start with $2)
    let passwordValid = false
    let needsMigration = false

    if (user.password_hash.startsWith('$2')) {
      // Bcrypt hash
      passwordValid = await bcrypt.compare(password, user.password_hash)
    } else {
      // Legacy SHA-256 hash - try matching
      const sha256 = await sha256Hash(password)
      passwordValid = sha256 === user.password_hash
      if (passwordValid) {
        needsMigration = true
      }
    }

    if (!passwordValid) {
      return new Response(
        JSON.stringify({ error: 'Invalid email or password' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Check if account is active
    if (!user.is_active) {
      return new Response(
        JSON.stringify({ error: 'Account is disabled' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Check if email is verified
    if (!user.is_verified) {
      return new Response(
        JSON.stringify({ error: 'Please verify your email before logging in' }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Auto-migrate SHA-256 password to bcrypt on successful login
    if (needsMigration) {
      const salt = await bcrypt.genSalt(10)
      const bcryptHash = await bcrypt.hash(password, salt)
      await supabase.from('users')
        .update({ password_hash: bcryptHash })
        .eq('id', user.id)
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
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
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
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )

  } catch (error) {
    console.error('Login error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Login failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )
  }
})
