// Supabase Edge Function for User Registration (with Scooter)
// Deploy with: supabase functions deploy register-user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || "noreply@pureelectric.com"

interface RegisterUserRequest {
  email: string
  password: string
  first_name?: string
  last_name?: string
  age_range?: string
  gender?: string
  scooter_use_type?: string
  home_country?: string       // ISO 3166-1 alpha-2, from country detection
  current_country?: string    // ISO 3166-1 alpha-2, from GPS/cell

  // Scooter information (required for user registration)
  scooter_serial: string
  scooter_id?: string  // UUID if known

  // Telemetry data captured during connection
  telemetry?: {
    odometer_km?: number
    battery_soc?: number
    charge_cycles?: number
    discharge_cycles?: number
    controller_hw_version?: string
    controller_sw_version?: string
    bms_hw_version?: string
    bms_sw_version?: string
  }
}

async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return await bcrypt.hash(password, salt)
}

function generateToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sendVerificationEmail(email: string, token: string, appUrl: string) {
  const verificationUrl = `${appUrl}/functions/v1/verify?token=${token}`

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
            <h2>Welcome to Pure Electric!</h2>
            <p>Thank you for registering your scooter. Please verify your email address by clicking the link below:</p>
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
                This link will expire in 24 hours. If you didn't register, please ignore this email.
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

    const body: RegisterUserRequest = await req.json()
    const {
      email,
      password,
      first_name,
      last_name,
      age_range,
      gender,
      scooter_use_type,
      home_country,
      current_country,
      scooter_serial,
      scooter_id,
      telemetry
    } = body

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    if (!scooter_serial) {
      return new Response(
        JSON.stringify({ error: 'Scooter serial required for user registration' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

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
        { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Find or create scooter record
    let resolvedScooterId = scooter_id

    if (!resolvedScooterId) {
      // Look up scooter by serial
      const { data: existingScooter } = await supabase
        .from('scooters')
        .select('id')
        .eq('zyd_serial', scooter_serial)
        .single()

      if (existingScooter) {
        resolvedScooterId = existingScooter.id
      } else {
        // Scooter must be scanned by a distributor before a user can register it
        return new Response(
          JSON.stringify({ error: 'Scooter not found. The scooter must be scanned by a distributor before registration.' }),
          { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
        )
      }
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
        first_name: first_name || null,
        last_name: last_name || null,
        age_range: age_range || null,
        gender: gender || null,
        scooter_use_type: scooter_use_type || null,
        home_country: home_country || null,
        current_country: current_country || null,
        roles: ['customer'],
        user_level: 'normal',
        registration_type: 'user',
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
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      )
    }

    // Link scooter to user
    const { error: linkError } = await supabase
      .rpc('add_scooter_to_user', {
        p_user_id: newUser.id,
        p_scooter_id: resolvedScooterId,
        p_zyd_serial: scooter_serial,
        p_telemetry: telemetry || {}
      })

    if (linkError) {
      console.error('Failed to link scooter:', linkError)
      // Don't fail registration, just log the error
    }

    // Send verification email (non-fatal — don't fail registration if email fails)
    let emailSent = false
    try {
      const appUrl = Deno.env.get('APP_URL') || supabaseUrl.replace('/rest/v1', '')
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
        user_id: newUser.id,
        email_sent: emailSent
      }),
      { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )

  } catch (error) {
    console.error('Registration error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Registration failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    )
  }
})
