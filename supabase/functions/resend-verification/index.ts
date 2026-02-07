// Supabase Edge Function for Resending Verification Email
// Deploy with: supabase functions deploy resend-verification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || "noreply@pureelectric.com"

interface ResendRequest {
  email: string
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sendVerificationEmail(email: string, token: string, appUrl: string) {
  const verificationUrl = `${appUrl}/supabase/functions/verify?token=${token}`

  const emailContent = {
    personalizations: [{
      to: [{ email }],
      subject: 'Verify your Pure Electric account'
    }],
    from: { email: FROM_EMAIL },
    content: [{
      type: 'text/html',
      value: `
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Welcome to Pure Electric Firmware Updater</h2>
            <p>Thank you for registering! Please verify your email address by clicking the link below:</p>
            <p>
                <a href="${verificationUrl}"
                   style="background-color: #4CAF50; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; display: inline-block;">
                    Verify Email Address
                </a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="color: #666;">${verificationUrl}</p>
            <p style="margin-top: 30px; color: #999; font-size: 12px;">
                This link will expire in 24 hours. If you didn't create this account, please ignore this email.
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
    throw new Error('Failed to send verification email')
  }

  return true
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
    const { email }: ResendRequest = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find unverified user
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, is_verified')
      .eq('email', email.toLowerCase())
      .single()

    // Don't reveal if email exists (security best practice)
    if (findError || !user) {
      return new Response(
        JSON.stringify({ message: 'If the email exists, a verification link has been sent' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (user.is_verified) {
      return new Response(
        JSON.stringify({ message: 'Email already verified' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Generate new token
    const verificationToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    const { error: updateError } = await supabase
      .from('users')
      .update({
        verification_token: verificationToken,
        verification_token_expires: expiresAt.toISOString()
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update verification token' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Send email
    try {
      const appUrl = Deno.env.get('APP_URL') || supabaseUrl
      await sendVerificationEmail(email, verificationToken, appUrl)
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
      return new Response(
        JSON.stringify({ error: 'Failed to send verification email. Please try again later.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    return new Response(
      JSON.stringify({ message: 'Verification email sent' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Resend verification error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to resend verification' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
