// Supabase Edge Function for Device Token Registration
// Deploy with: supabase functions deploy register-device --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Stores/updates FCM device tokens in Supabase for custom push notifications.
// Any authenticated user can register their device (not admin-only).
//
// Actions:
//   register   — upsert FCM token for user+device combination
//   unregister — remove device token on logout

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

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, session_token, fcm_token, device_fingerprint, device_name, app_version } = body

    if (!action) return errorResponse('Missing action')
    if (!session_token) return errorResponse('Missing session_token')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Authenticate user (any role)
    const user = await authenticateUser(supabase, session_token)
    if (!user) return errorResponse('Invalid or expired session', 401)

    switch (action) {
      case 'register': {
        if (!fcm_token) return errorResponse('Missing fcm_token')
        if (!device_fingerprint) return errorResponse('Missing device_fingerprint')

        const { error } = await supabase
          .from('device_tokens')
          .upsert({
            user_id: user.id,
            fcm_token,
            device_fingerprint,
            device_name: device_name || null,
            platform: 'android',
            app_version: app_version || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_id,device_fingerprint',
          })

        if (error) {
          console.error('Token registration error:', error)
          return errorResponse('Failed to register device token')
        }

        return respond({ success: true })
      }

      case 'unregister': {
        if (!device_fingerprint) return errorResponse('Missing device_fingerprint')

        const { error } = await supabase
          .from('device_tokens')
          .delete()
          .eq('user_id', user.id)
          .eq('device_fingerprint', device_fingerprint)

        if (error) {
          console.error('Token unregister error:', error)
          return errorResponse('Failed to unregister device token')
        }

        return respond({ success: true })
      }

      default:
        return errorResponse('Unknown action: ' + action)
    }

  } catch (error) {
    console.error('register-device error:', error)
    return errorResponse(error.message || 'Internal error', 500)
  }
})
