// Supabase Edge Function for Email Change
// Deploy with: supabase functions deploy change-email --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Handles email change flow:
//   request-change  — sends 6-digit code to CURRENT email, stores pending request
//   verify-change   — validates code, updates email in users table

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
}

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@pureelectric.com'

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
    .select('id, email')
    .eq('id', session.user_id)
    .single()

  return user
}

function generateCode(): string {
  const digits = '0123456789'
  let code = ''
  const array = new Uint8Array(6)
  crypto.getRandomValues(array)
  for (let i = 0; i < 6; i++) {
    code += digits[array[i] % 10]
  }
  return code
}

async function hashCode(code: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(code)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

async function sendVerificationEmail(toEmail: string, code: string) {
  console.log(`Sending email change verification code to ${toEmail}`)

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: FROM_EMAIL, name: 'Pure Electric' },
      subject: 'Email Change Verification Code',
      content: [{
        type: 'text/html',
        value: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <h2 style="color: #1565C0;">Email Change Request</h2>
            <p>You requested to change your email address on your Pure Electric account.</p>
            <p>Your verification code is:</p>
            <div style="background: #f0f4f8; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1565C0;">${code}</span>
            </div>
            <p>This code expires in <strong>30 minutes</strong>.</p>
            <p style="color: #666;">If you did not request this change, please ignore this email. Your account is safe.</p>
          </div>
        `
      }]
    })
  })

  if (!response.ok) {
    const text = await response.text()
    console.error('SendGrid error:', response.status, text)
    throw new Error('Failed to send email')
  }

  console.log('Verification email sent successfully')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const body = await req.json()
    const { action, session_token } = body

    // Authenticate
    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return errorResponse('Not authenticated', 401)
    }

    // ==========================================
    // REQUEST-CHANGE
    // ==========================================
    if (action === 'request-change') {
      const { new_email } = body

      if (!new_email || !new_email.includes('@')) {
        return errorResponse('Valid email address required')
      }

      if (new_email.toLowerCase() === user.email.toLowerCase()) {
        return errorResponse('New email must be different from current email')
      }

      // Check if email is already in use
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('email', new_email.toLowerCase())
        .single()

      if (existing) {
        return errorResponse('This email address is already in use')
      }

      // Rate limit: 1 request per 5 minutes
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      const { data: recentRequests } = await supabase
        .from('email_change_requests')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', fiveMinAgo)
        .is('used_at', null)

      if (recentRequests && recentRequests.length > 0) {
        return errorResponse('Please wait 5 minutes before requesting another code', 429)
      }

      // Generate code and store request
      const code = generateCode()
      const codeHash = await hashCode(code)
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 minutes

      const { error: insertError } = await supabase
        .from('email_change_requests')
        .insert({
          user_id: user.id,
          new_email: new_email.toLowerCase(),
          token_hash: codeHash,
          expires_at: expiresAt,
        })

      if (insertError) {
        console.error('Insert error:', insertError)
        return errorResponse('Failed to create change request', 500)
      }

      // Send verification email to CURRENT email
      await sendVerificationEmail(user.email, code)

      return respond({ success: true, message: 'Verification code sent to your current email' })
    }

    // ==========================================
    // VERIFY-CHANGE
    // ==========================================
    if (action === 'verify-change') {
      const { code, new_email } = body

      if (!code || code.length !== 6) {
        return errorResponse('6-digit verification code required')
      }

      if (!new_email) {
        return errorResponse('New email is required')
      }

      const codeHash = await hashCode(code)

      // Find matching request
      const { data: request } = await supabase
        .from('email_change_requests')
        .select('*')
        .eq('user_id', user.id)
        .eq('new_email', new_email.toLowerCase())
        .eq('token_hash', codeHash)
        .is('used_at', null)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!request) {
        return errorResponse('Invalid or expired verification code', 400)
      }

      // Mark request as used
      await supabase
        .from('email_change_requests')
        .update({ used_at: new Date().toISOString() })
        .eq('id', request.id)

      // Update email in users table
      const { error: updateError } = await supabase
        .from('users')
        .update({ email: new_email.toLowerCase() })
        .eq('id', user.id)

      if (updateError) {
        console.error('Email update error:', updateError)
        return errorResponse('Failed to update email', 500)
      }

      console.log(`Email changed for user ${user.id}: ${user.email} → ${new_email}`)

      return respond({ success: true, message: 'Email changed successfully' })
    }

    return errorResponse('Unknown action: ' + action)

  } catch (err) {
    console.error('Error:', err)
    return errorResponse('Internal server error: ' + (err as Error).message, 500)
  }
})
