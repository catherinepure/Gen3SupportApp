// Supabase Edge Function for Workshop Staff Registration (with Activation Code)
// Deploy with: supabase functions deploy register-workshop

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY')!
const FROM_EMAIL = Deno.env.get('SENDGRID_FROM_EMAIL') || "noreply@pureelectric.com"

interface RegisterWorkshopRequest {
  email: string
  password: string
  activation_code: string  // Required for workshop staff registration
  first_name?: string
  last_name?: string
  age_range?: string
  gender?: string
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

async function sendVerificationEmail(email: string, token: string, appUrl: string, workshopName: string) {
  const verificationUrl = `${appUrl}/functions/v1/verify?token=${token}`

  const emailContent = {
    personalizations: [{
      to: [{ email }],
      subject: 'Verify your Pure Electric Workshop account'
    }],
    from: { email: FROM_EMAIL },
    content: [{
      type: 'text/html',
      value: `
        <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>Welcome to Pure Electric - Workshop Access</h2>
            <p>You have been registered as workshop staff for <strong>${workshopName}</strong>.</p>
            <p>Please verify your email address by clicking the link below:</p>
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

serve(async (req) => {
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
    const body: RegisterWorkshopRequest = await req.json()
    const {
      email,
      password,
      activation_code,
      first_name,
      last_name,
      age_range,
      gender
    } = body

    // Validation
    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (!activation_code) {
      return new Response(
        JSON.stringify({ error: 'Activation code required for workshop registration' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (password.length < 8) {
      return new Response(
        JSON.stringify({ error: 'Password must be at least 8 characters' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
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
        { status: 409, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Validate activation code
    const { data: workshop, error: workshopError } = await supabase
      .from('workshops')
      .select('id, name, is_active, parent_distributor_id')
      .ilike('activation_code', activation_code)
      .eq('is_active', true)
      .single()

    if (workshopError || !workshop) {
      return new Response(
        JSON.stringify({ error: 'Invalid activation code' }),
        { status: 401, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Hash password and generate token
    const passwordHash = await hashPassword(password)
    const verificationToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

    // Create workshop staff user with appropriate roles
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .insert({
        email: email.toLowerCase(),
        password_hash: passwordHash,
        first_name: first_name || null,
        last_name: last_name || null,
        age_range: age_range || null,
        gender: gender || null,
        user_level: 'maintenance',
        roles: ['workshop_staff'],
        workshop_id: workshop.id,
        distributor_id: workshop.parent_distributor_id || null,
        registration_type: 'workshop',
        workshop_activation_code_used: activation_code.toUpperCase(),
        is_verified: false,
        verification_token: verificationToken,
        verification_token_expires: expiresAt.toISOString()
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create workshop staff account' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Log audit event
    await supabase
      .from('user_audit_log')
      .insert({
        user_id: newUser.id,
        action: 'workshop_staff_registration',
        details: {
          workshop_name: workshop.name,
          activation_code: activation_code.toUpperCase(),
          parent_distributor_id: workshop.parent_distributor_id
        }
      })

    // Send verification email (non-fatal — don't fail registration if email fails)
    let emailSent = false
    try {
      const appUrl = Deno.env.get('APP_URL') || supabaseUrl.replace('/rest/v1', '')
      await sendVerificationEmail(email, verificationToken, appUrl, workshop.name)
      emailSent = true
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: emailSent
          ? 'Workshop staff registration successful. Please check your email to verify your account.'
          : 'Workshop staff registration successful. Verification email could not be sent — please use "Resend Verification" from the login screen.',
        user_id: newUser.id,
        workshop_name: workshop.name,
        email_sent: emailSent
      }),
      { status: 201, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Workshop staff registration error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Registration failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
