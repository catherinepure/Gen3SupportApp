// Supabase Edge Function for Activity Event Ingestion
// Deploy with: supabase functions deploy activity-events
//
// Routes (method + action field in JSON body):
//   POST { action: "ingest", events: [...] }    - Batch insert events from client
//   POST { action: "query", filters: {...} }    - Query events (scoped by role/territory)
//
// Events are immutable — no update or delete operations.
// The client queues events locally (drift) and syncs in batches.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

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
    .select('id, email, user_level, roles, distributor_id, workshop_id, is_active')
    .eq('id', session.user_id)
    .single()

  if (!user || !user.is_active) return null
  return user
}

function hasRole(user: any, allowed: string[]): boolean {
  const roles: string[] = user.roles || []
  if (roles.some((r: string) => allowed.includes(r))) return true
  const levelMap: Record<string, string> = {
    'admin': 'manufacturer_admin',
    'distributor': 'distributor_staff',
    'maintenance': 'workshop_staff',
    'user': 'customer',
  }
  const mapped = levelMap[user.user_level]
  return mapped ? allowed.includes(mapped) : false
}

// Valid event types from spec section 3.2
const validEventTypes = [
  // Scooter lifecycle
  'scooter_registered', 'scooter_transferred', 'scooter_decommissioned',
  'scooter_status_changed', 'scooter_reported_stolen',
  // Ride/usage
  'ride_started', 'ride_ended', 'pin_unlock', 'pin_changed',
  // Service and maintenance
  'service_booked', 'service_started', 'service_completed',
  'firmware_updated', 'warranty_claim',
  // User account
  'user_registered', 'user_login', 'user_profile_updated',
  // Battery and diagnostics
  'battery_report', 'error_code', 'charging_session',
]

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, session_token } = body

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return respond({ error: 'Authentication required' }, 401)
    }

    // ---------- INGEST (batch insert) ----------
    if (action === 'ingest') {
      const events: any[] = body.events
      if (!events || !Array.isArray(events) || events.length === 0) {
        return respond({ error: 'events array required (non-empty)' }, 400)
      }

      if (events.length > 100) {
        return respond({ error: 'Maximum 100 events per batch' }, 400)
      }

      const now = new Date().toISOString()
      const rows = []
      const errors: string[] = []

      for (let i = 0; i < events.length; i++) {
        const evt = events[i]

        // Validate event type
        if (!evt.event_type || !validEventTypes.includes(evt.event_type)) {
          errors.push(`Event ${i}: invalid event_type '${evt.event_type}'`)
          continue
        }

        // Resolve distributor from country if not provided
        let distributorId = evt.distributor_id || null
        if (!distributorId && evt.country) {
          const { data } = await supabase
            .rpc('resolve_distributor_for_country', { p_country: evt.country })
          distributorId = data || null
        }

        rows.push({
          timestamp: evt.timestamp || now,
          event_type: evt.event_type,
          scooter_id: evt.scooter_id || null,
          user_id: evt.user_id || user.id,
          country: evt.country || null,
          distributor_id: distributorId,
          workshop_id: evt.workshop_id || null,
          payload: evt.payload || {},
          app_version: evt.app_version || null,
          device_type: evt.device_type || null,
          synced_at: now,
        })
      }

      if (rows.length === 0) {
        return respond({ error: 'No valid events to insert', details: errors }, 400)
      }

      const { data, error } = await supabase
        .from('activity_events')
        .insert(rows)
        .select('id')

      if (error) {
        console.error('Ingest activity events error:', error)
        return respond({ error: 'Failed to insert events' }, 500)
      }

      // Fire webhooks asynchronously (non-blocking — don't delay the response)
      if (data && data.length > 0) {
        const webhookUrl = `${supabaseUrl}/functions/v1/webhook-deliver`
        fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode: 'event', event_ids: data.map((e: any) => e.id) }),
        }).catch(err => console.error('Webhook trigger failed:', err))
      }

      return respond({
        success: true,
        inserted: data?.length || 0,
        skipped: errors.length,
        errors: errors.length > 0 ? errors : undefined,
      }, 201)
    }

    // ---------- QUERY ----------
    if (action === 'query') {
      // Only staff and admin can query events broadly
      if (!hasRole(user, ['manufacturer_admin', 'distributor_staff', 'workshop_staff'])) {
        // Customers can only query their own events
        if (!hasRole(user, ['customer'])) {
          return respond({ error: 'Insufficient permissions' }, 403)
        }
      }

      const filters = body.filters || {}
      let query = supabase
        .from('activity_events')
        .select('*')
        .order('timestamp', { ascending: false })

      // Pagination
      const limit = Math.min(filters.limit || 50, 200)
      const offset = filters.offset || 0
      query = query.range(offset, offset + limit - 1)

      // Territory scoping
      if (hasRole(user, ['manufacturer_admin'])) {
        // No filter
      } else if (hasRole(user, ['distributor_staff']) && user.distributor_id) {
        query = query.eq('distributor_id', user.distributor_id)
      } else if (hasRole(user, ['workshop_staff']) && user.workshop_id) {
        query = query.eq('workshop_id', user.workshop_id)
      } else {
        // Customer — own events only
        query = query.eq('user_id', user.id)
      }

      // Optional filters
      if (filters.event_type) query = query.eq('event_type', filters.event_type)
      if (filters.scooter_id) query = query.eq('scooter_id', filters.scooter_id)
      if (filters.user_id && hasRole(user, ['manufacturer_admin', 'distributor_staff'])) {
        query = query.eq('user_id', filters.user_id)
      }
      if (filters.country && hasRole(user, ['manufacturer_admin'])) {
        query = query.eq('country', filters.country)
      }
      if (filters.from) query = query.gte('timestamp', filters.from)
      if (filters.to) query = query.lte('timestamp', filters.to)

      const { data, error } = await query
      if (error) {
        console.error('Query activity events error:', error)
        return respond({ error: 'Failed to query events' }, 500)
      }

      return respond({ events: data, count: data?.length || 0 })
    }

    return respond({ error: 'Invalid action. Use: ingest, query' }, 400)

  } catch (error) {
    console.error('Activity events function error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
