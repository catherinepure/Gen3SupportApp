// Supabase Edge Function: Webhook Delivery Engine
// Deploy with: supabase functions deploy webhook-deliver --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Modes:
//   POST { mode: "event", event_ids: [...] }       - Deliver events to matching subscriptions
//   POST { mode: "retry" }                          - Retry failed deliveries (called by cron)
//   POST { mode: "test", subscription_id: "..." }   - Send test delivery to verify endpoint
//
// Security: Called internally by activity-events function and cron.
//   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

// Partner-visible event types (must match api/index.ts PARTNER_EVENT_TYPES)
const PARTNER_EVENT_TYPES = new Set([
  'scooter_registered', 'scooter_status_changed', 'scooter_decommissioned',
  'service_job_created', 'service_job_completed', 'service_job_cancelled',
  'firmware_update_started', 'firmware_update_completed', 'firmware_update_failed',
  'user_registered', 'user_scooter_linked', 'user_scooter_unlinked',
])

// Default retry backoff schedule (seconds)
const RETRY_BACKOFF = [10, 60, 300]

// ============================================================================
// HMAC-SHA256 Signing
// ============================================================================

async function signPayload(secret: string, timestamp: number, payload: string): Promise<string> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================================
// Territory Resolution (for matching events to subscriptions)
// ============================================================================

interface ApiKeyTerritory {
  api_key_id: string
  organisation_type: string
  organisation_id: string | null
  countries: string[] | null // null = global (manufacturer)
}

async function resolveKeyTerritories(supabase: any, apiKeyIds: string[]): Promise<Map<string, ApiKeyTerritory>> {
  const result = new Map<string, ApiKeyTerritory>()

  const { data: keys } = await supabase
    .from('api_keys')
    .select('id, organisation_type, organisation_id')
    .in('id', apiKeyIds)

  if (!keys) return result

  for (const key of keys) {
    const territory: ApiKeyTerritory = {
      api_key_id: key.id,
      organisation_type: key.organisation_type,
      organisation_id: key.organisation_id,
      countries: null,
    }

    if (key.organisation_type === 'manufacturer' || key.organisation_type === 'custom') {
      territory.countries = null // global
    } else if (key.organisation_type === 'distributor' && key.organisation_id) {
      const { data: dist } = await supabase
        .from('distributors').select('countries').eq('id', key.organisation_id).single()
      territory.countries = dist?.countries || []
    } else if (key.organisation_type === 'workshop' && key.organisation_id) {
      const { data: ws } = await supabase
        .from('workshops')
        .select('service_area_countries, distributors(countries)')
        .eq('id', key.organisation_id).single()
      territory.countries = ws?.service_area_countries || ws?.distributors?.countries || []
    }

    result.set(key.id, territory)
  }

  return result
}

function eventMatchesTerritory(eventCountry: string | null, territory: ApiKeyTerritory): boolean {
  // Global access (manufacturer/custom) — always matches
  if (territory.countries === null) return true
  // No country on event — skip (can't scope)
  if (!eventCountry) return true
  // Check if event country is in territory
  return territory.countries.includes(eventCountry)
}

// ============================================================================
// Delivery Logic
// ============================================================================

async function deliverWebhook(
  supabase: any,
  deliveryId: string,
  subscription: any,
  payload: any,
): Promise<{ success: boolean; status?: number; error?: string; timeMs?: number }> {
  const timestamp = Math.floor(Date.now() / 1000)
  const payloadJson = JSON.stringify(payload)
  const signature = await signPayload(subscription.secret, timestamp, payloadJson)

  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), (subscription.timeout_seconds || 10) * 1000)

  try {
    const response = await fetch(subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Event-Type': payload.event_type || 'webhook.test',
        'X-Webhook-Id': deliveryId,
      },
      body: payloadJson,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const timeMs = Date.now() - startTime

    // Read response body (truncate to 1KB)
    let responseBody = ''
    try {
      const text = await response.text()
      responseBody = text.substring(0, 1024)
    } catch { /* ignore */ }

    if (response.ok) {
      // Success
      await supabase.from('webhook_deliveries').update({
        status: 'sent',
        response_status: response.status,
        response_body: responseBody,
        response_time_ms: timeMs,
        delivered_at: new Date().toISOString(),
        next_retry_at: null,
      }).eq('id', deliveryId)

      // Reset consecutive failures + update last timestamps
      await supabase.from('webhook_subscriptions').update({
        consecutive_failures: 0,
        last_delivery_at: new Date().toISOString(),
        last_success_at: new Date().toISOString(),
      }).eq('id', subscription.id)

      return { success: true, status: response.status, timeMs }
    } else {
      // HTTP error
      return await handleDeliveryFailure(supabase, deliveryId, subscription,
        `HTTP ${response.status}`, response.status, responseBody, timeMs)
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    const timeMs = Date.now() - startTime
    const errorMsg = err.name === 'AbortError' ? 'Timeout' : (err.message || 'Connection failed')
    return await handleDeliveryFailure(supabase, deliveryId, subscription,
      errorMsg, null, null, timeMs)
  }
}

async function handleDeliveryFailure(
  supabase: any,
  deliveryId: string,
  subscription: any,
  errorMessage: string,
  responseStatus: number | null,
  responseBody: string | null,
  timeMs: number,
): Promise<{ success: boolean; status?: number; error: string; timeMs: number }> {
  // Get current delivery to check attempt number
  const { data: delivery } = await supabase
    .from('webhook_deliveries')
    .select('attempt_number')
    .eq('id', deliveryId)
    .single()

  const attemptNumber = delivery?.attempt_number || 1
  const maxRetries = subscription.max_retries || 3

  if (attemptNumber < maxRetries) {
    // Schedule retry
    const backoffIndex = Math.min(attemptNumber - 1, RETRY_BACKOFF.length - 1)
    const backoffSeconds = RETRY_BACKOFF[backoffIndex]
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000).toISOString()

    await supabase.from('webhook_deliveries').update({
      status: 'retrying',
      response_status: responseStatus,
      response_body: responseBody,
      response_time_ms: timeMs,
      error_message: errorMessage,
      next_retry_at: nextRetryAt,
      attempt_number: attemptNumber + 1,
    }).eq('id', deliveryId)
  } else {
    // Final failure — mark as failed
    await supabase.from('webhook_deliveries').update({
      status: 'failed',
      response_status: responseStatus,
      response_body: responseBody,
      response_time_ms: timeMs,
      error_message: errorMessage,
      next_retry_at: null,
    }).eq('id', deliveryId)

    // Increment consecutive failures
    const { data: sub } = await supabase
      .from('webhook_subscriptions')
      .select('consecutive_failures, failure_threshold')
      .eq('id', subscription.id)
      .single()

    const newFailures = (sub?.consecutive_failures || 0) + 1
    const threshold = sub?.failure_threshold || 10

    const updates: Record<string, any> = {
      consecutive_failures: newFailures,
      last_delivery_at: new Date().toISOString(),
    }

    // Auto-pause if threshold reached
    if (newFailures >= threshold) {
      updates.is_active = false
      updates.paused_at = new Date().toISOString()
      updates.paused_reason = `Auto-paused: ${newFailures} consecutive delivery failures`
      console.warn(`Webhook ${subscription.id} auto-paused after ${newFailures} consecutive failures`)
    }

    await supabase.from('webhook_subscriptions').update(updates).eq('id', subscription.id)
  }

  return { success: false, status: responseStatus || undefined, error: errorMessage, timeMs }
}

// ============================================================================
// Mode: Event — Process new events
// ============================================================================

async function handleEventMode(supabase: any, eventIds: string[]) {
  if (!eventIds || eventIds.length === 0) {
    return { processed: 0 }
  }

  // 1. Fetch events
  const { data: events, error: evtError } = await supabase
    .from('activity_events')
    .select('id, event_type, scooter_id, user_id, country, distributor_id, workshop_id, payload, timestamp')
    .in('id', eventIds)

  if (evtError || !events || events.length === 0) {
    return { processed: 0, error: evtError?.message }
  }

  // 2. Filter to partner-visible event types
  const partnerEvents = events.filter((e: any) => PARTNER_EVENT_TYPES.has(e.event_type))
  if (partnerEvents.length === 0) {
    return { processed: 0, note: 'No partner-visible events' }
  }

  // 3. Find active subscriptions
  const { data: subscriptions } = await supabase
    .from('webhook_subscriptions')
    .select('id, api_key_id, url, secret, event_types, timeout_seconds, max_retries')
    .eq('is_active', true)
    .is('paused_at', null)

  if (!subscriptions || subscriptions.length === 0) {
    return { processed: partnerEvents.length, delivered: 0, note: 'No active subscriptions' }
  }

  // 4. Resolve territories for all relevant API keys
  const apiKeyIds = [...new Set(subscriptions.map((s: any) => s.api_key_id))]
  const territories = await resolveKeyTerritories(supabase, apiKeyIds)

  // 5. Match events → subscriptions and deliver
  let deliveredCount = 0
  let failedCount = 0

  for (const event of partnerEvents) {
    for (const sub of subscriptions) {
      // Check event type filter
      if (sub.event_types && sub.event_types.length > 0) {
        if (!sub.event_types.includes(event.event_type)) continue
      }

      // Check territory
      const territory = territories.get(sub.api_key_id)
      if (!territory || !eventMatchesTerritory(event.country, territory)) continue

      // Build payload
      const payload = {
        event_id: event.id,
        event_type: event.event_type,
        timestamp: event.timestamp,
        data: {
          scooter_id: event.scooter_id,
          user_id: event.user_id,
          country: event.country,
          ...(event.payload || {}),
        },
      }

      // Create delivery record
      const { data: delivery } = await supabase.from('webhook_deliveries').insert({
        subscription_id: sub.id,
        event_id: event.id,
        request_url: sub.url,
        request_payload: payload,
        status: 'pending',
        attempt_number: 1,
      }).select('id').single()

      if (!delivery) continue

      // Deliver (don't await all — process concurrently in batches)
      const result = await deliverWebhook(supabase, delivery.id, sub, payload)
      if (result.success) deliveredCount++
      else failedCount++
    }
  }

  return {
    processed: partnerEvents.length,
    delivered: deliveredCount,
    failed: failedCount,
  }
}

// ============================================================================
// Mode: Retry — Process failed deliveries
// ============================================================================

async function handleRetryMode(supabase: any) {
  const now = new Date().toISOString()

  // Find deliveries ready for retry
  const { data: deliveries } = await supabase
    .from('webhook_deliveries')
    .select(`
      id, subscription_id, request_url, request_payload, attempt_number,
      webhook_subscriptions (id, url, secret, timeout_seconds, max_retries, is_active, paused_at)
    `)
    .eq('status', 'retrying')
    .lte('next_retry_at', now)
    .limit(50) // Process in batches

  if (!deliveries || deliveries.length === 0) {
    return { retried: 0 }
  }

  let retriedCount = 0
  let successCount = 0

  for (const delivery of deliveries) {
    const sub = delivery.webhook_subscriptions
    if (!sub || !sub.is_active || sub.paused_at) {
      // Subscription was deactivated/paused since — mark as failed
      await supabase.from('webhook_deliveries').update({
        status: 'failed',
        error_message: 'Subscription deactivated',
        next_retry_at: null,
      }).eq('id', delivery.id)
      continue
    }

    retriedCount++
    const result = await deliverWebhook(supabase, delivery.id, sub, delivery.request_payload)
    if (result.success) successCount++
  }

  return { retried: retriedCount, succeeded: successCount, failed: retriedCount - successCount }
}

// ============================================================================
// Mode: Test — Send test delivery
// ============================================================================

async function handleTestMode(supabase: any, subscriptionId: string) {
  if (!subscriptionId) {
    return { error: 'subscription_id required', status: 400 }
  }

  const { data: sub } = await supabase
    .from('webhook_subscriptions')
    .select('id, url, secret, timeout_seconds')
    .eq('id', subscriptionId)
    .single()

  if (!sub) {
    return { error: 'Subscription not found', status: 404 }
  }

  const payload = {
    event_id: '00000000-0000-0000-0000-000000000000',
    event_type: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: {
      message: 'This is a test webhook delivery',
      subscription_id: subscriptionId,
    },
  }

  // Create a delivery record (uses a null event_id workaround — use the subscription id as ref)
  const timestamp = Math.floor(Date.now() / 1000)
  const payloadJson = JSON.stringify(payload)
  const signature = await signPayload(sub.secret, timestamp, payloadJson)

  const startTime = Date.now()
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), (sub.timeout_seconds || 10) * 1000)

  try {
    const response = await fetch(sub.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Timestamp': String(timestamp),
        'X-Event-Type': 'webhook.test',
        'X-Webhook-Id': 'test-' + crypto.randomUUID(),
      },
      body: payloadJson,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const timeMs = Date.now() - startTime

    let responseBody = ''
    try { responseBody = (await response.text()).substring(0, 1024) } catch { /* */ }

    return {
      success: response.ok,
      status_code: response.status,
      response_time_ms: timeMs,
      response_body: responseBody,
    }
  } catch (err: any) {
    clearTimeout(timeoutId)
    const timeMs = Date.now() - startTime
    return {
      success: false,
      error: err.name === 'AbortError' ? 'Timeout' : (err.message || 'Connection failed'),
      response_time_ms: timeMs,
    }
  }
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const body = await req.json()
    const { mode } = body

    switch (mode) {
      case 'event':
        return respond(await handleEventMode(supabase, body.event_ids))

      case 'retry':
        return respond(await handleRetryMode(supabase))

      case 'test':
        const testResult = await handleTestMode(supabase, body.subscription_id)
        return respond(testResult, testResult.status || 200)

      default:
        return respond({ error: 'Invalid mode. Use: event, retry, test' }, 400)
    }

  } catch (error: any) {
    console.error('Webhook deliver error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
