// Supabase Edge Function for User Logout
// Deploy with: supabase functions deploy logout

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface LogoutRequest {
  session_token: string
}

// Origin validation
const ALLOWED_ORIGINS: string[] = (() => {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  if (env) return env.split(',').map(o => o.trim()).filter(Boolean)
  return []
})()

function validateOrigin(req: Request): string | null {
  if (ALLOWED_ORIGINS.length === 0) return null
  const origin = req.headers.get('Origin') || req.headers.get('Referer')
  if (!origin) return null
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
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Session-Token',
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
    const body = await req.json().catch(() => ({}))
    // Prefer X-Session-Token header, fall back to body
    const headerToken = req.headers.get('X-Session-Token')
    const session_token = headerToken || body.session_token

    if (!session_token) {
      return new Response(
        JSON.stringify({ error: 'Session token required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Delete the session
    const { error: deleteError } = await supabase
      .from('user_sessions')
      .delete()
      .eq('session_token', session_token)

    if (deleteError) {
      console.error('Logout error:', deleteError)
      return new Response(
        JSON.stringify({ error: 'Failed to logout' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Logged out successfully' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )

  } catch (error) {
    console.error('Logout error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Logout failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )
  }
})
