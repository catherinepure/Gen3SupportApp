# Deploy Edge Functions via Supabase Dashboard

Since you don't have CLI access, deploy all 6 functions through the Supabase Dashboard.

**Dashboard URL:** https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc

---

## Step 1: Deploy Database Schema First

1. Go to **SQL Editor** in left sidebar
2. Click **New Query**
3. Copy/paste entire contents of `user_scooter_registration_schema.sql`
4. Click **Run**
5. Should see: "Success. No rows returned"

---

## Step 2: Create Test Distributor Code

While in SQL Editor, run this to create a test activation code:

```sql
INSERT INTO distributors (name, activation_code, is_active)
VALUES ('Test Distributor', 'TEST-2024', true);

-- Verify it was created
SELECT id, name, activation_code, is_active FROM distributors;
```

---

## Step 3: Deploy Edge Functions

Go to **Edge Functions** in left sidebar.

### For Each Function:

1. Click **"Create a new function"** or **"New Function"**
2. Enter the **exact function name** (case sensitive!)
3. Copy/paste the code below
4. Click **"Deploy function"**
5. Repeat for all 6 functions

---

## Function 1: register-user

**Name:** `register-user`

**Code:**
```typescript
// Supabase Edge Function for User Registration (with Scooter)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? ""
const FROM_EMAIL = "noreply@pureelectric.com"

interface RegisterUserRequest {
  email: string
  password: string
  first_name?: string
  last_name?: string
  age_range?: string
  gender?: string
  scooter_use_type?: string
  scooter_serial: string
  scooter_id?: string
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    const body: RegisterUserRequest = await req.json()
    const {
      email,
      password,
      first_name,
      last_name,
      age_range,
      gender,
      scooter_use_type,
      scooter_serial,
      scooter_id,
      telemetry
    } = body

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    if (!scooter_serial) {
      return new Response(
        JSON.stringify({ error: 'Scooter serial required for user registration' }),
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

    let resolvedScooterId = scooter_id

    if (!resolvedScooterId) {
      const { data: existingScooter } = await supabase
        .from('scooters')
        .select('id')
        .eq('zyd_serial', scooter_serial)
        .single()

      if (existingScooter) {
        resolvedScooterId = existingScooter.id
      } else {
        const { data: newScooter, error: scooterError } = await supabase
          .from('scooters')
          .insert({
            zyd_serial: scooter_serial,
            hw_version: telemetry?.controller_hw_version || null,
            notes: 'User-registered scooter'
          })
          .select('id')
          .single()

        if (scooterError || !newScooter) {
          console.error('Failed to create scooter:', scooterError)
          return new Response(
            JSON.stringify({ error: 'Failed to register scooter' }),
            { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
          )
        }

        resolvedScooterId = newScooter.id
      }
    }

    const passwordHash = await hashPassword(password)
    const verificationToken = generateToken()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24)

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
        user_level: 'user',
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
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    const { error: linkError } = await supabase
      .rpc('add_scooter_to_user', {
        p_user_id: newUser.id,
        p_scooter_id: resolvedScooterId,
        p_zyd_serial: scooter_serial,
        p_telemetry: telemetry || {}
      })

    if (linkError) {
      console.error('Failed to link scooter:', linkError)
    }

    const appUrl = Deno.env.get('APP_URL') || supabaseUrl.replace('/rest/v1', '')
    await sendVerificationEmail(email, verificationToken, appUrl)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.',
        user_id: newUser.id
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
```

---

## Function 2: register-distributor

**Name:** `register-distributor`

**Code:** *(See next message - too long for single response)*

---

**Continue to next message for remaining functions...**
