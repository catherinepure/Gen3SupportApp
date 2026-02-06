// Supabase Edge Function for Email Verification
// Deploy with: supabase functions deploy verify

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  try {
    let token: string | null = null

    // Support both GET (email link click) and POST (API call)
    if (req.method === 'GET') {
      const url = new URL(req.url)
      token = url.searchParams.get('token')
    } else if (req.method === 'POST') {
      const body = await req.json()
      token = body.token
    }

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Verification token required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Find user with this token
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, verification_token_expires, is_verified, email')
      .eq('verification_token', token)
      .single()

    if (findError || !user) {
      // Return HTML for GET requests (email link)
      if (req.method === 'GET') {
        return new Response(
          `<html><body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #f44336;">Invalid Verification Link</h2>
            <p>This verification link is invalid or has already been used.</p>
            <p>Please contact support if you continue to have issues.</p>
          </body></html>`,
          { status: 404, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Invalid verification token' }),
        { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Check if already verified
    if (user.is_verified) {
      if (req.method === 'GET') {
        return new Response(
          `<html><body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #4CAF50;">Already Verified</h2>
            <p>Your email <strong>${user.email}</strong> is already verified.</p>
            <p>You can now log in to the Pure Electric Firmware Updater app.</p>
          </body></html>`,
          { status: 200, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }
        )
      }
      return new Response(
        JSON.stringify({ message: 'Email already verified' }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Check if token expired
    const expiresAt = new Date(user.verification_token_expires)
    if (new Date() > expiresAt) {
      if (req.method === 'GET') {
        return new Response(
          `<html><body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #f44336;">Verification Link Expired</h2>
            <p>This verification link has expired.</p>
            <p>Please log in to the app and request a new verification email.</p>
          </body></html>`,
          { status: 400, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Verification token expired' }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Mark user as verified
    const { error: updateError } = await supabase
      .from('users')
      .update({
        is_verified: true,
        verification_token: null,
        verification_token_expires: null
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Update error:', updateError)
      if (req.method === 'GET') {
        return new Response(
          `<html><body style="font-family: Arial; padding: 40px; text-align: center;">
            <h2 style="color: #f44336;">Verification Failed</h2>
            <p>An error occurred while verifying your email.</p>
            <p>Please try again or contact support.</p>
          </body></html>`,
          { status: 500, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }
        )
      }
      return new Response(
        JSON.stringify({ error: 'Verification failed' }),
        { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    // Success!
    if (req.method === 'GET') {
      return new Response(
        `<html><body style="font-family: Arial; padding: 40px; text-align: center;">
          <h2 style="color: #4CAF50;">✓ Email Verified Successfully!</h2>
          <p>Your email <strong>${user.email}</strong> has been verified.</p>
          <p>You can now log in to the Pure Electric Firmware Updater app.</p>
          <br/>
          <p style="color: #666; font-size: 14px;">You can close this window.</p>
        </body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html', 'Access-Control-Allow-Origin': '*' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Email verified successfully. You can now log in.'
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )

  } catch (error) {
    console.error('Verification error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Verification failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    )
  }
})
