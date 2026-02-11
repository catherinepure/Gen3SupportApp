// Supabase Edge Function for Sending Push Notifications via FCM
// Deploy with: supabase functions deploy send-notification --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Called server-to-server by the admin Edge Function.
// Auth: requires service role key in Authorization header.
//
// Flow:
// 1. Load notification record from push_notifications table
// 2. Resolve target device tokens (all / by user / by role)
// 3. Get Firebase OAuth2 access token (signed JWT from service account)
// 4. Send data-only FCM messages to each token
// 5. Clean up invalid tokens, update notification status

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FIREBASE_PROJECT_ID = 'pure-app-2026'

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400) {
  return respond({ error: message }, status)
}

// ============================================================
// Firebase Authentication (JWT → OAuth2 access token)
// ============================================================

function base64url(data: Uint8Array): string {
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function base64urlEncode(str: string): string {
  return base64url(new TextEncoder().encode(str))
}

/**
 * Import a PEM-encoded RSA private key for RS256 signing.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and newlines
  const pemBody = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryDer = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    binaryDer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

/**
 * Create a signed JWT and exchange it for a Firebase OAuth2 access token.
 */
async function getFirebaseAccessToken(): Promise<string> {
  const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON')
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON secret not configured')
  }

  const serviceAccount = JSON.parse(serviceAccountJson)
  const now = Math.floor(Date.now() / 1000)

  // JWT header + claims
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64urlEncode(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))

  // Sign with service account private key
  const signingInput = `${header}.${claims}`
  const key = await importPrivateKey(serviceAccount.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const jwt = `${signingInput}.${base64url(new Uint8Array(signature))}`

  // Exchange JWT for OAuth2 access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!tokenResponse.ok) {
    const err = await tokenResponse.text()
    throw new Error('Failed to get Firebase access token: ' + err)
  }

  const { access_token } = await tokenResponse.json()
  return access_token
}

// ============================================================
// FCM Message Sending
// ============================================================

interface SendResult {
  success: boolean
  tokenId: string
  error?: string
}

/**
 * Send a single data-only FCM message. Returns false if token is invalid.
 */
async function sendFCMMessage(
  accessToken: string,
  fcmToken: string,
  data: Record<string, string>
): Promise<{ success: boolean; unregistered: boolean }> {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data,
        },
      }),
    }
  )

  if (response.ok) {
    return { success: true, unregistered: false }
  }

  const error = await response.json().catch(() => ({}))
  const errorCode = error?.error?.details?.[0]?.errorCode ||
                    error?.error?.status || ''

  // Token is invalid — should be cleaned up
  if (errorCode === 'UNREGISTERED' || errorCode === 'NOT_FOUND') {
    console.warn(`Token unregistered: ${fcmToken.substring(0, 20)}...`)
    return { success: false, unregistered: true }
  }

  console.error(`FCM send error:`, JSON.stringify(error))
  return { success: false, unregistered: false }
}

// ============================================================
// Main Handler
// ============================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { notification_id } = body

    if (!notification_id) return errorResponse('Missing notification_id')

    // Verify service role auth (internal call from admin function)
    const authHeader = req.headers.get('Authorization') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    if (!authHeader.includes(supabaseServiceKey)) {
      return errorResponse('Service role required', 403)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      supabaseServiceKey
    )

    // Load notification record
    const { data: notification, error: loadError } = await supabase
      .from('push_notifications')
      .select('*')
      .eq('id', notification_id)
      .single()

    if (loadError || !notification) {
      return errorResponse('Notification not found: ' + (loadError?.message || notification_id), 404)
    }

    // Update status to 'sending'
    await supabase.from('push_notifications')
      .update({ status: 'sending' })
      .eq('id', notification_id)

    // Resolve target device tokens
    let tokens: any[] = []

    if (notification.target_type === 'user') {
      const { data } = await supabase
        .from('device_tokens')
        .select('id, fcm_token, user_id')
        .eq('user_id', notification.target_value)

      tokens = data || []

    } else if (notification.target_type === 'role') {
      // Get user IDs for the target role
      const { data: roleUsers } = await supabase
        .from('users')
        .select('id')
        .eq('user_level', notification.target_value)
        .eq('is_active', true)

      if (roleUsers && roleUsers.length > 0) {
        const userIds = roleUsers.map((u: any) => u.id)
        const { data } = await supabase
          .from('device_tokens')
          .select('id, fcm_token, user_id')
          .in('user_id', userIds)

        tokens = data || []
      }

    } else if (notification.target_type === 'hw_version') {
      // Find users who own scooters with matching controller hardware version
      const hwVersion = notification.target_value
      if (hwVersion) {
        // Get scooter IDs with this HW version
        const { data: scooters } = await supabase
          .from('scooters')
          .select('id')
          .eq('controller_hw_version', hwVersion)

        if (scooters && scooters.length > 0) {
          const scooterIds = scooters.map((s: any) => s.id)
          // Get user IDs from user_scooters junction
          const { data: userScooters } = await supabase
            .from('user_scooters')
            .select('user_id')
            .in('scooter_id', scooterIds)

          if (userScooters && userScooters.length > 0) {
            const userIds = [...new Set(userScooters.map((us: any) => us.user_id))]
            const { data } = await supabase
              .from('device_tokens')
              .select('id, fcm_token, user_id')
              .in('user_id', userIds)

            tokens = data || []
          }
        }
      }

    } else if (notification.target_type === 'scooter_owner') {
      // Find owner(s) of a specific scooter
      const scooterId = notification.target_value
      if (scooterId) {
        const { data: userScooters } = await supabase
          .from('user_scooters')
          .select('user_id')
          .eq('scooter_id', scooterId)

        if (userScooters && userScooters.length > 0) {
          const userIds = userScooters.map((us: any) => us.user_id)
          const { data } = await supabase
            .from('device_tokens')
            .select('id, fcm_token, user_id')
            .in('user_id', userIds)

          tokens = data || []
        }
      }

    } else {
      // target_type === 'all'
      const { data } = await supabase
        .from('device_tokens')
        .select('id, fcm_token, user_id')

      tokens = data || []
    }

    if (tokens.length === 0) {
      await supabase.from('push_notifications')
        .update({
          status: 'completed',
          total_recipients: 0,
          success_count: 0,
          failure_count: 0,
        })
        .eq('id', notification_id)

      return respond({ success: true, sent: 0, failed: 0 })
    }

    // Get Firebase access token
    const accessToken = await getFirebaseAccessToken()

    // Resolve template placeholders
    const templateData = notification.template_data || {}
    const hasPlaceholders = /\{\{[^}]+\}\}/.test(notification.title + notification.body)

    // Pre-resolve global (non-per-user) placeholders from template_data
    function resolveGlobalPlaceholders(text: string): string {
      let resolved = text
      for (const [key, value] of Object.entries(templateData)) {
        // Skip per-user keys — these are resolved per-recipient
        if (['user_name', 'user_email'].includes(key)) continue
        const placeholder = `{{${key}}}`
        const replacement = String(value || '')
        resolved = resolved.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), replacement)
      }
      return resolved
    }

    const globalTitle = resolveGlobalPlaceholders(notification.title)
    const globalBody = resolveGlobalPlaceholders(notification.body)

    // Check if per-user placeholders remain
    const hasPerUserPlaceholders = /\{\{user_name\}\}|\{\{user_email\}\}/.test(globalTitle + globalBody)

    // Fetch user details if per-user placeholders are used
    let userDetailsMap: Record<string, { first_name: string; email: string }> = {}
    if (hasPerUserPlaceholders) {
      const uniqueUserIds = [...new Set(tokens.map((t: any) => t.user_id).filter(Boolean))]
      if (uniqueUserIds.length > 0) {
        const { data: users } = await supabase
          .from('users')
          .select('id, first_name, email')
          .in('id', uniqueUserIds)

        if (users) {
          for (const u of users) {
            userDetailsMap[u.id] = { first_name: u.first_name || '', email: u.email || '' }
          }
        }
      }
    }

    // Send to each token (sequential to avoid rate limits)
    let successCount = 0
    let failureCount = 0
    const invalidTokenIds: string[] = []

    for (const tokenRecord of tokens) {
      // Resolve per-user placeholders for this recipient
      let finalTitle = globalTitle
      let finalBody = globalBody

      if (hasPerUserPlaceholders && tokenRecord.user_id) {
        const userInfo = userDetailsMap[tokenRecord.user_id] || { first_name: '', email: '' }
        finalTitle = finalTitle.replace(/\{\{user_name\}\}/g, userInfo.first_name)
        finalBody = finalBody.replace(/\{\{user_name\}\}/g, userInfo.first_name)
        finalTitle = finalTitle.replace(/\{\{user_email\}\}/g, userInfo.email)
        finalBody = finalBody.replace(/\{\{user_email\}\}/g, userInfo.email)
      }

      // Strip any remaining unresolved placeholders
      finalTitle = finalTitle.replace(/\{\{[^}]+\}\}/g, '')
      finalBody = finalBody.replace(/\{\{[^}]+\}\}/g, '')

      // Build FCM data payload
      const fcmData: Record<string, string> = {
        source: 'pure_custom',
        notification_id: notification.id,
        title: finalTitle,
        body: finalBody,
        action: notification.action || 'none',
      }

      const result = await sendFCMMessage(accessToken, tokenRecord.fcm_token, fcmData)
      if (result.success) {
        successCount++
      } else {
        failureCount++
        if (result.unregistered) {
          invalidTokenIds.push(tokenRecord.id)
        }
      }
    }

    // Clean up invalid tokens
    if (invalidTokenIds.length > 0) {
      await supabase.from('device_tokens')
        .delete()
        .in('id', invalidTokenIds)

      console.log(`Cleaned up ${invalidTokenIds.length} invalid token(s)`)
    }

    // Update notification record with results
    await supabase.from('push_notifications')
      .update({
        status: 'completed',
        total_recipients: tokens.length,
        success_count: successCount,
        failure_count: failureCount,
      })
      .eq('id', notification_id)

    return respond({ success: true, sent: successCount, failed: failureCount })

  } catch (error) {
    console.error('send-notification error:', error)

    // Try to update notification status to failed
    try {
      const body = await req.clone().json().catch(() => ({}))
      if (body.notification_id) {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await supabase.from('push_notifications')
          .update({
            status: 'failed',
            error_details: { message: error.message || 'Unknown error' },
          })
          .eq('id', body.notification_id)
      }
    } catch (_) { /* best effort */ }

    return errorResponse(error.message || 'Internal error', 500)
  }
})
