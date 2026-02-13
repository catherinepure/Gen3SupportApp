// Supabase Edge Function: Pure Fleet API
// Deploy with: supabase functions deploy api --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Pure Fleet API — organisation-scoped REST API with key-based auth, territory filtering, and rate limiting.
// Completely separate from the admin Edge Function — no shared code or dependencies.
//
// Auth: X-API-Key header → SHA-256 hash lookup in api_keys table
//
// Resources & Actions (read):
//   scooters:        list, get, telemetry
//   rides:           list, get
//   firmware:        list, get
//   users:           list, get
//   workshops:       list, get
//   service-jobs:    list, get, create, update
//   analytics:       summary, usage, service, battery, firmware
//   battery-health:  summary, trend, fleet
//   faults:          history, active, fleet-summary
//   components:      list, get
//   firmware-updates: list, progress, failures
//   events:          list, types
//   ownership:       by-scooter, by-user
//
// Resources & Actions (write):
//   scooters:     update, request-diagnostic
//   service-jobs: create, update

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ============================================================================
// CORS & Helpers
// ============================================================================

const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, apikey',
}

function respond(body: object, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders },
  })
}

function errorRespond(code: string, message: string, status: number, extraHeaders?: Record<string, string>) {
  return respond({ success: false, error: { code, message } }, status, extraHeaders)
}

// ============================================================================
// Rate Limiting (in-memory sliding window, per API key ID)
// ============================================================================

interface RateLimitEntry { timestamps: number[] }
const rateLimitMap = new Map<string, RateLimitEntry>()
const RATE_LIMIT_WINDOW_MS = 60_000

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    if (entry.timestamps.length === 0) rateLimitMap.delete(key)
  }
}, 300_000)

function checkRateLimit(keyId: string, maxRequests: number): {
  allowed: boolean; remaining: number; resetAt: string; retryAfterMs?: number
} {
  const now = Date.now()
  let entry = rateLimitMap.get(keyId)
  if (!entry) {
    entry = { timestamps: [] }
    rateLimitMap.set(keyId, entry)
  }
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)

  const resetAt = new Date(now + RATE_LIMIT_WINDOW_MS).toISOString()

  if (entry.timestamps.length >= maxRequests) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - entry.timestamps[0])
    return { allowed: false, remaining: 0, resetAt, retryAfterMs }
  }
  entry.timestamps.push(now)
  return { allowed: true, remaining: maxRequests - entry.timestamps.length, resetAt }
}

// ============================================================================
// Sensitive Field Exclusion
// ============================================================================

const SENSITIVE_FIELDS = new Set([
  'pin_encrypted', 'encrypted_password', 'password_hash', 'session_token',
  'pin_set_by_user_id', 'pin_encryption_key',
])

function sanitizeRecord(record: any): any {
  if (!record || typeof record !== 'object') return record
  if (Array.isArray(record)) return record.map(sanitizeRecord)
  const clean: Record<string, any> = {}
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_FIELDS.has(key)) continue
    if (key.endsWith('_key') && key !== 'api_key_id') continue
    // Convert pin_set_at to has_pin boolean
    if (key === 'pin_set_at') {
      clean['has_pin'] = !!value
      continue
    }
    clean[key] = (typeof value === 'object' && value !== null) ? sanitizeRecord(value) : value
  }
  return clean
}

// Safe user fields — never expose password/pin/token data through API
const USER_SAFE_FIELDS = 'id, email, first_name, last_name, user_level, distributor_id, workshop_id, is_active, is_verified, home_country, current_country, created_at, last_login'

// ============================================================================
// Territory Resolution
// ============================================================================

interface TerritoryContext {
  role: 'manufacturer' | 'distributor' | 'workshop'
  countries: string[] | null
  distributorId?: string
  workshopId?: string
}

async function resolveApiKeyTerritory(supabase: any, apiKey: any): Promise<TerritoryContext> {
  if (apiKey.organisation_type === 'manufacturer' || apiKey.organisation_type === 'custom') {
    return { role: 'manufacturer', countries: null }
  }

  if (apiKey.organisation_type === 'distributor') {
    const { data: dist } = await supabase
      .from('distributors').select('countries').eq('id', apiKey.organisation_id).single()
    return {
      role: 'distributor',
      countries: dist?.countries || [],
      distributorId: apiKey.organisation_id,
    }
  }

  if (apiKey.organisation_type === 'workshop') {
    const { data: ws } = await supabase
      .from('workshops')
      .select('parent_distributor_id, service_area_countries, distributors(countries)')
      .eq('id', apiKey.organisation_id).single()
    const countries = ws?.service_area_countries || ws?.distributors?.countries || []
    return {
      role: 'workshop',
      countries,
      workshopId: apiKey.organisation_id,
      distributorId: ws?.parent_distributor_id,
    }
  }

  return { role: 'manufacturer', countries: null }
}

// ============================================================================
// Territory Filtering (replicated from admin — no shared code)
// ============================================================================

interface TerritoryFilter {
  countryField?: string
  countries?: string[]
  workshopId?: string
  distributorId?: string
  additionalConditions?: Record<string, any>
}

function buildTerritoryFilter(resource: string, territory: TerritoryContext): TerritoryFilter | null {
  if (territory.role === 'manufacturer') return null

  if (territory.role === 'distributor') {
    const countries = territory.countries || []
    switch (resource) {
      case 'users':        return { countryField: 'home_country', countries }
      case 'scooters':     return { countryField: 'country_of_registration', countries }
      case 'distributors': return { distributorId: territory.distributorId }
      case 'workshops':    return { additionalConditions: { parent_distributor_id: territory.distributorId } }
      case 'telemetry':    return { countryField: 'country_of_registration', countries }
      default:             return { countryField: 'country', countries }
    }
  }

  if (territory.role === 'workshop') {
    const countries = territory.countries || []
    switch (resource) {
      case 'service-jobs': return { workshopId: territory.workshopId }
      case 'workshops':    return { additionalConditions: { id: territory.workshopId } }
      case 'scooters':     return { countryField: 'country_of_registration', countries }
      default:             return null
    }
  }

  return null
}

function applyTerritoryFilter(query: any, filter: TerritoryFilter | null): any {
  if (!filter) return query

  if (filter.countries && filter.countryField) {
    if (filter.countries.length > 0) {
      query = query.in(filter.countryField, filter.countries)
    } else {
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }
  }
  if (filter.workshopId) query = query.eq('workshop_id', filter.workshopId)
  if (filter.distributorId) query = query.eq('id', filter.distributorId)
  if (filter.additionalConditions) {
    for (const [key, value] of Object.entries(filter.additionalConditions)) {
      query = query.eq(key, value)
    }
  }
  return query
}

// Helper: territory-filter telemetry/rides via scooter IDs (no direct country field)
async function getTerritoryScopedScooterIds(supabase: any, territory: TerritoryContext): Promise<string[] | null> {
  if (territory.role === 'manufacturer') return null // no filter needed
  let q = supabase.from('scooters').select('id')
  const filter = buildTerritoryFilter('scooters', territory)
  q = applyTerritoryFilter(q, filter)
  const { data } = await q
  return data?.map((s: any) => s.id) || []
}

// ============================================================================
// Scope Checking
// ============================================================================

const SCOPE_MAP: Record<string, string> = {
  'scooters:list': 'scooters:read',
  'scooters:get': 'scooters:read',
  'scooters:telemetry': 'scooters:telemetry',
  'scooters:update': 'scooters:write',
  'scooters:request-diagnostic': 'scooters:diagnostics',
  'rides:list': 'rides:read',
  'rides:get': 'rides:read',
  'firmware:list': 'firmware:read',
  'firmware:get': 'firmware:read',
  'users:list': 'users:read',
  'users:get': 'users:read',
  'workshops:list': 'workshops:read',
  'workshops:get': 'workshops:read',
  'service-jobs:list': 'service-jobs:read',
  'service-jobs:get': 'service-jobs:read',
  'service-jobs:create': 'service-jobs:write',
  'service-jobs:update': 'service-jobs:write',
  'analytics:summary': 'analytics:read',
  'analytics:usage': 'analytics:read',
  'analytics:service': 'analytics:read',
  'analytics:battery': 'analytics:read',
  'analytics:firmware': 'analytics:read',
  // Battery Health (reuses scooters:telemetry scope)
  'battery-health:summary': 'scooters:telemetry',
  'battery-health:trend': 'scooters:telemetry',
  'battery-health:fleet': 'scooters:telemetry',
  // Faults
  'faults:history': 'faults:read',
  'faults:active': 'faults:read',
  'faults:fleet-summary': 'faults:read',
  // Components
  'components:list': 'components:read',
  'components:get': 'components:read',
  // Firmware Updates
  'firmware-updates:list': 'firmware:read',
  'firmware-updates:progress': 'firmware:read',
  'firmware-updates:failures': 'firmware:read',
  // Events
  'events:list': 'events:read',
  'events:types': 'events:read',
  'events:simulate': 'events:write',
  // Ownership
  'ownership:by-scooter': 'scooters:read',
  'ownership:by-user': 'scooters:read',
  // Webhooks
  'webhooks:list': 'webhooks:read',
  'webhooks:get': 'webhooks:read',
  'webhooks:deliveries': 'webhooks:read',
  'webhooks:create': 'webhooks:write',
  'webhooks:update': 'webhooks:write',
  'webhooks:delete': 'webhooks:write',
  'webhooks:test': 'webhooks:write',
  'webhooks:pause': 'webhooks:write',
  'webhooks:resume': 'webhooks:write',
}

function checkScope(scopes: string[], resource: string, action: string): boolean {
  const required = SCOPE_MAP[`${resource}:${action}`]
  if (!required) return false
  return scopes.includes(required)
}

// ============================================================================
// Resource Handlers
// ============================================================================

// --- Scooters ---
async function handleScooters(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    let query = supabase.from('scooters')
      .select('*, distributors(name), scooter_models(code, name), battery_variants(code, name, capacity_ah), colour_options(code, name, hex_colour)', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Territory for workshops: only scooters with active service jobs
    if (territory.role === 'workshop') {
      const { data: jobs } = await supabase.from('service_jobs')
        .select('scooter_id').eq('workshop_id', territory.workshopId)
        .not('status', 'in', '("completed","cancelled")')
      const ids = jobs?.map((j: any) => j.scooter_id) || []
      if (ids.length > 0) query = query.in('id', ids)
      else query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    } else {
      const filter = buildTerritoryFilter('scooters', territory)
      query = applyTerritoryFilter(query, filter)
    }

    // User filters
    if (body.filters?.status) query = query.eq('status', body.filters.status)
    if (body.filters?.country) query = query.eq('country_of_registration', body.filters.country)
    if (body.filters?.model) query = query.eq('model', body.filters.model)
    if (body.filters?.serial) query = query.ilike('zyd_serial', `%${body.filters.serial}%`)
    if (body.filters?.distributor_id) query = query.eq('distributor_id', body.filters.distributor_id)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    const serial = body.filters?.zyd_serial
    if (!id && !serial) return { error: 'id or zyd_serial required', status: 400 }

    let query = supabase.from('scooters')
      .select('*, distributors(name), scooter_models(code, name), battery_variants(code, name, capacity_ah), colour_options(code, name, hex_colour)')
    if (id) query = query.eq('id', id)
    else query = query.eq('zyd_serial', serial)

    // Apply territory filter
    const filter = buildTerritoryFilter('scooters', territory)
    query = applyTerritoryFilter(query, filter)

    const { data, error } = await query.single()
    if (error || !data) return { error: 'Scooter not found', status: 404 }
    return { data: sanitizeRecord(data) }
  }

  if (action === 'telemetry') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    let query = supabase.from('scooter_telemetry')
      .select('*', { count: 'exact' })
      .eq('scooter_id', scooterId)
      .order('scanned_at', { ascending: false })

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'update') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', id)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    // Only allow updating safe fields
    const updates: Record<string, any> = {}
    if (body.status !== undefined) updates.status = body.status
    if (body.country_of_registration !== undefined) updates.country_of_registration = body.country_of_registration
    if (body.notes !== undefined) updates.notes = body.notes
    if (Object.keys(updates).length === 0) return { error: 'No valid fields to update', status: 400 }

    const { data, error } = await supabase.from('scooters')
      .update(updates).eq('id', id).select().single()
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data) }
  }

  if (action === 'request-diagnostic') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    const { error } = await supabase.from('scooters')
      .update({ cs_diagnostic_requested: true }).eq('id', scooterId)
    if (error) return { error: error.message }
    return { data: { scooter_id: scooterId, diagnostic_requested: true } }
  }

  return { error: `Unknown scooters action: ${action}`, status: 400 }
}

// --- Rides ---
async function handleRides(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    let query = supabase.from('ride_sessions')
      .select('*, scooters(zyd_serial, model), users(email, first_name, last_name)', { count: 'exact' })
      .order('started_at', { ascending: false })

    // Territory filter via scooter IDs
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else query = query.eq('id', '00000000-0000-0000-0000-000000000000')
    }

    if (body.filters?.scooter_id) query = query.eq('scooter_id', body.filters.scooter_id)
    if (body.filters?.status) query = query.eq('status', body.filters.status)
    if (body.filters?.trigger_type) query = query.eq('trigger_type', body.filters.trigger_type)
    if (body.filters?.from) query = query.gte('started_at', body.filters.from)
    if (body.filters?.to) query = query.lte('started_at', body.filters.to)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    // Get session
    const { data: session, error } = await supabase.from('ride_sessions')
      .select('*, scooters(zyd_serial, model), users(email, first_name, last_name)')
      .eq('id', id).single()
    if (error || !session) return { error: 'Ride session not found', status: 404 }

    // Verify territory via scooter
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    if (scooterIds !== null && !scooterIds.includes(session.scooter_id)) {
      return { error: 'Ride session not found', status: 404 }
    }

    // Get telemetry samples
    const { data: samples } = await supabase.from('ride_telemetry')
      .select('*').eq('ride_session_id', id)
      .order('sample_index', { ascending: true })

    return { data: { ...sanitizeRecord(session), samples: sanitizeRecord(samples || []) } }
  }

  return { error: `Unknown rides action: ${action}`, status: 400 }
}

// --- Firmware ---
async function handleFirmware(supabase: any, action: string, body: any, _territory: TerritoryContext) {
  // Firmware is global — no territory filtering
  if (action === 'list') {
    let query = supabase.from('firmware_versions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (body.filters?.is_active !== undefined) query = query.eq('is_active', body.filters.is_active)
    if (body.filters?.hw_version) query = query.eq('target_hw_version', body.filters.hw_version)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    const { data, error } = await supabase.from('firmware_versions')
      .select('*').eq('id', id).single()
    if (error || !data) return { error: 'Firmware not found', status: 404 }
    return { data: sanitizeRecord(data) }
  }

  return { error: `Unknown firmware action: ${action}`, status: 400 }
}

// --- Users ---
async function handleUsers(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    let query = supabase.from('users')
      .select(USER_SAFE_FIELDS, { count: 'exact' })
      .order('created_at', { ascending: false })

    const filter = buildTerritoryFilter('users', territory)
    query = applyTerritoryFilter(query, filter)

    if (body.filters?.user_level) query = query.eq('user_level', body.filters.user_level)
    if (body.filters?.is_active !== undefined) query = query.eq('is_active', body.filters.is_active)
    if (body.filters?.home_country) query = query.eq('home_country', body.filters.home_country)
    if (body.filters?.search) {
      query = query.or(`email.ilike.%${body.filters.search}%,first_name.ilike.%${body.filters.search}%,last_name.ilike.%${body.filters.search}%`)
    }

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    let query = supabase.from('users').select(USER_SAFE_FIELDS).eq('id', id)
    const filter = buildTerritoryFilter('users', territory)
    query = applyTerritoryFilter(query, filter)

    const { data, error } = await query.single()
    if (error || !data) return { error: 'User not found', status: 404 }
    return { data: sanitizeRecord(data) }
  }

  return { error: `Unknown users action: ${action}`, status: 400 }
}

// --- Workshops ---
async function handleWorkshops(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    let query = supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)', { count: 'exact' })
      .order('name', { ascending: true })

    const filter = buildTerritoryFilter('workshops', territory)
    query = applyTerritoryFilter(query, filter)

    if (body.filters?.distributor_id) query = query.eq('parent_distributor_id', body.filters.distributor_id)
    if (body.filters?.is_active !== undefined) query = query.eq('is_active', body.filters.is_active)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    let query = supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)')
      .eq('id', id)
    const filter = buildTerritoryFilter('workshops', territory)
    query = applyTerritoryFilter(query, filter)

    const { data, error } = await query.single()
    if (error || !data) return { error: 'Workshop not found', status: 404 }

    // Get addresses
    const { data: addresses } = await supabase.from('workshop_addresses')
      .select('*').eq('workshop_id', id)

    return { data: { ...sanitizeRecord(data), addresses: sanitizeRecord(addresses || []) } }
  }

  return { error: `Unknown workshops action: ${action}`, status: 400 }
}

// --- Service Jobs ---
async function handleServiceJobs(supabase: any, action: string, body: any, territory: TerritoryContext) {
  const selectFields = '*, scooters(zyd_serial, model, status), workshops(name), users!service_jobs_customer_id_fkey(email, first_name, last_name)'

  if (action === 'list') {
    let query = supabase.from('service_jobs')
      .select(selectFields, { count: 'exact' })
      .order('booked_date', { ascending: false })

    const filter = buildTerritoryFilter('service-jobs', territory)
    query = applyTerritoryFilter(query, filter)

    if (body.filters?.status) query = query.eq('status', body.filters.status)
    if (body.filters?.workshop_id) query = query.eq('workshop_id', body.filters.workshop_id)
    if (body.filters?.scooter_id) query = query.eq('scooter_id', body.filters.scooter_id)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'get') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    let query = supabase.from('service_jobs').select(selectFields).eq('id', id)
    const filter = buildTerritoryFilter('service-jobs', territory)
    query = applyTerritoryFilter(query, filter)

    const { data, error } = await query.single()
    if (error || !data) return { error: 'Service job not found', status: 404 }
    return { data: sanitizeRecord(data) }
  }

  if (action === 'create') {
    if (!body.scooter_id || !body.workshop_id || !body.issue_description) {
      return { error: 'scooter_id, workshop_id, and issue_description required', status: 400 }
    }

    // Find customer (scooter owner)
    let customerId = body.customer_id
    if (!customerId) {
      const { data: link } = await supabase.from('user_scooters')
        .select('user_id').eq('scooter_id', body.scooter_id)
        .order('registered_at', { ascending: false }).limit(1).single()
      customerId = link?.user_id
    }
    if (!customerId) return { error: 'Could not determine scooter owner. Provide customer_id.', status: 400 }

    const { data, error } = await supabase.from('service_jobs')
      .insert({
        scooter_id: body.scooter_id,
        workshop_id: body.workshop_id,
        customer_id: customerId,
        technician_id: body.technician_id || null,
        issue_description: body.issue_description,
        status: 'booked',
        booked_date: new Date().toISOString(),
      }).select().single()
    if (error) return { error: error.message }

    await supabase.from('scooters').update({ status: 'in_service' }).eq('id', body.scooter_id)
    return { data: sanitizeRecord(data), status: 201 }
  }

  if (action === 'update') {
    const id = body.id || body.filters?.id
    if (!id) return { error: 'id required', status: 400 }

    const { data: existing } = await supabase.from('service_jobs')
      .select('id, status, scooter_id').eq('id', id).single()
    if (!existing) return { error: 'Job not found', status: 404 }

    const validTransitions: Record<string, string[]> = {
      'booked': ['in_progress', 'cancelled'],
      'in_progress': ['awaiting_parts', 'ready_for_collection', 'completed', 'cancelled'],
      'awaiting_parts': ['in_progress', 'cancelled'],
      'ready_for_collection': ['completed', 'cancelled'],
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.status && body.status !== existing.status) {
      const allowed = validTransitions[existing.status]
      if (!allowed || !allowed.includes(body.status)) {
        return { error: `Cannot transition from '${existing.status}' to '${body.status}'`, status: 400 }
      }
      updates.status = body.status
      if (body.status === 'in_progress' && !existing.started_date) {
        updates.started_date = new Date().toISOString()
      }
      if (body.status === 'completed' || body.status === 'cancelled') {
        updates.completed_date = new Date().toISOString()
        await supabase.from('scooters').update({ status: 'active' }).eq('id', existing.scooter_id)
      }
    }
    if (body.technician_notes !== undefined) updates.technician_notes = body.technician_notes
    if (body.parts_used !== undefined) updates.parts_used = body.parts_used

    const { data, error } = await supabase.from('service_jobs')
      .update(updates).eq('id', id).select().single()
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data) }
  }

  return { error: `Unknown service-jobs action: ${action}`, status: 400 }
}

// --- Battery Health ---
async function handleBatteryHealth(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'summary') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    // Get latest telemetry with battery data
    const { data: latest } = await supabase.from('scooter_telemetry')
      .select('battery_soc, battery_health, battery_charge_cycles, battery_discharge_cycles, remaining_capacity_mah, full_capacity_mah, battery_temp, voltage, current, scanned_at')
      .eq('scooter_id', scooterId)
      .not('battery_soc', 'is', null)
      .order('scanned_at', { ascending: false })
      .limit(1).single()

    // Get current battery component if exists
    const { data: battery } = await supabase.from('scooter_batteries')
      .select('battery_serial, manufacturer, model, capacity_mah, manufacture_date, installed_date')
      .eq('scooter_id', scooterId).eq('is_current', true).limit(1).single()

    return {
      data: {
        scooter_id: scooterId,
        latest_reading: latest ? {
          soc_percent: latest.battery_soc,
          health_percent: latest.battery_health,
          charge_cycles: latest.battery_charge_cycles,
          discharge_cycles: latest.battery_discharge_cycles,
          remaining_capacity_mah: latest.remaining_capacity_mah,
          full_capacity_mah: latest.full_capacity_mah,
          temperature_c: latest.battery_temp,
          voltage: latest.voltage,
          current: latest.current,
          recorded_at: latest.scanned_at,
        } : null,
        battery_component: battery || null,
      }
    }
  }

  if (action === 'trend') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    // Default to last 30 days
    const from = body.filters?.from || new Date(Date.now() - 30 * 86400000).toISOString()
    const to = body.filters?.to || new Date().toISOString()

    const { data: readings } = await supabase.from('scooter_telemetry')
      .select('battery_soc, battery_health, battery_charge_cycles, remaining_capacity_mah, full_capacity_mah, battery_temp, voltage, scanned_at')
      .eq('scooter_id', scooterId)
      .not('battery_soc', 'is', null)
      .gte('scanned_at', from)
      .lte('scanned_at', to)
      .order('scanned_at', { ascending: true })

    // Aggregate by day
    const dailyMap: Record<string, { health: number[], soc: number[], cycles: number[], capacity: number[], temp: number[], count: number }> = {}
    for (const r of (readings || [])) {
      const day = r.scanned_at.substring(0, 10) // YYYY-MM-DD
      if (!dailyMap[day]) dailyMap[day] = { health: [], soc: [], cycles: [], capacity: [], temp: [], count: 0 }
      const d = dailyMap[day]
      if (r.battery_health != null) d.health.push(r.battery_health)
      if (r.battery_soc != null) d.soc.push(r.battery_soc)
      if (r.battery_charge_cycles != null) d.cycles.push(r.battery_charge_cycles)
      if (r.remaining_capacity_mah != null) d.capacity.push(r.remaining_capacity_mah)
      if (r.battery_temp != null) d.temp.push(r.battery_temp)
      d.count++
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : null

    const trend = Object.entries(dailyMap).map(([date, d]) => ({
      date,
      avg_health_percent: avg(d.health),
      avg_soc_percent: avg(d.soc),
      max_charge_cycles: max(d.cycles),
      avg_capacity_mah: avg(d.capacity),
      avg_temperature_c: avg(d.temp),
      reading_count: d.count,
    }))

    return { data: { scooter_id: scooterId, from, to, trend } }
  }

  if (action === 'fleet') {
    // Fleet-wide battery health distribution
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)

    // Get latest battery health for each scooter (use distinct on scooter_id)
    let query = supabase.from('scooter_telemetry')
      .select('scooter_id, battery_health, battery_charge_cycles, battery_soc, scanned_at')
      .not('battery_health', 'is', null)
      .order('scooter_id').order('scanned_at', { ascending: false })

    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else return { data: { total_scooters: 0, health_distribution: {}, avg_health: null, avg_cycles: null, scooters_below_70: 0 } }
    }

    const { data: allReadings } = await query.limit(5000) // cap for performance

    // Deduplicate: latest reading per scooter
    const latestByScooter: Record<string, any> = {}
    for (const r of (allReadings || [])) {
      if (!latestByScooter[r.scooter_id]) latestByScooter[r.scooter_id] = r
    }
    const latest = Object.values(latestByScooter)

    // Health distribution buckets
    const buckets: Record<string, number> = { '90-100': 0, '80-89': 0, '70-79': 0, '60-69': 0, 'below_60': 0, 'unknown': 0 }
    let totalHealth = 0, healthCount = 0, totalCycles = 0, cycleCount = 0, below70 = 0

    for (const r of latest) {
      const h = r.battery_health
      if (h == null) { buckets['unknown']++; continue }
      if (h >= 90) buckets['90-100']++
      else if (h >= 80) buckets['80-89']++
      else if (h >= 70) buckets['70-79']++
      else if (h >= 60) buckets['60-69']++
      else buckets['below_60']++
      if (h < 70) below70++
      totalHealth += h; healthCount++
      if (r.battery_charge_cycles != null) { totalCycles += r.battery_charge_cycles; cycleCount++ }
    }

    return {
      data: {
        total_scooters: latest.length,
        health_distribution: buckets,
        avg_health_percent: healthCount > 0 ? Math.round(totalHealth / healthCount) : null,
        avg_charge_cycles: cycleCount > 0 ? Math.round(totalCycles / cycleCount) : null,
        scooters_below_70_percent: below70,
      }
    }
  }

  return { error: `Unknown battery-health action: ${action}`, status: 400 }
}

// --- Faults ---
const FAULT_NAMES: Record<number, string> = {
  0: 'motor_over_temperature',
  1: 'brake_failure',
  2: 'throttle_fault',
  3: 'controller_fault',
  4: 'communication_error',
  5: 'battery_fault',
  6: 'hall_sensor_fault',
  7: 'phase_fault',
  8: 'mos_fault',
  9: 'over_voltage',
  10: 'under_voltage',
  11: 'over_current',
  12: 'controller_over_temperature',
  13: 'reserved',
}

function decodeFaultBitmap(code: number): string[] {
  const faults: string[] = []
  for (let bit = 0; bit < 14; bit++) {
    if (code & (1 << bit)) faults.push(FAULT_NAMES[bit] || `unknown_bit_${bit}`)
  }
  return faults
}

async function handleFaults(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'history') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    const from = body.filters?.from || new Date(Date.now() - 90 * 86400000).toISOString()
    const to = body.filters?.to || new Date().toISOString()

    const { data: readings, count } = await supabase.from('scooter_telemetry')
      .select('fault_code, scanned_at, record_type', { count: 'exact' })
      .eq('scooter_id', scooterId)
      .gt('fault_code', 0)
      .gte('scanned_at', from)
      .lte('scanned_at', to)
      .order('scanned_at', { ascending: false })
      .range(0, Math.min((body.limit || 50) - 1, 99))

    const events = (readings || []).map((r: any) => ({
      fault_code: r.fault_code,
      faults: decodeFaultBitmap(r.fault_code),
      recorded_at: r.scanned_at,
      record_type: r.record_type,
    }))

    return { data: events, pagination: { total: count, limit: body.limit || 50, offset: body.offset || 0 } }
  }

  if (action === 'active') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    // Get the most recent telemetry reading
    const { data: latest } = await supabase.from('scooter_telemetry')
      .select('fault_code, scanned_at')
      .eq('scooter_id', scooterId)
      .order('scanned_at', { ascending: false })
      .limit(1).single()

    if (!latest) return { data: { scooter_id: scooterId, has_active_faults: false, faults: [], last_checked: null } }

    const faults = decodeFaultBitmap(latest.fault_code || 0)
    return {
      data: {
        scooter_id: scooterId,
        has_active_faults: faults.length > 0,
        fault_code: latest.fault_code || 0,
        faults,
        last_checked: latest.scanned_at,
      }
    }
  }

  if (action === 'fleet-summary') {
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)

    // Get latest fault_code for each scooter
    let query = supabase.from('scooter_telemetry')
      .select('scooter_id, fault_code, scanned_at')
      .order('scooter_id').order('scanned_at', { ascending: false })

    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else return { data: { total_scooters_checked: 0, scooters_with_faults: 0, fault_frequency: {} } }
    }

    const { data: allReadings } = await query.limit(5000)

    // Deduplicate: latest reading per scooter
    const latestByScooter: Record<string, any> = {}
    for (const r of (allReadings || [])) {
      if (!latestByScooter[r.scooter_id]) latestByScooter[r.scooter_id] = r
    }

    // Count fault frequencies
    const faultCounts: Record<string, number> = {}
    let scootersWithFaults = 0

    for (const r of Object.values(latestByScooter)) {
      if (!r.fault_code || r.fault_code === 0) continue
      scootersWithFaults++
      const faults = decodeFaultBitmap(r.fault_code)
      for (const f of faults) {
        faultCounts[f] = (faultCounts[f] || 0) + 1
      }
    }

    // Sort by frequency
    const sortedFaults = Object.entries(faultCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([fault, count]) => ({ fault, affected_scooters: count }))

    return {
      data: {
        total_scooters_checked: Object.keys(latestByScooter).length,
        scooters_with_faults: scootersWithFaults,
        fault_frequency: sortedFaults,
      }
    }
  }

  return { error: `Unknown faults action: ${action}`, status: 400 }
}

// --- Components ---
const COMPONENT_TABLES: Record<string, { table: string; serialField: string }> = {
  battery: { table: 'scooter_batteries', serialField: 'battery_serial' },
  motor: { table: 'scooter_motors', serialField: 'motor_serial' },
  frame: { table: 'scooter_frames', serialField: 'frame_serial' },
  controller: { table: 'scooter_controllers', serialField: 'controller_serial' },
}

async function handleComponents(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    const componentType = body.filters?.component_type
    const tablesToQuery = componentType && COMPONENT_TABLES[componentType]
      ? { [componentType]: COMPONENT_TABLES[componentType] }
      : COMPONENT_TABLES

    const allComponents: any[] = []

    for (const [type, config] of Object.entries(tablesToQuery)) {
      let q = supabase.from(config.table).select('*')
        .eq('scooter_id', scooterId)
        .order('installed_date', { ascending: false })

      if (body.filters?.is_current !== undefined) q = q.eq('is_current', body.filters.is_current)

      const { data } = await q
      for (const item of (data || [])) {
        allComponents.push({ component_type: type, ...item })
      }
    }

    return { data: allComponents }
  }

  if (action === 'get') {
    const id = body.id
    const componentType = body.filters?.component_type
    if (!id || !componentType) return { error: 'id and component_type required', status: 400 }

    const config = COMPONENT_TABLES[componentType]
    if (!config) return { error: `Invalid component_type: ${componentType}. Valid: battery, motor, frame, controller`, status: 400 }

    const { data, error } = await supabase.from(config.table)
      .select('*').eq('id', id).single()
    if (error || !data) return { error: 'Component not found', status: 404 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', data.scooter_id)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Component not found', status: 404 }

    return { data: { component_type: componentType, ...data } }
  }

  return { error: `Unknown components action: ${action}`, status: 400 }
}

// --- Firmware Updates ---
async function handleFirmwareUpdates(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'list') {
    let query = supabase.from('firmware_uploads')
      .select('id, scooter_id, firmware_version_id, old_hw_version, old_sw_version, new_version, status, error_message, started_at, completed_at, scooters(zyd_serial, model), firmware_versions(version_label, target_hw_version)', { count: 'exact' })
      .order('started_at', { ascending: false })

    // Territory filter via scooter IDs
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else return { data: [], pagination: { total: 0, limit: body.limit || 50, offset: body.offset || 0 } }
    }

    if (body.filters?.scooter_id) query = query.eq('scooter_id', body.filters.scooter_id)
    if (body.filters?.firmware_id) query = query.eq('firmware_version_id', body.filters.firmware_id)
    if (body.filters?.status) query = query.eq('status', body.filters.status)
    if (body.filters?.from) query = query.gte('started_at', body.filters.from)
    if (body.filters?.to) query = query.lte('started_at', body.filters.to)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'progress') {
    const firmwareId = body.id || body.filters?.firmware_id
    if (!firmwareId) return { error: 'firmware_id required', status: 400 }

    // Get firmware info
    const { data: fw } = await supabase.from('firmware_versions')
      .select('id, version_label, target_hw_version, is_active')
      .eq('id', firmwareId).single()
    if (!fw) return { error: 'Firmware not found', status: 404 }

    // Count territory-scoped scooters with matching HW version
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    let eligibleQuery = supabase.from('scooters').select('id', { count: 'exact', head: true })
    if (fw.target_hw_version) eligibleQuery = eligibleQuery.eq('controller_hw_version', fw.target_hw_version)
    if (scooterIds !== null && scooterIds.length > 0) eligibleQuery = eligibleQuery.in('id', scooterIds)
    const { count: totalEligible } = await eligibleQuery

    // Count updates by status
    let uploadsQuery = supabase.from('firmware_uploads')
      .select('status').eq('firmware_version_id', firmwareId)
    if (scooterIds !== null && scooterIds.length > 0) uploadsQuery = uploadsQuery.in('scooter_id', scooterIds)
    const { data: uploads } = await uploadsQuery

    const statusCounts: Record<string, number> = { completed: 0, failed: 0, started: 0 }
    for (const u of (uploads || [])) {
      statusCounts[u.status] = (statusCounts[u.status] || 0) + 1
    }

    const total = totalEligible || 0
    const inProgress = statusCounts.started || 0
    return {
      data: {
        firmware_id: firmwareId,
        version: fw.version_label,
        target_hw_version: fw.target_hw_version,
        total_eligible: total,
        completed: statusCounts.completed,
        failed: statusCounts.failed,
        in_progress: inProgress,
        completion_percent: total > 0 ? Math.round((statusCounts.completed / total) * 100) : 0,
      }
    }
  }

  if (action === 'failures') {
    let query = supabase.from('firmware_uploads')
      .select('id, scooter_id, firmware_version_id, old_hw_version, old_sw_version, new_version, status, error_message, started_at, completed_at, scooters(zyd_serial, model), firmware_versions(version_label)', { count: 'exact' })
      .eq('status', 'failed')
      .order('started_at', { ascending: false })

    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else return { data: [], pagination: { total: 0, limit: body.limit || 50, offset: body.offset || 0 } }
    }

    if (body.filters?.firmware_id) query = query.eq('firmware_version_id', body.filters.firmware_id)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  return { error: `Unknown firmware-updates action: ${action}`, status: 400 }
}

// --- Events ---
const PARTNER_EVENT_TYPES = new Set([
  'scooter_registered', 'scooter_status_changed', 'scooter_decommissioned',
  'service_job_created', 'service_job_completed', 'service_job_cancelled',
  'firmware_update_started', 'firmware_update_completed', 'firmware_update_failed',
  'user_registered', 'user_scooter_linked', 'user_scooter_unlinked',
])

async function handleEvents(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'types') {
    return { data: Array.from(PARTNER_EVENT_TYPES) }
  }

  if (action === 'list') {
    let query = supabase.from('activity_events')
      .select('id, event_type, scooter_id, user_id, payload, timestamp', { count: 'exact' })
      .in('event_type', Array.from(PARTNER_EVENT_TYPES))
      .order('timestamp', { ascending: false })

    // Territory filter — events have scooter_id, use that for scoping
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    if (scooterIds !== null) {
      if (scooterIds.length > 0) query = query.in('scooter_id', scooterIds)
      else return { data: [], pagination: { total: 0, limit: body.limit || 50, offset: body.offset || 0 } }
    }

    if (body.filters?.event_type) {
      if (!PARTNER_EVENT_TYPES.has(body.filters.event_type)) {
        return { error: `Event type '${body.filters.event_type}' is not available`, status: 400 }
      }
      query = query.eq('event_type', body.filters.event_type)
    }
    if (body.filters?.scooter_id) query = query.eq('scooter_id', body.filters.scooter_id)
    if (body.filters?.from) query = query.gte('timestamp', body.filters.from)
    if (body.filters?.to) query = query.lte('timestamp', body.filters.to)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    // Sanitize payloads (may contain sensitive data)
    return { data: sanitizeRecord(data), pagination: { total: count, limit, offset } }
  }

  if (action === 'simulate') {
    const eventType = body.event_type || 'scooter_status_changed'
    if (!PARTNER_EVENT_TYPES.has(eventType)) {
      return { error: `Invalid event type: ${eventType}. Valid: ${Array.from(PARTNER_EVENT_TYPES).join(', ')}`, status: 400 }
    }

    // Resolve a scooter from this key's territory if not provided
    let scooterId = body.scooter_id || null
    let country = body.country || null
    if (!scooterId) {
      let scooterQuery = supabase.from('scooters').select('id, country_of_registration').limit(10)
      const filter = buildTerritoryFilter('scooters', territory)
      scooterQuery = applyTerritoryFilter(scooterQuery, filter)
      const { data: scooters } = await scooterQuery
      if (scooters && scooters.length > 0) {
        const pick = scooters[Math.floor(Math.random() * scooters.length)]
        scooterId = pick.id
        country = country || pick.country_of_registration
      }
    }

    const payload = body.payload || {
      source: 'workshop_portal_demo',
      simulated: true,
      old_status: 'active',
      new_status: 'maintenance',
    }

    const now = new Date().toISOString()
    const { data: event, error } = await supabase.from('activity_events').insert({
      event_type: eventType,
      scooter_id: scooterId,
      user_id: null,
      country: country,
      payload,
      timestamp: now,
      synced_at: now,
    }).select('id').single()

    if (error) return { error: error.message }

    // Fire-and-forget: trigger webhook delivery for this event
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    fetch(`${supabaseUrl}/functions/v1/webhook-deliver`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'event', event_ids: [event.id] }),
    }).catch(err => console.error('Webhook trigger failed:', err))

    return { data: { event_id: event.id, event_type: eventType, scooter_id: scooterId, country, webhook_delivery_triggered: true } }
  }

  return { error: `Unknown events action: ${action}`, status: 400 }
}

// --- Ownership ---
async function handleOwnership(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'by-scooter') {
    const scooterId = body.id || body.filters?.scooter_id
    if (!scooterId) return { error: 'scooter_id required', status: 400 }

    // Verify scooter is within territory
    let scooterQ = supabase.from('scooters').select('id').eq('id', scooterId)
    const filter = buildTerritoryFilter('scooters', territory)
    scooterQ = applyTerritoryFilter(scooterQ, filter)
    const { data: scooter } = await scooterQ.single()
    if (!scooter) return { error: 'Scooter not found', status: 404 }

    const { data: links } = await supabase.from('user_scooters')
      .select('id, user_id, is_primary, registered_at, unregistered_at, users(email, first_name, last_name)')
      .eq('scooter_id', scooterId)
      .order('registered_at', { ascending: false })

    const owners = (links || []).map((l: any) => ({
      user_id: l.user_id,
      email: l.users?.email,
      first_name: l.users?.first_name,
      last_name: l.users?.last_name,
      is_primary: l.is_primary,
      registered_at: l.registered_at,
      unregistered_at: l.unregistered_at,
      is_current: !l.unregistered_at,
    }))

    return { data: { scooter_id: scooterId, owners } }
  }

  if (action === 'by-user') {
    const userId = body.id || body.filters?.user_id
    if (!userId) return { error: 'user_id required', status: 400 }

    // Verify user is within territory
    let userQ = supabase.from('users').select('id').eq('id', userId)
    const filter = buildTerritoryFilter('users', territory)
    userQ = applyTerritoryFilter(userQ, filter)
    const { data: user } = await userQ.single()
    if (!user) return { error: 'User not found', status: 404 }

    const { data: links } = await supabase.from('user_scooters')
      .select('id, scooter_id, is_primary, registered_at, unregistered_at, scooters(zyd_serial, model, status)')
      .eq('user_id', userId)
      .order('registered_at', { ascending: false })

    const scooters = (links || []).map((l: any) => ({
      scooter_id: l.scooter_id,
      zyd_serial: l.scooters?.zyd_serial,
      model: l.scooters?.model,
      status: l.scooters?.status,
      is_primary: l.is_primary,
      registered_at: l.registered_at,
      unregistered_at: l.unregistered_at,
      is_current: !l.unregistered_at,
    }))

    return { data: { user_id: userId, scooters } }
  }

  return { error: `Unknown ownership action: ${action}`, status: 400 }
}

// --- Analytics ---
async function handleAnalytics(supabase: any, action: string, body: any, territory: TerritoryContext) {
  if (action === 'usage') {
    // Fleet utilisation metrics
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)
    const from = body.filters?.from || new Date(Date.now() - 30 * 86400000).toISOString()
    const to = body.filters?.to || new Date().toISOString()

    // Count ride sessions in the period
    let ridesQuery = supabase.from('ride_sessions')
      .select('id, scooter_id, started_at, ended_at', { count: 'exact' })
      .gte('started_at', from).lte('started_at', to)
    if (scooterIds !== null) {
      if (scooterIds.length > 0) ridesQuery = ridesQuery.in('scooter_id', scooterIds)
      else return { data: { total_rides: 0, unique_scooters_used: 0, avg_rides_per_day: 0 } }
    }
    const { data: rides, count: rideCount } = await ridesQuery

    // Unique scooters used
    const uniqueScooters = new Set((rides || []).map((r: any) => r.scooter_id))

    // Active vs idle scooters
    let totalQuery = supabase.from('scooters').select('id', { count: 'exact', head: true })
    if (scooterIds !== null && scooterIds.length > 0) totalQuery = totalQuery.in('id', scooterIds)
    const { count: totalScooters } = await totalQuery

    const daySpan = Math.max(1, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000))

    return {
      data: {
        period: { from, to, days: daySpan },
        total_rides: rideCount || 0,
        unique_scooters_used: uniqueScooters.size,
        total_scooters: totalScooters || 0,
        idle_scooters: (totalScooters || 0) - uniqueScooters.size,
        avg_rides_per_day: rideCount ? Math.round((rideCount / daySpan) * 10) / 10 : 0,
      }
    }
  }

  if (action === 'service') {
    // Service metrics
    const from = body.filters?.from || new Date(Date.now() - 90 * 86400000).toISOString()
    const to = body.filters?.to || new Date().toISOString()

    let jobsQuery = supabase.from('service_jobs')
      .select('status, booked_date, started_date, completed_date, issue_description')
      .gte('booked_date', from).lte('booked_date', to)

    const filter = buildTerritoryFilter('service-jobs', territory)
    jobsQuery = applyTerritoryFilter(jobsQuery, filter)

    const { data: jobs } = await jobsQuery

    const statusCounts: Record<string, number> = {}
    let totalTurnaround = 0, turnaroundCount = 0

    for (const j of (jobs || [])) {
      statusCounts[j.status] = (statusCounts[j.status] || 0) + 1
      if (j.completed_date && j.booked_date) {
        const ms = new Date(j.completed_date).getTime() - new Date(j.booked_date).getTime()
        totalTurnaround += ms / 86400000 // days
        turnaroundCount++
      }
    }

    return {
      data: {
        period: { from, to },
        total_jobs: (jobs || []).length,
        by_status: statusCounts,
        avg_turnaround_days: turnaroundCount > 0 ? Math.round(totalTurnaround / turnaroundCount * 10) / 10 : null,
      }
    }
  }

  if (action === 'battery') {
    // Redirect to battery-health fleet handler
    return await handleBatteryHealth(supabase, 'fleet', body, territory)
  }

  if (action === 'firmware') {
    // Firmware distribution with update stats
    const scooterIds = await getTerritoryScopedScooterIds(supabase, territory)

    let fwQuery = supabase.from('scooters').select('controller_sw_version, controller_hw_version')
    if (scooterIds !== null && scooterIds.length > 0) fwQuery = fwQuery.in('id', scooterIds)
    const { data: scooters } = await fwQuery

    const swDist: Record<string, number> = {}
    const hwDist: Record<string, number> = {}
    for (const s of (scooters || [])) {
      const sw = s.controller_sw_version || 'unknown'
      const hw = s.controller_hw_version || 'unknown'
      swDist[sw] = (swDist[sw] || 0) + 1
      hwDist[hw] = (hwDist[hw] || 0) + 1
    }

    // Get latest active firmware versions
    const { data: activeFw } = await supabase.from('firmware_versions')
      .select('id, version_label, target_hw_version')
      .eq('is_active', true)
      .order('created_at', { ascending: false }).limit(5)

    // Count total updates (completed vs failed) in last 30 days
    let updatesQuery = supabase.from('firmware_uploads')
      .select('status')
      .gte('started_at', new Date(Date.now() - 30 * 86400000).toISOString())
    if (scooterIds !== null && scooterIds.length > 0) updatesQuery = updatesQuery.in('scooter_id', scooterIds)
    const { data: recentUpdates } = await updatesQuery

    let completed = 0, failed = 0
    for (const u of (recentUpdates || [])) {
      if (u.status === 'completed') completed++
      else if (u.status === 'failed') failed++
    }

    return {
      data: {
        total_scooters: (scooters || []).length,
        sw_version_distribution: swDist,
        hw_version_distribution: hwDist,
        latest_active_firmware: activeFw || [],
        updates_last_30_days: { completed, failed, success_rate: (completed + failed) > 0 ? Math.round((completed / (completed + failed)) * 100) : null },
      }
    }
  }

  if (action !== 'summary') return { error: `Unknown analytics action: ${action}`, status: 400 }

  // Parallel count queries
  const [
    { count: scooterCount },
    { count: userCount },
    { data: scooterStatuses },
    { data: firmwareData },
  ] = await Promise.all([
    (() => {
      let q = supabase.from('scooters').select('id', { count: 'exact', head: true })
      const f = buildTerritoryFilter('scooters', territory)
      return applyTerritoryFilter(q, f)
    })(),
    (() => {
      let q = supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true)
      const f = buildTerritoryFilter('users', territory)
      return applyTerritoryFilter(q, f)
    })(),
    (() => {
      let q = supabase.from('scooters').select('status')
      const f = buildTerritoryFilter('scooters', territory)
      return applyTerritoryFilter(q, f)
    })(),
    (() => {
      let q = supabase.from('scooters').select('current_fw_version')
      const f = buildTerritoryFilter('scooters', territory)
      return applyTerritoryFilter(q, f)
    })(),
  ])

  // Aggregate status breakdown
  const statusBreakdown: Record<string, number> = {}
  for (const s of (scooterStatuses || [])) {
    statusBreakdown[s.status] = (statusBreakdown[s.status] || 0) + 1
  }

  // Aggregate firmware distribution
  const firmwareBreakdown: Record<string, number> = {}
  for (const s of (firmwareData || [])) {
    const ver = s.current_fw_version || 'unknown'
    firmwareBreakdown[ver] = (firmwareBreakdown[ver] || 0) + 1
  }

  return {
    data: {
      total_scooters: scooterCount || 0,
      active_users: userCount || 0,
      scooter_status_breakdown: statusBreakdown,
      firmware_distribution: firmwareBreakdown,
    }
  }
}

// ============================================================================
// Webhooks (self-service for API key holders)
// ============================================================================

async function handleWebhooks(supabase: any, action: string, body: any, territory: TerritoryContext, apiKeyRecord: any) {
  const apiKeyId = apiKeyRecord.id

  if (action === 'list') {
    const { data, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, description, event_types, is_active, consecutive_failures, failure_threshold, paused_at, paused_reason, created_at, updated_at, last_delivery_at, last_success_at')
      .eq('api_key_id', apiKeyId)
      .order('created_at', { ascending: false })

    if (error) return { error: error.message }
    return { data }
  }

  if (action === 'get') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    const { data: sub, error } = await supabase
      .from('webhook_subscriptions')
      .select('id, url, description, event_types, is_active, max_retries, timeout_seconds, consecutive_failures, failure_threshold, paused_at, paused_reason, created_at, updated_at, last_delivery_at, last_success_at')
      .eq('id', id)
      .eq('api_key_id', apiKeyId)
      .single()

    if (error || !sub) return { error: 'Webhook not found', status: 404 }

    // Include 24h delivery stats
    const since = new Date(Date.now() - 86400000).toISOString()
    const { data: stats } = await supabase
      .from('webhook_deliveries')
      .select('status')
      .eq('subscription_id', id)
      .gte('created_at', since)

    const deliveryStats = { sent: 0, failed: 0, retrying: 0, pending: 0 }
    for (const d of (stats || [])) {
      if (d.status in deliveryStats) deliveryStats[d.status as keyof typeof deliveryStats]++
    }

    return { data: { ...sub, delivery_stats_24h: deliveryStats } }
  }

  if (action === 'create') {
    const { url, description, event_types, timeout_seconds } = body
    if (!url) return { error: 'url is required', status: 400 }
    if (!/^https?:\/\//.test(url)) return { error: 'url must start with http:// or https://', status: 400 }

    // Validate event types if provided
    if (event_types && event_types.length > 0) {
      const invalid = event_types.filter((t: string) => !PARTNER_EVENT_TYPES.has(t))
      if (invalid.length > 0) {
        return { error: `Invalid event types: ${invalid.join(', ')}. Valid types: ${Array.from(PARTNER_EVENT_TYPES).join(', ')}`, status: 400 }
      }
    }

    // Generate secret (32 random bytes, base64)
    const secretBytes = new Uint8Array(32)
    crypto.getRandomValues(secretBytes)
    const secret = btoa(String.fromCharCode(...secretBytes))

    // Limit: max 10 subscriptions per API key
    const { count } = await supabase
      .from('webhook_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
    if ((count || 0) >= 10) {
      return { error: 'Maximum 10 webhook subscriptions per API key', status: 400 }
    }

    const { data: sub, error } = await supabase
      .from('webhook_subscriptions')
      .insert({
        api_key_id: apiKeyId,
        url,
        secret,
        description: description || null,
        event_types: event_types || [],
        timeout_seconds: timeout_seconds || 10,
        created_by: apiKeyRecord.created_by,
      })
      .select('id, url, description, event_types, is_active, timeout_seconds, created_at')
      .single()

    if (error) return { error: error.message }

    // Return secret only on create (one-time display)
    return { data: { ...sub, secret }, status: 201 }
  }

  if (action === 'update') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    // Verify ownership
    const { data: existing } = await supabase
      .from('webhook_subscriptions').select('id').eq('id', id).eq('api_key_id', apiKeyId).single()
    if (!existing) return { error: 'Webhook not found', status: 404 }

    const updates: Record<string, any> = {}
    if (body.url !== undefined) {
      if (!/^https?:\/\//.test(body.url)) return { error: 'url must start with http:// or https://', status: 400 }
      updates.url = body.url
    }
    if (body.description !== undefined) updates.description = body.description
    if (body.event_types !== undefined) {
      if (body.event_types.length > 0) {
        const invalid = body.event_types.filter((t: string) => !PARTNER_EVENT_TYPES.has(t))
        if (invalid.length > 0) return { error: `Invalid event types: ${invalid.join(', ')}`, status: 400 }
      }
      updates.event_types = body.event_types
    }
    if (body.timeout_seconds !== undefined) updates.timeout_seconds = body.timeout_seconds

    if (Object.keys(updates).length === 0) return { error: 'No valid fields to update', status: 400 }

    const { data: sub, error } = await supabase
      .from('webhook_subscriptions')
      .update(updates)
      .eq('id', id)
      .select('id, url, description, event_types, is_active, timeout_seconds, updated_at')
      .single()

    if (error) return { error: error.message }
    return { data: sub }
  }

  if (action === 'delete') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    const { error } = await supabase
      .from('webhook_subscriptions')
      .delete()
      .eq('id', id)
      .eq('api_key_id', apiKeyId)

    if (error) return { error: error.message }
    return { data: { deleted: true } }
  }

  if (action === 'test') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    // Verify ownership
    const { data: existing } = await supabase
      .from('webhook_subscriptions').select('id').eq('id', id).eq('api_key_id', apiKeyId).single()
    if (!existing) return { error: 'Webhook not found', status: 404 }

    // Call webhook-deliver in test mode
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const res = await fetch(`${supabaseUrl}/functions/v1/webhook-deliver`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${supabaseKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'test', subscription_id: id }),
    })
    const result = await res.json()
    return { data: result }
  }

  if (action === 'deliveries') {
    const subscriptionId = body.id || body.subscription_id
    if (!subscriptionId) return { error: 'id or subscription_id required', status: 400 }

    // Verify ownership
    const { data: existing } = await supabase
      .from('webhook_subscriptions').select('id').eq('id', subscriptionId).eq('api_key_id', apiKeyId).single()
    if (!existing) return { error: 'Webhook not found', status: 404 }

    let query = supabase
      .from('webhook_deliveries')
      .select('id, event_id, request_url, request_payload, status, response_status, response_time_ms, error_message, attempt_number, created_at, delivered_at', { count: 'exact' })
      .eq('subscription_id', subscriptionId)
      .order('created_at', { ascending: false })

    if (body.filters?.status) query = query.eq('status', body.filters.status)
    if (body.filters?.from) query = query.gte('created_at', body.filters.from)
    if (body.filters?.to) query = query.lte('created_at', body.filters.to)

    const limit = Math.min(body.limit || 50, 100)
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return { error: error.message }
    return { data, pagination: { total: count, limit, offset } }
  }

  if (action === 'pause') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    const { data: sub, error } = await supabase
      .from('webhook_subscriptions')
      .update({ is_active: false, paused_at: new Date().toISOString(), paused_reason: body.reason || 'Manually paused' })
      .eq('id', id)
      .eq('api_key_id', apiKeyId)
      .select('id, is_active, paused_at, paused_reason')
      .single()

    if (error || !sub) return { error: 'Webhook not found', status: 404 }
    return { data: sub }
  }

  if (action === 'resume') {
    const id = body.id
    if (!id) return { error: 'id required', status: 400 }

    const { data: sub, error } = await supabase
      .from('webhook_subscriptions')
      .update({ is_active: true, paused_at: null, paused_reason: null, consecutive_failures: 0 })
      .eq('id', id)
      .eq('api_key_id', apiKeyId)
      .select('id, is_active, consecutive_failures')
      .single()

    if (error || !sub) return { error: 'Webhook not found', status: 404 }
    return { data: sub }
  }

  return { error: `Unknown webhooks action: ${action}`, status: 400 }
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  let apiKeyRecord: any = null

  try {
    // 1. Extract API key
    const apiKeyHeader = req.headers.get('X-API-Key') || req.headers.get('x-api-key')
    if (!apiKeyHeader) {
      return errorRespond('MISSING_API_KEY', 'X-API-Key header is required', 401)
    }

    // 2. Hash the key
    const encoder = new TextEncoder()
    const data = encoder.encode(apiKeyHeader)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const keyHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('')

    // 3. Look up key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .single()

    if (keyError || !keyData) {
      return errorRespond('INVALID_API_KEY', 'Invalid API key', 401)
    }
    apiKeyRecord = keyData

    // 4. Verify active + not expired
    if (!keyData.is_active) {
      return errorRespond('KEY_REVOKED', 'API key has been revoked', 401)
    }
    if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
      return errorRespond('KEY_EXPIRED', 'API key has expired', 401)
    }

    // 5. Rate limit
    const rateLimit = checkRateLimit(keyData.id, keyData.rate_limit_per_minute)
    const rateLimitHeaders: Record<string, string> = {
      'X-RateLimit-Limit': String(keyData.rate_limit_per_minute),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': rateLimit.resetAt,
    }

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.retryAfterMs || 1000) / 1000)
      return errorRespond('RATE_LIMITED', 'Rate limit exceeded', 429, {
        ...rateLimitHeaders,
        'Retry-After': String(retryAfter),
      })
    }

    // 6. Parse body
    const body = await req.json()
    const { resource, action } = body

    if (!resource || !action) {
      return errorRespond('INVALID_REQUEST', 'resource and action are required', 400, rateLimitHeaders)
    }

    // 7. Scope check
    if (!checkScope(keyData.scopes || [], resource, action)) {
      return errorRespond('SCOPE_DENIED', `Scope '${SCOPE_MAP[`${resource}:${action}`] || `${resource}:${action}`}' is not granted to this key`, 403, rateLimitHeaders)
    }

    // 8. Resolve territory
    const territory = await resolveApiKeyTerritory(supabase, keyData)

    // 9. Route to handler
    let result: any
    switch (resource) {
      case 'scooters':     result = await handleScooters(supabase, action, body, territory); break
      case 'rides':        result = await handleRides(supabase, action, body, territory); break
      case 'firmware':     result = await handleFirmware(supabase, action, body, territory); break
      case 'users':        result = await handleUsers(supabase, action, body, territory); break
      case 'workshops':    result = await handleWorkshops(supabase, action, body, territory); break
      case 'service-jobs': result = await handleServiceJobs(supabase, action, body, territory); break
      case 'analytics':        result = await handleAnalytics(supabase, action, body, territory); break
      case 'battery-health':   result = await handleBatteryHealth(supabase, action, body, territory); break
      case 'faults':           result = await handleFaults(supabase, action, body, territory); break
      case 'components':       result = await handleComponents(supabase, action, body, territory); break
      case 'firmware-updates': result = await handleFirmwareUpdates(supabase, action, body, territory); break
      case 'events':           result = await handleEvents(supabase, action, body, territory); break
      case 'ownership':        result = await handleOwnership(supabase, action, body, territory); break
      case 'webhooks':         result = await handleWebhooks(supabase, action, body, territory, keyData); break
      default:
        return errorRespond('INVALID_REQUEST', `Unknown resource: ${resource}`, 400, rateLimitHeaders)
    }

    // Handler returned an error?
    if (result.error) {
      const status = result.status || 500
      const responseTime = Date.now() - startTime

      // Log usage (fire-and-forget)
      supabase.from('api_key_usage_log').insert({
        api_key_id: keyData.id,
        endpoint: `${resource}/${action}`,
        ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        response_status: status,
        response_time_ms: responseTime,
      }).then(() => {})

      return errorRespond(
        status === 404 ? 'NOT_FOUND' : 'INVALID_REQUEST',
        result.error,
        status,
        rateLimitHeaders
      )
    }

    // 10. Update last_used_at + request_count (fire-and-forget)
    const responseTime = Date.now() - startTime
    const responseStatus = result.status || 200

    supabase.from('api_keys')
      .update({ last_used_at: new Date().toISOString(), request_count: keyData.request_count + 1 })
      .eq('id', keyData.id)
      .then(() => {})

    // 11. Log usage (fire-and-forget)
    supabase.from('api_key_usage_log').insert({
      api_key_id: keyData.id,
      endpoint: `${resource}/${action}`,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      response_status: responseStatus,
      response_time_ms: responseTime,
    }).then(() => {})

    // 12. Build response
    const requestId = crypto.randomUUID()
    const responseBody: any = {
      success: true,
      data: result.data,
      meta: {
        request_id: requestId,
        rate_limit: {
          limit: keyData.rate_limit_per_minute,
          remaining: rateLimit.remaining,
          reset_at: rateLimit.resetAt,
        },
      },
    }
    if (result.pagination) responseBody.pagination = result.pagination

    return respond(responseBody, responseStatus, rateLimitHeaders)

  } catch (error) {
    console.error('API function error:', error)

    // Log error if we have a key
    if (apiKeyRecord) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)
        supabase.from('api_key_usage_log').insert({
          api_key_id: apiKeyRecord.id,
          endpoint: 'error',
          ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
          response_status: 500,
          response_time_ms: Date.now() - startTime,
        }).then(() => {})
      } catch (_) { /* ignore logging errors */ }
    }

    return errorRespond('SERVER_ERROR', 'Internal server error', 500)
  }
})
