// Supabase Edge Function for User Registration (account only, no scooter required)
// Deploy with: supabase functions deploy register --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || "noreply@pureelectric.com"

interface RegisterRequest {
  email: string
  password: string
  first_name?: string
  last_name?: string
  age_range?: string
  gender?: string
  scooter_use_type?: string
  home_country?: string
  current_country?: string
  // Location data (captured during registration)
  registration_latitude?: number
  registration_longitude?: number
  registration_accuracy?: number
  registration_location_method?: string
  registration_country?: string
  registration_region?: string
  registration_city?: string
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
            <p>Thank you for registering. Please verify your email address by clicking the link below:</p>
            <p>
                <a href="${verificationUrl}"
                   style="background-color: #1565C0; color: white; padding: 12px 24px;
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

function respond(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
  })
}

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
      return respond({ error: originError }, 403)
    }

    const body: RegisterRequest = await req.json()
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
      registration_latitude,
      registration_longitude,
      registration_accuracy,
      registration_location_method,
      registration_country,
      registration_region,
      registration_city,
    } = body

    // Validation
    if (!email || !password) {
      return respond({ error: 'Email and password required' }, 400)
    }

    if (password.length < 8) {
      return respond({ error: 'Password must be at least 8 characters' }, 400)
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
      return respond({ error: 'Email already registered' }, 409)
    }

    // Hash password with bcrypt and generate verification token
    const passwordHash = await hashPassword(password)
    const verificationToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    // Derive detected_region for T&C system from best available country source
    const detectedRegion = registration_country || current_country || null

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
        detected_region: detectedRegion,
        registration_latitude: registration_latitude || null,
        registration_longitude: registration_longitude || null,
        registration_accuracy: registration_accuracy || null,
        registration_location_method: registration_location_method || null,
        registration_country: registration_country || null,
        registration_region: registration_region || null,
        registration_city: registration_city || null,
        user_level: 'normal',
        roles: ['customer'],
        registration_type: 'user',
        is_verified: false,
        verification_token: verificationToken,
        verification_token_expires: expiresAt.toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return respond({ error: 'Failed to create user' }, 500)
    }

    // Send verification email (non-fatal)
    let emailSent = false
    try {
      const appUrl = Deno.env.get('APP_URL') || supabaseUrl.replace('/rest/v1', '')
      await sendVerificationEmail(email, verificationToken, appUrl)
      emailSent = true
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
    }

    return respond({
      success: true,
      message: emailSent
        ? 'Registration successful. Please check your email to verify your account.'
        : 'Registration successful. Verification email could not be sent — please use "Resend Verification" from the login screen.',
      user_id: newUser.id,
      email_sent: emailSent
    }, 201)

  } catch (error) {
    console.error('Registration error:', error)
    return respond({ error: error.message || 'Registration failed' }, 500)
  }
})
