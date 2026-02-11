// Supabase Edge Function for User PIN Operations
// Deploy with: supabase functions deploy user-pin --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Handles PIN check/set/verify for authenticated users on their own scooters.
// Unlike the admin endpoint, this works for normal users (not just admin/manager).
//
// Actions:
//   check-pin   — returns { has_pin: boolean } for a scooter the user owns
//   set-pin     — sets a 6-digit PIN on a scooter the user owns
//   verify-pin  — verifies a PIN against the stored encrypted PIN
//   recover-pin — sends PIN reset link to user's email (requires email+password)

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

/**
 * Authenticate a user via session token. Works for ALL user levels.
 * Returns user with user_level to check admin/manager status.
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
    .select('id, email, is_active, user_level')
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

/**
 * Send PIN recovery email via SendGrid.
 */
async function sendRecoveryEmail(email: string, recoveryLink: string): Promise<void> {
  const emailContent = {
    personalizations: [{
      to: [{ email }],
      subject: 'Reset Your Scooter PIN'
    }],
    from: { email: FROM_EMAIL, name: 'Pure Electric' },
    content: [{
      type: 'text/html',
      value: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white !important; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">🔐 Reset Your Scooter PIN</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset your scooter PIN. Click the button below to set a new PIN:</p>
              <div style="text-align: center;">
                <a href="${recoveryLink}" class="button">Reset PIN</a>
              </div>
              <p><strong>This link will expire in 1 hour</strong> for security purposes.</p>
              <p>If you didn't request a PIN reset, you can safely ignore this email. Your PIN will remain unchanged.</p>
              <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 13px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${recoveryLink}" style="color: #667eea; word-break: break-all;">${recoveryLink}</a>
              </p>
            </div>
            <div class="footer">
              <p>Pure Electric - Scooter Management System</p>
            </div>
          </div>
        </body>
        </html>
      `
    }]
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(emailContent)
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('SendGrid error:', error)
    throw new Error('Failed to send PIN recovery email')
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action } = body

    if (!action) {
      return errorResponse('Action required')
    }

    // Initialize Supabase client with service role for DB function access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // ================================================================
    // ACTION: request-recovery — Send PIN recovery email (no auth needed)
    // ================================================================
    if (action === 'request-recovery') {
      const { email, scooter_id } = body

      if (!email) {
        return errorResponse('Email required')
      }

      // Find user by email
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email')
        .eq('email', email.toLowerCase())
        .eq('is_active', true)
        .single()

      if (userError || !user) {
        // Don't reveal if email doesn't exist (security)
        return respond({ success: true, message: 'If that email is registered, recovery link sent' })
      }

      // Generate recovery token (valid for 1 hour)
      const recoveryToken = crypto.randomUUID()
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

      // Store recovery token
      const { error: tokenError } = await supabase
        .from('pin_recovery_tokens')
        .insert({
          token: recoveryToken,
          user_id: user.id,
          scooter_id: scooter_id,
          expires_at: expiresAt,
          created_at: new Date().toISOString()
        })

      if (tokenError) {
        console.error('Token storage error:', tokenError)
        return respond({ success: true, message: 'If that email is registered, recovery link sent' })
      }

      // Generate recovery link
      const baseUrl = Deno.env.get('WEB_ADMIN_URL') || 'https://ives.org.uk/app2026'
      const recoveryLink = `${baseUrl}/pin-recovery.html?token=${recoveryToken}`

      // Send PIN recovery email via SendGrid
      try {
        await sendRecoveryEmail(user.email, recoveryLink)
        console.log(`PIN recovery email sent to ${email}`)
      } catch (emailError) {
        console.error('Failed to send recovery email:', emailError)
        // Don't fail the request if email fails - token is still valid
      }

      return respond({ success: true, message: 'If that email is registered, recovery link sent' })
    }

    // ================================================================
    // ACTION: reset-pin — Reset PIN using recovery token (no auth needed)
    // ================================================================
    if (action === 'reset-pin') {
      const { token, new_pin } = body

      if (!token || !new_pin) {
        return errorResponse('Token and new PIN required')
      }

      if (!/^\d{6}$/.test(new_pin)) {
        return errorResponse('PIN must be exactly 6 digits')
      }

      // Verify recovery token
      const { data: recoveryToken, error: tokenError } = await supabase
        .from('pin_recovery_tokens')
        .select('user_id, scooter_id, expires_at, used')
        .eq('token', token)
        .single()

      if (tokenError || !recoveryToken) {
        return errorResponse('Invalid or expired recovery token', 401)
      }

      if (recoveryToken.used) {
        return errorResponse('Recovery token has already been used', 401)
      }

      if (new Date() > new Date(recoveryToken.expires_at)) {
        return errorResponse('Recovery token has expired', 401)
      }

      const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
      if (!ENCRYPTION_KEY) {
        console.error('PIN_ENCRYPTION_KEY not configured')
        return errorResponse('PIN encryption not configured', 500)
      }

      // Set the new PIN
      const { error: setPinError } = await supabase.rpc('set_scooter_pin', {
        p_scooter_id: recoveryToken.scooter_id,
        p_pin: new_pin,
        p_user_id: recoveryToken.user_id,
        p_encryption_key: ENCRYPTION_KEY
      })

      if (setPinError) {
        console.error('PIN reset error:', setPinError)
        return errorResponse('Failed to reset PIN: ' + setPinError.message, 500)
      }

      // Mark token as used
      await supabase
        .from('pin_recovery_tokens')
        .update({ used: true, used_at: new Date().toISOString() })
        .eq('token', token)

      return respond({ success: true, message: 'PIN successfully reset' })
    }

    // All other actions require authentication
    const { session_token, scooter_id } = body

    if (!session_token) {
      return errorResponse('Session token required', 401)
    }

    if (!scooter_id) {
      return errorResponse('Scooter ID required')
    }

    // Authenticate user (any level, not just admin)
    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return errorResponse('Authentication failed', 401)
    }

    // Check if user is admin/manager (they can manage all scooters)
    const isAdmin = user.user_level === 'admin' || user.user_level === 'manager'
    console.log(`User ${user.id} (${user.email}) level: ${user.user_level}, isAdmin: ${isAdmin}`)

    // Verify ownership (skip for admins/managers)
    if (!isAdmin) {
      console.log(`Verifying ownership for user ${user.id} and scooter ${scooter_id}`)
      const isOwner = await verifyOwnership(supabase, user.id, scooter_id)
      console.log(`Ownership check result: ${isOwner}`)
      if (!isOwner) {
        return errorResponse('You do not own this scooter', 403)
      }
    } else {
      console.log(`Admin user ${user.email} bypassing ownership check for scooter ${scooter_id}`)
    }

    // ================================================================
    // ACTION: check-pin — Does this scooter have a PIN set?
    // ================================================================
    if (action === 'check-pin') {
      console.log(`Checking PIN for scooter: ${scooter_id}`)
      const { data: scooter, error } = await supabase
        .from('scooters')
        .select('pin_encrypted')
        .eq('id', scooter_id)
        .single()

      if (error) {
        console.error('Scooter lookup error:', error)
        return errorResponse(`Scooter not found: ${error.message}`, 404)
      }

      if (!scooter) {
        console.error('Scooter not found in database')
        return errorResponse('Scooter not found', 404)
      }

      console.log(`Scooter found, has_pin: ${!!scooter.pin_encrypted}`)
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

      // First verify the scooter exists
      console.log(`Setting PIN for scooter: ${scooter_id}`)
      const { data: scooterCheck, error: scooterError } = await supabase
        .from('scooters')
        .select('id')
        .eq('id', scooter_id)
        .single()

      if (scooterError || !scooterCheck) {
        console.error('Scooter lookup failed:', scooterError)
        return errorResponse(`Scooter not found: ${scooterError?.message || 'unknown'}`, 404)
      }

      const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
      if (!ENCRYPTION_KEY) {
        console.error('PIN_ENCRYPTION_KEY not configured')
        return errorResponse('PIN encryption not configured', 500)
      }

      console.log(`Calling set_scooter_pin RPC for scooter ${scooter_id}, user ${user.id}`)
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

      console.log(`PIN set successfully for scooter ${scooter_id}`)
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

      // Rate limit: max 5 failed attempts per scooter per 15 minutes
      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString()
      const { data: recentFailures, error: rateError } = await supabase
        .from('pin_verification_attempts')
        .select('id')
        .eq('scooter_id', scooter_id)
        .eq('success', false)
        .gte('attempted_at', fifteenMinAgo)

      if (!rateError && recentFailures && recentFailures.length >= 5) {
        console.warn(`PIN rate limit hit for scooter ${scooter_id} by user ${user.id}`)
        return errorResponse('Too many failed attempts. Please wait 15 minutes before trying again.', 429)
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

      // Log the attempt for rate limiting
      try {
        await supabase
          .from('pin_verification_attempts')
          .insert({
            scooter_id: scooter_id,
            user_id: user.id,
            success: isValid,
            attempted_at: new Date().toISOString()
          })
      } catch (logErr) {
        // Don't fail the request if logging fails — table may not exist yet
        console.warn('Failed to log PIN attempt (table may not exist):', logErr)
      }

      return respond({ valid: isValid })
    }

    // ================================================================
    // ACTION: clear-pin — Remove PIN from scooter (admin/manager only)
    // ================================================================
    if (action === 'clear-pin') {
      if (!isAdmin) {
        return errorResponse('Only admin/manager users can clear PINs', 403)
      }

      console.log(`Clearing PIN for scooter: ${scooter_id}`)
      const { error: clearError } = await supabase.rpc('clear_scooter_pin', {
        p_scooter_id: scooter_id
      })

      if (clearError) {
        console.error('PIN clear error:', clearError)
        return errorResponse('Failed to clear PIN: ' + clearError.message, 500)
      }

      console.log(`PIN cleared for scooter ${scooter_id}`)
      return respond({ success: true, message: 'PIN cleared successfully' })
    }

    return errorResponse('Unknown action: ' + action)

  } catch (err) {
    console.error('user-pin error:', err)
    return errorResponse('Internal server error', 500)
  }
})
