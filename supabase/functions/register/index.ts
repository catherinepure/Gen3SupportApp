// Supabase Edge Function for User Registration
// Deploy with: supabase functions deploy register

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || "noreply@pureelectric.com"

interface RegisterRequest {
  email: string
  password: string
  home_country?: string       // ISO 3166-1 alpha-2
  current_country?: string    // ISO 3166-1 alpha-2
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
    const { email, password, home_country, current_country }: RegisterRequest = await req.json()

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return new Response(
        JSON.stringify({ error: 'Email already registered' }),
        { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Hash password and generate token
    const passwordHash = await hashPassword(password)
    const verificationToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    // Create user
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        user_level: 'user',
        roles: ['customer'],
        home_country: home_country || null,
        current_country: current_country || null,
        is_verified: false,
        verification_token: verificationToken,
        verification_token_expires: expiresAt.toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Send verification email (non-fatal — don't fail registration if email fails)
    let emailSent = false
    try {
      const appUrl = Deno.env.get('APP_URL') || supabaseUrl
      await sendVerificationEmail(email, verificationToken, appUrl)
      emailSent = true
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: emailSent
          ? 'Registration successful. Please check your email to verify your account.'
          : 'Registration successful. Verification email could not be sent — please use "Resend Verification" from the login screen.',
        email_sent: emailSent
      }),
      { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Registration error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Registration failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
