import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || 'noreply@pureelectric.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendPasswordResetEmail(email: string, firstName: string, resetUrl: string) {
  const emailContent = {
    personalizations: [{
      to: [{ email }],
      subject: 'Reset Your Password - Gen3 Admin'
    }],
    from: { email: FROM_EMAIL },
    content: [{
      type: 'text/html',
      value: `
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Password Reset Request</h2>
            <p>Hi ${firstName},</p>
            <p>You requested to reset your password for Gen3 Admin. Click the button below to reset it:</p>
            <p>
                <a href="${resetUrl}"
                   style="background-color: #4CAF50; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Reset Password
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666; word-break: break-all;">${resetUrl}</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
                This link will expire in 1 hour. If you didn't request this password reset, please ignore this email.
            </p>
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
    throw new Error('Failed to send password reset email')
  }

  return true
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, email, token, new_password } = await req.json()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // =======================================================================
    // ACTION: Request Password Reset
    // =======================================================================
    if (action === 'request') {
      if (!email) {
        return new Response(
          JSON.stringify({ error: 'Email is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check if user exists
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, email, first_name')
        .eq('email', email)
        .eq('is_active', true)
        .single()

      if (userError || !user) {
        // Don't reveal if user exists - security best practice
        return new Response(
          JSON.stringify({ success: true, message: 'If that email exists, a reset link has been sent' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Generate reset token (crypto-random)
      const resetToken = crypto.randomUUID()
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 1) // 1 hour expiry

      // Store reset token
      const { error: tokenError } = await supabase
        .from('password_reset_tokens')
        .insert({
          user_id: user.id,
          token: resetToken,
          reset_token: resetToken,
          expires_at: expiresAt.toISOString(),
          used: false
        })

      if (tokenError) {
        console.error('Failed to create reset token:', tokenError)
        return new Response(
          JSON.stringify({ error: 'Failed to generate reset token' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Send email via SendGrid
      const resetUrl = `https://ives.org.uk/app2026?token=${resetToken}`

      try {
        await sendPasswordResetEmail(user.email, user.first_name || 'there', resetUrl)
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError)
        // Continue anyway - user can still use the link if we log it
        console.log(`Password reset URL for ${user.email}: ${resetUrl}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Password reset link sent to your email',
          // Only include resetUrl in DEV mode for testing
          ...(Deno.env.get('ENVIRONMENT') === 'dev' && { resetUrl })
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // =======================================================================
    // ACTION: Reset Password
    // =======================================================================
    if (action === 'reset') {
      if (!token || !new_password) {
        return new Response(
          JSON.stringify({ error: 'Token and new password are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (new_password.length < 8) {
        return new Response(
          JSON.stringify({ error: 'Password must be at least 8 characters' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Verify token
      const { data: resetToken, error: tokenError } = await supabase
        .from('password_reset_tokens')
        .select('*')
        .eq('token', token)
        .eq('used', false)
        .single()

      if (tokenError || !resetToken) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired reset token' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Check expiry
      if (new Date(resetToken.expires_at) < new Date()) {
        return new Response(
          JSON.stringify({ error: 'Reset token has expired' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Hash new password
      const passwordHash = await hashPassword(new_password)

      // Update user password
      const { data: updateData, error: updateError } = await supabase
        .from('users')
        .update({
          password_hash: passwordHash,
          updated_at: new Date().toISOString()
        })
        .eq('id', resetToken.user_id)
        .select()

      if (updateError) {
        console.error('Failed to update password - Error details:', JSON.stringify(updateError))
        console.error('User ID:', resetToken.user_id)
        console.error('Token:', token)
        return new Response(
          JSON.stringify({
            error: 'Failed to update password',
            details: updateError.message || 'Unknown error'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('Password updated successfully for user:', resetToken.user_id)

      // Mark token as used
      await supabase
        .from('password_reset_tokens')
        .update({ used: true })
        .eq('token', token)

      return new Response(
        JSON.stringify({ success: true, message: 'Password reset successfully' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Password reset error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Hash password using Web Crypto API (same as login Edge Function)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}
