// Supabase Edge Function: Admin API
// Deploy with: supabase functions deploy admin
//
// Single endpoint for all admin operations. Requires admin or manager role.
// Used by the web admin dashboard (static SPA hosted on shared hosting).
//
// Auth: session_token in request body (same as other Edge Functions)
// All requests are POST with JSON body: { session_token, resource, action, ...params }
//
// User levels: admin (global), manager (territory-scoped), normal (no admin access)
//
// Resources & Actions:
//   users:        list, get, create, update, deactivate, export, search
//   scooters:     list, get, create, update, link-user, unlink-user, set-pin, get-pin, reset-pin, export
//   distributors: list, get, create, update, export
//   workshops:    list, get, create, update, export
//   firmware:     list, get, create, update, deactivate, reactivate, export
//   service-jobs: list, get, create, update, cancel, export
//   telemetry:    list, get, health-check, export
//   logs:         list, get, export
//   events:       list, get, stats, export
//   addresses:    list, get, create, update, delete
//   sessions:     list, cleanup
//   validation:   orphaned-scooters, expired-sessions, stale-jobs, run-all
//   dashboard:    stats

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
// Use bcrypt from esm.sh for better Deno Deploy compatibility
import bcrypt from 'https://esm.sh/bcryptjs@2.4.3'

// ============================================================================
// Origin Validation
// ============================================================================

// Allowed origins: set ALLOWED_ORIGINS env var as comma-separated list.
// If not set, allows all origins (development mode).
const ALLOWED_ORIGINS: string[] = (() => {
  const env = Deno.env.get('ALLOWED_ORIGINS')
  if (env) return env.split(',').map(o => o.trim()).filter(Boolean)
  return []  // empty = allow all (dev mode)
})()

function validateOrigin(req: Request): string | null {
  const origin = req.headers.get('Origin') || req.headers.get('Referer')

  // If no allowed origins configured, permit all (dev mode)
  if (ALLOWED_ORIGINS.length === 0) return null

  if (!origin) {
    // Allow requests with no Origin header (e.g. server-to-server, mobile apps)
    return null
  }

  // Check if origin matches any allowed origin
  const originUrl = origin.replace(/\/$/, '')  // strip trailing slash
  for (const allowed of ALLOWED_ORIGINS) {
    if (originUrl === allowed.replace(/\/$/, '')) return null
    // Also match if the Referer starts with an allowed origin
    if (origin.startsWith(allowed.replace(/\/$/, ''))) return null
  }

  return `Origin '${origin}' is not allowed`
}

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS[0] : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, X-Session-Token',
}

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function errorResponse(msg: string, status = 400) {
  return respond({ error: msg }, status)
}

// ============================================================================
// Rate Limiting (in-memory, per-token sliding window)
// ============================================================================

interface RateLimitEntry {
  timestamps: number[]
}

const RATE_LIMIT_WINDOW_MS = 60_000  // 1 minute window
const RATE_LIMIT_MAX_REQUESTS = 120  // 120 requests per minute per token
const rateLimitMap = new Map<string, RateLimitEntry>()

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(key)
    }
  }
}, 300_000)

// Admin audit logging
async function logAdminAction(
  supabase: any,
  admin: any,
  action: string,
  resource: string,
  resourceId: string,
  changes: Record<string, any> = {}
) {
  try {
    await supabase.from('admin_audit_log').insert({
      admin_id: admin.id,
      admin_email: admin.email,
      action,
      resource,
      resource_id: resourceId,
      changes,
      ip_address: 'edge-function' // Could extract from request headers if available
    })
  } catch (err) {
    console.error('Failed to log admin action:', err)
    // Don't fail the request if logging fails
  }
}

function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now()
  let entry = rateLimitMap.get(key)

  if (!entry) {
    entry = { timestamps: [] }
    rateLimitMap.set(key, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)

  if (entry.timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    const oldestInWindow = entry.timestamps[0]
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (now - oldestInWindow)
    return { allowed: false, remaining: 0, retryAfterMs }
  }

  entry.timestamps.push(now)
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - entry.timestamps.length }
}

// ============================================================================
// Password Hashing Utilities
// ============================================================================

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return await bcrypt.hash(password, salt)
}

/**
 * Generate a random temporary password
 */
function generateTempPassword(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function authenticateAdmin(supabase: any, sessionToken: string) {
  if (!sessionToken) return null

  const { data: session } = await supabase
    .from('user_sessions')
    .select('user_id, expires_at')
    .eq('session_token', sessionToken)
    .single()

  if (!session || new Date() > new Date(session.expires_at)) return null

  const { data: user } = await supabase
    .from('users')
    .select('id, email, user_level, roles, distributor_id, workshop_id, first_name, last_name, is_active')
    .eq('id', session.user_id)
    .single()

  if (!user || !user.is_active) return null

  // Check access level - admin and manager can access the admin panel
  // Also support legacy roles for backward compatibility during migration
  const roles: string[] = user.roles || []
  const isAdmin = user.user_level === 'admin' || roles.includes('manufacturer_admin')
  const isManager = user.user_level === 'manager' || roles.includes('distributor_staff') || roles.includes('workshop_staff')

  if (!isAdmin && !isManager) {
    return null  // normal users cannot access admin panel
  }

  // Determine territory based on level and assignments
  let adminRole: 'manufacturer_admin' | 'distributor_staff' | 'workshop_staff'
  let allowedCountries: string[] = []

  if (isAdmin) {
    // Admin: global access (no country filter)
    adminRole = 'manufacturer_admin'
    allowedCountries = []
  } else if (user.distributor_id) {
    // Manager with distributor assignment: scoped to distributor's countries
    adminRole = 'distributor_staff'

    const { data: distributor } = await supabase
      .from('distributors')
      .select('countries')
      .eq('id', user.distributor_id)
      .single()

    if (distributor) {
      allowedCountries = distributor.countries || []
    }
  } else if (user.workshop_id) {
    // Manager with workshop assignment: scoped to workshop territory
    adminRole = 'workshop_staff'

    const { data: workshop } = await supabase
      .from('workshops')
      .select('parent_distributor_id, service_area_countries, distributors(countries)')
      .eq('id', user.workshop_id)
      .single()

    if (workshop) {
      if (workshop.parent_distributor_id && workshop.distributors) {
        allowedCountries = workshop.distributors.countries || []
      } else {
        allowedCountries = workshop.service_area_countries || []
      }
    }
  } else {
    // Manager without assignment - treat as admin for now (shouldn't happen)
    adminRole = 'manufacturer_admin'
    allowedCountries = []
  }

  // Update last activity
  await supabase
    .from('user_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('session_token', sessionToken)

  // Return admin context with territory info
  return {
    user: {
      id: user.id,
      email: user.email,
      user_level: user.user_level,
      roles: user.roles,
      distributor_id: user.distributor_id,
      workshop_id: user.workshop_id,
      first_name: user.first_name,
      last_name: user.last_name,
      is_active: user.is_active
    },
    territory: {
      role: adminRole,
      allowed_countries: allowedCountries,
      distributor_id: user.distributor_id,
      workshop_id: user.workshop_id
    }
  }
}

// ============================================================================
// TERRITORY FILTER UTILITIES
// ============================================================================

interface TerritoryFilter {
  countryField?: string
  countries?: string[]
  workshopId?: string
  distributorId?: string
  additionalConditions?: Record<string, any>
}

function buildTerritoryFilter(resource: string, admin: any): TerritoryFilter | null {
  if (!admin || !admin.territory) return null

  const { territory } = admin

  // Manufacturer admin: no filtering (global access)
  if (territory.role === 'manufacturer_admin') {
    return null
  }

  // Distributor staff filtering
  if (territory.role === 'distributor_staff') {
    const countries = territory.allowed_countries

    switch (resource) {
      case 'users':
        return { countryField: 'home_country', countries }
      case 'scooters':
        return { countryField: 'country_of_registration', countries }
      case 'distributors':
        return { distributorId: territory.distributor_id }
      case 'workshops':
        return { additionalConditions: { parent_distributor_id: territory.distributor_id } }
      case 'events':
        return { countryField: 'country', countries }
      case 'telemetry':
        // Will be applied via scooter join
        return { countryField: 'country_of_registration', countries }
      case 'logs':
        // Firmware upload logs - filter via distributor_id
        return { distributorId: territory.distributor_id }
      default:
        return { countryField: 'country', countries }
    }
  }

  // Workshop staff filtering
  if (territory.role === 'workshop_staff') {
    switch (resource) {
      case 'service-jobs':
        return { workshopId: territory.workshop_id }
      case 'workshops':
        return { additionalConditions: { id: territory.workshop_id } }
      case 'scooters':
        // Only scooters with active service jobs at this workshop
        return { workshopId: territory.workshop_id, additionalConditions: { status: 'in_service' } }
      case 'distributors':
        // If linked to distributor, can view parent distributor
        if (territory.distributor_id) {
          return { distributorId: territory.distributor_id }
        }
        return null
      default:
        return null  // Workshop staff has limited resource access
    }
  }

  return null
}

function applyTerritoryFilter(query: any, filter: TerritoryFilter | null): any {
  if (!filter) return query  // No filtering needed

  // Country-based filtering (users, scooters, events)
  if (filter.countries && filter.countryField) {
    if (filter.countries.length > 0) {
      query = query.in(filter.countryField, filter.countries)
    } else {
      // Empty countries array = no access to any records
      query = query.eq('id', '00000000-0000-0000-0000-000000000000')  // Always false
    }
  }

  // Workshop-based filtering (service jobs)
  if (filter.workshopId) {
    query = query.eq('workshop_id', filter.workshopId)
  }

  // Distributor self-filtering (viewing own distributor only)
  if (filter.distributorId) {
    query = query.eq('id', filter.distributorId)
  }

  // Additional conditions (status, etc.)
  if (filter.additionalConditions) {
    for (const [key, value] of Object.entries(filter.additionalConditions)) {
      query = query.eq(key, value)
    }
  }

  return query
}

// ============================================================================
// RESOURCE HANDLERS
// ============================================================================

async function handleUsers(supabase: any, action: string, body: any, admin: any) {
  const selectFields = 'id, email, first_name, last_name, user_level, roles, distributor_id, workshop_id, is_active, is_verified, home_country, current_country, created_at, last_login'

  if (action === 'list' || action === 'search') {
    let query = supabase.from('users').select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })

    // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
    const territoryFilter = buildTerritoryFilter('users', admin)
    query = applyTerritoryFilter(query, territoryFilter)

    if (body.search) {
      query = query.or(`email.ilike.%${body.search}%,first_name.ilike.%${body.search}%,last_name.ilike.%${body.search}%`)
    }
    if (body.user_level) query = query.eq('user_level', body.user_level)
    if (body.distributor_id) query = query.eq('distributor_id', body.distributor_id)
    if (body.is_active !== undefined) query = query.eq('is_active', body.is_active)
    if (body.home_country) query = query.eq('home_country', body.home_country)
    if (body.role) {
      // Filter by role (roles is a text[] array in PostgreSQL)
      query = query.contains('roles', [body.role])
    }

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ users: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('User ID required')
    const { data, error } = await supabase.from('users')
      .select(`${selectFields}, distributors(name), workshops(name)`)
      .eq('id', body.id).single()
    if (error) return errorResponse('User not found', 404)

    // Get linked scooters
    const { data: scooters } = await supabase.from('user_scooters')
      .select('*, scooters(zyd_serial, model, status)')
      .eq('user_id', body.id)

    // Get recent sessions
    const { data: sessions } = await supabase.from('user_sessions')
      .select('id, device_info, created_at, expires_at, last_activity')
      .eq('user_id', body.id)
      .order('created_at', { ascending: false })
      .limit(10)

    return respond({ user: data, scooters: scooters || [], sessions: sessions || [] })
  }

  if (action === 'create') {
    // Admin-managed user creation
    // Permission: admin can create any level, manager can create normal users only
    if (!body.email) return errorResponse('Email is required')

    const newUserLevel = body.user_level || 'normal'

    // Enforce permission hierarchy
    if (admin.territory.role !== 'manufacturer_admin') {
      // Managers can only create normal users
      if (newUserLevel !== 'normal') {
        return errorResponse('Managers can only create normal-level users')
      }
    }

    // Validate user_level
    if (!['admin', 'manager', 'normal'].includes(newUserLevel)) {
      return errorResponse('user_level must be admin, manager, or normal')
    }

    // Check if email already exists
    const { data: existing } = await supabase.from('users')
      .select('id').eq('email', body.email.toLowerCase()).single()
    if (existing) return errorResponse('Email already registered', 409)

    // Generate a temporary password and hash it with bcrypt
    const tempPassword = generateTempPassword()
    const passwordHash = await hashPassword(tempPassword)

    const newUser: Record<string, any> = {
      email: body.email.toLowerCase(),
      password_hash: passwordHash,
      first_name: body.first_name || null,
      last_name: body.last_name || null,
      user_level: newUserLevel,
      roles: body.roles || [],
      distributor_id: body.distributor_id || null,
      workshop_id: body.workshop_id || null,
      home_country: body.home_country || null,
      current_country: body.current_country || null,
      is_active: true,
      is_verified: true,  // Admin-created users are pre-verified
      created_by: admin.user.id,
    }

    const { data: created, error: createError } = await supabase.from('users')
      .insert(newUser).select(selectFields).single()
    if (createError) return errorResponse(createError.message, 500)

    // Trigger password reset email so the user can set their own password
    const resetToken = crypto.randomUUID()
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 72) // 72 hours for new accounts

    await supabase.from('password_reset_tokens').insert({
      user_id: created.id,
      token: resetToken,
      reset_token: resetToken,
      expires_at: expiresAt.toISOString(),
      used: false
    })

    // Log the event
    await supabase.from('activity_events').insert({
      event_type: 'user_created_by_admin',
      user_id: created.id,
      payload: {
        created_by: admin.user.id,
        created_by_email: admin.user.email,
        user_level: newUserLevel
      },
      timestamp: new Date().toISOString()
    })

    // Log admin action
    await logAdminAction(supabase, admin, 'create', 'users', created.id, record)

    return respond({
      success: true,
      user: created,
      password_reset_token: resetToken,
      message: 'User created. A password reset link should be sent to let them set their password.'
    }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('User ID required')

    // Role validation - prevent privilege escalation
    if (admin.territory.role !== 'manufacturer_admin') {
      // Managers cannot modify roles or territories
      if (body.user_level && body.user_level !== 'normal') {
        return errorResponse('Only manufacturer admins can assign admin/manager levels', 403)
      }
      if (body.roles && body.roles.length > 0) {
        return errorResponse('Only manufacturer admins can assign roles', 403)
      }
      if (body.distributor_id !== undefined || body.workshop_id !== undefined) {
        return errorResponse('Only manufacturer admins can change territory assignments', 403)
      }
    }

    const allowed = ['first_name', 'last_name', 'user_level', 'roles', 'distributor_id',
      'workshop_id', 'is_active', 'is_verified', 'home_country', 'current_country']
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    if (Object.keys(updates).length === 0) return errorResponse('No valid fields to update')

    const { data, error } = await supabase.from('users')
      .update(updates).eq('id', body.id).select(selectFields).single()
    if (error) return errorResponse(error.message, 500)

    // Log admin action
    await logAdminAction(supabase, admin, 'update', 'users', body.id, updates)

    return respond({ success: true, user: data })
  }

  if (action === 'deactivate') {
    if (!body.id) return errorResponse('User ID required')
    const { data, error } = await supabase.from('users')
      .update({ is_active: false }).eq('id', body.id).select(selectFields).single()
    if (error) return errorResponse(error.message, 500)

    // Kill active sessions
    await supabase.from('user_sessions').delete().eq('user_id', body.id)

    // Log admin action
    await logAdminAction(supabase, admin, 'deactivate', 'users', body.id, { is_active: { old: true, new: false } })

    return respond({ success: true, user: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('users')
      .select(selectFields).order('created_at', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ users: data })
  }

  return errorResponse('Invalid action for users: ' + action)
}

async function handleScooters(supabase: any, action: string, body: any, admin: any) {
  const selectFields = '*, distributors(name), scooter_models(code, name), battery_variants(code, name, capacity_ah), colour_options(code, name, hex_colour), block_codes(code, name, regions)'

  if (action === 'list') {
    let query = supabase.from('scooters').select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })

    // SPECIAL CASE: Workshop staff can only see scooters with active service jobs at their workshop
    if (admin.territory.role === 'workshop_staff') {
      const { data: activeJobs } = await supabase
        .from('service_jobs')
        .select('scooter_id')
        .eq('workshop_id', admin.territory.workshop_id)
        .not('status', 'in', '("completed","cancelled")')

      const scooterIds = activeJobs?.map((j: any) => j.scooter_id) || []
      if (scooterIds.length > 0) {
        query = query.in('id', scooterIds)
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    } else {
      // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
      const territoryFilter = buildTerritoryFilter('scooters', admin)
      query = applyTerritoryFilter(query, territoryFilter)
    }

    if (body.search) {
      query = query.or(`zyd_serial.ilike.%${body.search}%,model.ilike.%${body.search}%,serial_number.ilike.%${body.search}%`)
    }
    if (body.distributor_id) query = query.eq('distributor_id', body.distributor_id)
    if (body.status) query = query.eq('status', body.status)
    if (body.country_of_registration) query = query.eq('country_of_registration', body.country_of_registration)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ scooters: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Scooter ID required')
    const { data, error } = await supabase.from('scooters')
      .select(selectFields).eq('id', body.id).single()
    if (error) return errorResponse('Scooter not found', 404)

    // Get owners
    const { data: owners } = await supabase.from('user_scooters')
      .select('*, users(email, first_name, last_name)')
      .eq('scooter_id', body.id)

    // Get latest telemetry
    const { data: telemetry } = await supabase.from('scooter_telemetry')
      .select('*').eq('scooter_id', body.id)
      .order('captured_at', { ascending: false }).limit(1)

    // Get service jobs
    const { data: jobs } = await supabase.from('service_jobs')
      .select('id, status, issue_description, booked_date, workshops(name)')
      .eq('scooter_id', body.id)
      .order('booked_date', { ascending: false }).limit(5)

    return respond({
      scooter: data, owners: owners || [],
      latest_telemetry: telemetry?.[0] || null,
      service_jobs: jobs || []
    })
  }

  if (action === 'create') {
    if (!body.zyd_serial) return errorResponse('ZYD serial number required')
    const record: Record<string, any> = {
      zyd_serial: body.zyd_serial,
      distributor_id: body.distributor_id || null,
      model: body.model || null,
      hw_version: body.hw_version || null,
      notes: body.notes || null,
      model_id: body.model_id || null,
      battery_variant_id: body.battery_variant_id || null,
      colour_id: body.colour_id || null,
      block_code_id: body.block_code_id || null,
      mac_address: body.mac_address || null,
    }

    // Auto-generate serial number if model, variant, colour, and block are provided
    if (body.model_id && body.battery_variant_id && body.colour_id && body.block_code_id) {
      try {
        // Look up the codes from reference tables
        const [modelRes, variantRes, colourRes, blockRes] = await Promise.all([
          supabase.from('scooter_models').select('code').eq('id', body.model_id).single(),
          supabase.from('battery_variants').select('code').eq('id', body.battery_variant_id).single(),
          supabase.from('colour_options').select('code').eq('id', body.colour_id).single(),
          supabase.from('block_codes').select('code').eq('id', body.block_code_id).single(),
        ])

        if (modelRes.data && variantRes.data && colourRes.data && blockRes.data) {
          // Call the next_serial_number function
          const { data: serialResult, error: serialError } = await supabase.rpc('next_serial_number', {
            p_block: blockRes.data.code,
            p_model: modelRes.data.code,
            p_variant: variantRes.data.code,
            p_colour: colourRes.data.code,
          })
          if (!serialError && serialResult) {
            record.serial_number = serialResult
            // Set "at first registration" snapshot
            record.original_serial_number = serialResult
            record.original_zyd_serial = body.zyd_serial
            record.original_mac_address = body.mac_address || null
          }
        }
      } catch (e) {
        console.warn('Failed to auto-generate serial number:', e)
      }
    }

    // If first_registration_address is provided, set it
    if (body.first_registration_address) {
      record.first_registration_address = body.first_registration_address
    }

    const { data, error } = await supabase.from('scooters')
      .insert(record).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, scooter: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Scooter ID required')
    const allowed = ['distributor_id', 'model', 'hw_version', 'notes', 'status',
      'firmware_version', 'country_of_registration',
      'model_id', 'battery_variant_id', 'colour_id', 'block_code_id',
      'mac_address', 'serial_number']
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    if (Object.keys(updates).length === 0) return errorResponse('No valid fields to update')

    const { data, error } = await supabase.from('scooters')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, scooter: data })
  }

  if (action === 'link-user') {
    if (!body.scooter_id || !body.user_id) return errorResponse('scooter_id and user_id required')
    const { data, error } = await supabase.from('user_scooters')
      .insert({
        scooter_id: body.scooter_id, user_id: body.user_id,
        zyd_serial: body.zyd_serial || '', is_primary: body.is_primary || false,
      }).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, link: data }, 201)
  }

  if (action === 'unlink-user') {
    if (!body.scooter_id || !body.user_id) return errorResponse('scooter_id and user_id required')
    const { error } = await supabase.from('user_scooters')
      .delete().eq('scooter_id', body.scooter_id).eq('user_id', body.user_id)
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true })
  }

  // ============================================================================
  // PIN Management Actions
  // ============================================================================

  if (action === 'set-pin') {
    const { scooter_id, pin } = body
    if (!scooter_id || !pin) {
      return errorResponse('Scooter ID and PIN required', 400)
    }

    // Validate PIN format (6 digits)
    if (!/^\d{6}$/.test(pin)) {
      return errorResponse('PIN must be exactly 6 digits', 400)
    }

    // Check scooter exists and get owner
    const { data: scooter, error: scooterError } = await supabase
      .from('scooters')
      .select('owner_id, zyd_serial')
      .eq('id', scooter_id)
      .single()

    if (scooterError || !scooter) {
      return errorResponse('Scooter not found', 404)
    }

    // Authorization: Only owner or manufacturer_admin can set PIN
    const isOwner = scooter.owner_id === admin.id
    const isManufacturerAdmin = admin.territory.role === 'manufacturer_admin'

    if (!isOwner && !isManufacturerAdmin) {
      return errorResponse('Only scooter owner or manufacturer admin can set PIN', 403)
    }

    // Get encryption key from environment
    const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
    if (!ENCRYPTION_KEY) {
      console.error('PIN_ENCRYPTION_KEY not configured')
      return errorResponse('PIN encryption not configured', 500)
    }

    // Call database function to encrypt and store PIN
    const { error: setPinError } = await supabase.rpc('set_scooter_pin', {
      p_scooter_id: scooter_id,
      p_pin: pin,
      p_user_id: admin.id,
      p_encryption_key: ENCRYPTION_KEY
    })

    if (setPinError) {
      console.error('PIN set error:', setPinError)
      return errorResponse('Failed to set PIN: ' + setPinError.message, 500)
    }

    // Log the action (don't include the actual PIN in the log)
    await logAdminAction(supabase, admin, 'set-pin', 'scooters', scooter_id, {
      message: 'PIN set/updated',
      scooter_serial: scooter.zyd_serial
    })

    return respond({ success: true, message: 'PIN set successfully' })
  }

  if (action === 'get-pin') {
    const { scooter_id } = body
    if (!scooter_id) {
      return errorResponse('Scooter ID required', 400)
    }

    // Check scooter exists and get owner
    const { data: scooter, error: scooterError } = await supabase
      .from('scooters')
      .select('owner_id, zyd_serial, pin_encrypted')
      .eq('id', scooter_id)
      .single()

    if (scooterError || !scooter) {
      return errorResponse('Scooter not found', 404)
    }

    if (!scooter.pin_encrypted) {
      return errorResponse('No PIN set for this scooter', 404)
    }

    // Authorization: Only owner or manufacturer_admin can retrieve PIN
    const isOwner = scooter.owner_id === admin.id
    const isManufacturerAdmin = admin.territory.role === 'manufacturer_admin'

    if (!isOwner && !isManufacturerAdmin) {
      return errorResponse('Only scooter owner or manufacturer admin can retrieve PIN', 403)
    }

    // Get encryption key from environment
    const ENCRYPTION_KEY = Deno.env.get('PIN_ENCRYPTION_KEY')
    if (!ENCRYPTION_KEY) {
      console.error('PIN_ENCRYPTION_KEY not configured')
      return errorResponse('PIN encryption not configured', 500)
    }

    // Call database function to decrypt PIN
    const { data: decryptedPin, error: getPinError } = await supabase.rpc('get_scooter_pin', {
      p_scooter_id: scooter_id,
      p_encryption_key: ENCRYPTION_KEY
    })

    if (getPinError) {
      console.error('PIN retrieval error:', getPinError)
      return errorResponse('Failed to retrieve PIN: ' + getPinError.message, 500)
    }

    if (!decryptedPin) {
      return errorResponse('Failed to decrypt PIN', 500)
    }

    // Log the retrieval (don't include the actual PIN in the log)
    await logAdminAction(supabase, admin, 'retrieve-pin', 'scooters', scooter_id, {
      message: 'PIN retrieved',
      retrieved_by: admin.email,
      scooter_serial: scooter.zyd_serial
    })

    return respond({ pin: decryptedPin })
  }

  if (action === 'reset-pin') {
    const { scooter_id } = body
    if (!scooter_id) {
      return errorResponse('Scooter ID required', 400)
    }

    // Authorization: Only manufacturer_admin can reset PINs
    if (admin.territory.role !== 'manufacturer_admin') {
      return errorResponse('Only manufacturer admins can reset PINs', 403)
    }

    // Check scooter exists
    const { data: scooter, error: scooterError } = await supabase
      .from('scooters')
      .select('zyd_serial, pin_encrypted')
      .eq('id', scooter_id)
      .single()

    if (scooterError || !scooter) {
      return errorResponse('Scooter not found', 404)
    }

    if (!scooter.pin_encrypted) {
      return errorResponse('No PIN set for this scooter', 404)
    }

    // Call database function to clear PIN
    const { error: clearPinError } = await supabase.rpc('clear_scooter_pin', {
      p_scooter_id: scooter_id
    })

    if (clearPinError) {
      console.error('PIN reset error:', clearPinError)
      return errorResponse('Failed to reset PIN: ' + clearPinError.message, 500)
    }

    // Log the reset
    await logAdminAction(supabase, admin, 'reset-pin', 'scooters', scooter_id, {
      message: 'PIN reset by admin',
      admin_email: admin.email,
      scooter_serial: scooter.zyd_serial
    })

    return respond({ success: true, message: 'PIN reset successfully' })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('scooters')
      .select(selectFields).order('created_at', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ scooters: data })
  }

  return errorResponse('Invalid action for scooters: ' + action)
}

async function handleDistributors(supabase: any, action: string, body: any, admin: any) {
  const selectFields = '*'

  if (action === 'list') {
    let query = supabase.from('distributors').select(selectFields, { count: 'exact' })
      .order('name', { ascending: true })

    // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
    const territoryFilter = buildTerritoryFilter('distributors', admin)
    query = applyTerritoryFilter(query, territoryFilter)

    if (body.is_active !== undefined) query = query.eq('is_active', body.is_active)
    if (body.search) query = query.ilike('name', `%${body.search}%`)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ distributors: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Distributor ID required')
    const { data, error } = await supabase.from('distributors')
      .select('*').eq('id', body.id).single()
    if (error) return errorResponse('Distributor not found', 404)

    // Get addresses (using new distributor_addresses table)
    const { data: addresses } = await supabase.from('distributor_addresses')
      .select('*').eq('distributor_id', body.id)

    // Get workshops
    const { data: workshops } = await supabase.from('workshops')
      .select('id, name, is_active, phone, email')
      .eq('parent_distributor_id', body.id)

    // Get staff count
    const { count: staffCount } = await supabase.from('users')
      .select('id', { count: 'exact', head: true })
      .eq('distributor_id', body.id)

    // Get scooter count
    const { count: scooterCount } = await supabase.from('scooters')
      .select('id', { count: 'exact', head: true })
      .eq('distributor_id', body.id)

    return respond({
      distributor: data, addresses: addresses || [],
      workshops: workshops || [], staff_count: staffCount || 0,
      scooter_count: scooterCount || 0
    })
  }

  if (action === 'create') {
    if (!body.name) return errorResponse('Distributor name required')

    const { data, error } = await supabase.from('distributors')
      .insert({
        name: body.name,
        countries: body.countries || [],
        phone: body.phone || null,
        email: body.email || null,
        is_active: true,
      }).select().single()

    if (error) return errorResponse(error.message, 500)

    return respond({ success: true, distributor: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Distributor ID required')
    const allowed = ['name', 'countries', 'phone', 'email', 'is_active']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    const { data, error } = await supabase.from('distributors')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, distributor: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('distributors')
      .select('*').order('name', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ distributors: data })
  }

  return errorResponse('Invalid action for distributors: ' + action)
}

async function handleWorkshops(supabase: any, action: string, body: any, admin: any) {
  if (action === 'list') {
    let query = supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)', { count: 'exact' })
      .order('name', { ascending: true })

    // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
    const territoryFilter = buildTerritoryFilter('workshops', admin)
    query = applyTerritoryFilter(query, territoryFilter)

    if (body.distributor_id) query = query.eq('parent_distributor_id', body.distributor_id)
    if (body.is_active !== undefined) query = query.eq('is_active', body.is_active)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ workshops: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Workshop ID required')
    const { data, error } = await supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)')
      .eq('id', body.id).single()
    if (error) return errorResponse('Workshop not found', 404)

    const { data: addresses } = await supabase.from('workshop_addresses')
      .select('*').eq('workshop_id', body.id)

    const { data: staff } = await supabase.from('users')
      .select('id, email, first_name, last_name, is_active')
      .eq('workshop_id', body.id)

    const { count: jobCount } = await supabase.from('service_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_id', body.id)
      .not('status', 'in', '("completed","cancelled")')

    return respond({
      workshop: data, addresses: addresses || [],
      staff: staff || [], active_job_count: jobCount || 0
    })
  }

  if (action === 'create') {
    if (!body.name) return errorResponse('Workshop name required')

    const { data, error } = await supabase.from('workshops')
      .insert({
        name: body.name,
        phone: body.phone || null,
        email: body.email || null,
        parent_distributor_id: body.parent_distributor_id || null,
        service_area_countries: body.service_area_countries || [],
        is_active: true,
      }).select().single()

    if (error) return errorResponse(error.message, 500)

    return respond({ success: true, workshop: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Workshop ID required')
    const allowed = ['name', 'phone', 'email', 'parent_distributor_id',
      'service_area_countries', 'is_active']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    const { data, error } = await supabase.from('workshops')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, workshop: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)')
      .order('name', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ workshops: data })
  }

  return errorResponse('Invalid action for workshops: ' + action)
}

async function handleFirmware(supabase: any, action: string, body: any, _admin: any) {
  if (action === 'list') {
    let query = supabase.from('firmware_versions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (body.is_active !== undefined) query = query.eq('is_active', body.is_active)
    if (body.hw_version) query = query.eq('target_hw_version', body.hw_version)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ firmware: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Firmware ID required')
    const { data, error } = await supabase.from('firmware_versions')
      .select('*').eq('id', body.id).single()
    if (error) return errorResponse('Firmware not found', 404)

    // Get HW targets
    const { data: targets } = await supabase.from('firmware_hw_targets')
      .select('hw_version').eq('firmware_version_id', body.id)

    // Get upload stats
    const { count: totalUploads } = await supabase.from('firmware_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('firmware_version_id', body.id)
    const { count: completedUploads } = await supabase.from('firmware_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('firmware_version_id', body.id).eq('status', 'completed')
    const { count: failedUploads } = await supabase.from('firmware_uploads')
      .select('id', { count: 'exact', head: true })
      .eq('firmware_version_id', body.id).eq('status', 'failed')

    return respond({
      firmware: data,
      hw_targets: (targets || []).map((t: any) => t.hw_version),
      upload_stats: {
        total: totalUploads || 0, completed: completedUploads || 0,
        failed: failedUploads || 0,
        success_rate: totalUploads ? Math.round(((completedUploads || 0) / totalUploads) * 100) : 0
      }
    })
  }

  if (action === 'create') {
    if (!body.version_label || !body.file_path) return errorResponse('version_label and file_path required')
    const { data, error } = await supabase.from('firmware_versions')
      .insert({
        version_label: body.version_label, file_path: body.file_path,
        file_size_bytes: body.file_size_bytes || 0,
        target_hw_version: body.target_hw_version || null,
        min_sw_version: body.min_sw_version || null,
        release_notes: body.release_notes || null,
        access_level: body.access_level || 'public', is_active: true,
      }).select().single()
    if (error) return errorResponse(error.message, 500)

    // Create HW targets
    if (body.hw_targets && Array.isArray(body.hw_targets)) {
      const targets = body.hw_targets.map((hw: string) => ({
        firmware_version_id: data.id, hw_version: hw,
      }))
      await supabase.from('firmware_hw_targets').insert(targets)
    }

    return respond({ success: true, firmware: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Firmware ID required')
    const allowed = ['version_label', 'min_sw_version', 'release_notes',
      'access_level', 'target_hw_version']
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    const { data, error } = await supabase.from('firmware_versions')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)

    // Update HW targets if provided
    if (body.hw_targets && Array.isArray(body.hw_targets)) {
      await supabase.from('firmware_hw_targets').delete().eq('firmware_version_id', body.id)
      const targets = body.hw_targets.map((hw: string) => ({
        firmware_version_id: body.id, hw_version: hw,
      }))
      if (targets.length > 0) await supabase.from('firmware_hw_targets').insert(targets)
    }

    return respond({ success: true, firmware: data })
  }

  if (action === 'deactivate') {
    if (!body.id) return errorResponse('Firmware ID required')
    const { data, error } = await supabase.from('firmware_versions')
      .update({ is_active: false }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, firmware: data })
  }

  if (action === 'reactivate') {
    if (!body.id) return errorResponse('Firmware ID required')
    const { data, error } = await supabase.from('firmware_versions')
      .update({ is_active: true }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, firmware: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('firmware_versions')
      .select('*').order('created_at', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ firmware: data })
  }

  return errorResponse('Invalid action for firmware: ' + action)
}

async function handleServiceJobs(supabase: any, action: string, body: any, admin: any) {
  const selectFields = '*, scooters(zyd_serial, model, status), workshops(name), users!service_jobs_customer_id_fkey(email, first_name, last_name)'

  if (action === 'list') {
    let query = supabase.from('service_jobs')
      .select(selectFields, { count: 'exact' })
      .order('booked_date', { ascending: false })

    // SPECIAL CASE: Distributor staff needs to join through scooters for territory filtering
    if (admin.territory.role === 'distributor_staff') {
      const { data: territoryScooters } = await supabase
        .from('scooters')
        .select('id')
        .in('country_of_registration', admin.territory.allowed_countries)

      const scooterIds = territoryScooters?.map((s: any) => s.id) || []
      if (scooterIds.length > 0) {
        query = query.in('scooter_id', scooterIds)
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    } else {
      // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
      const territoryFilter = buildTerritoryFilter('service-jobs', admin)
      query = applyTerritoryFilter(query, territoryFilter)
    }

    if (body.status) query = query.eq('status', body.status)
    if (body.workshop_id) query = query.eq('workshop_id', body.workshop_id)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ jobs: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Job ID required')
    const { data, error } = await supabase.from('service_jobs')
      .select(selectFields).eq('id', body.id).single()
    if (error) return errorResponse('Job not found', 404)
    return respond({ job: data })
  }

  if (action === 'create') {
    if (!body.scooter_id || !body.workshop_id || !body.issue_description) {
      return errorResponse('scooter_id, workshop_id, and issue_description required')
    }
    // Find customer
    let customerId = body.customer_id
    if (!customerId) {
      const { data: link } = await supabase.from('user_scooters')
        .select('user_id').eq('scooter_id', body.scooter_id)
        .order('registered_at', { ascending: false }).limit(1).single()
      customerId = link?.user_id
    }
    if (!customerId) return errorResponse('Could not determine scooter owner. Provide customer_id.')

    const { data, error } = await supabase.from('service_jobs')
      .insert({
        scooter_id: body.scooter_id, workshop_id: body.workshop_id,
        customer_id: customerId, technician_id: body.technician_id || null,
        issue_description: body.issue_description, status: 'booked',
        booked_date: new Date().toISOString(),
      }).select().single()
    if (error) return errorResponse(error.message, 500)

    await supabase.from('scooters').update({ status: 'in_service' }).eq('id', body.scooter_id)
    return respond({ success: true, job: data }, 201)
  }

  const validTransitions: Record<string, string[]> = {
    'booked': ['in_progress', 'cancelled'],
    'in_progress': ['awaiting_parts', 'ready_for_collection', 'completed', 'cancelled'],
    'awaiting_parts': ['in_progress', 'cancelled'],
    'ready_for_collection': ['completed', 'cancelled'],
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Job ID required')
    const { data: existing } = await supabase.from('service_jobs')
      .select('id, status, scooter_id').eq('id', body.id).single()
    if (!existing) return errorResponse('Job not found', 404)

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.status && body.status !== existing.status) {
      const allowed = validTransitions[existing.status]
      if (!allowed || !allowed.includes(body.status)) {
        return errorResponse(`Cannot transition from '${existing.status}' to '${body.status}'`)
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
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, job: data })
  }

  if (action === 'cancel') {
    if (!body.id) return errorResponse('Job ID required')
    const { data: existing } = await supabase.from('service_jobs')
      .select('id, status, scooter_id').eq('id', body.id).single()
    if (!existing) return errorResponse('Job not found', 404)
    if (['completed', 'cancelled'].includes(existing.status)) {
      return errorResponse(`Cannot cancel a '${existing.status}' job`)
    }
    const { data, error } = await supabase.from('service_jobs')
      .update({ status: 'cancelled', completed_date: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    await supabase.from('scooters').update({ status: 'active' }).eq('id', existing.scooter_id)
    return respond({ success: true, job: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('service_jobs')
      .select(selectFields).order('booked_date', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ jobs: data })
  }

  return errorResponse('Invalid action for service-jobs: ' + action)
}

async function handleTelemetry(supabase: any, action: string, body: any, admin: any) {
  if (action === 'list') {
    let query = supabase.from('scooter_telemetry')
      .select('*, scooters(zyd_serial, model), users(email)', { count: 'exact' })
      .order('scanned_at', { ascending: false })

    // TERRITORY FILTER: Filter via scooter country (telemetry doesn't have country directly)
    if (admin.territory.role !== 'manufacturer_admin') {
      let scooterQuery = supabase.from('scooters').select('id')
      const territoryFilter = buildTerritoryFilter('scooters', admin)
      scooterQuery = applyTerritoryFilter(scooterQuery, territoryFilter)

      const { data: scooters } = await scooterQuery
      const scooterIds = scooters?.map((s: any) => s.id) || []

      if (scooterIds.length > 0) {
        query = query.in('scooter_id', scooterIds)
      } else {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000')
      }
    }

    if (body.scooter_id) query = query.eq('scooter_id', body.scooter_id)
    if (body.user_id) query = query.eq('user_id', body.user_id)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ telemetry: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Telemetry ID required')
    const { data, error } = await supabase.from('scooter_telemetry')
      .select('*, scooters(zyd_serial, model), users(email)').eq('id', body.id).single()
    if (error) return errorResponse('Record not found', 404)
    return respond({ telemetry: data })
  }

  if (action === 'health-check') {
    if (!body.scooter_id) return errorResponse('scooter_id required')
    const { data: records } = await supabase.from('scooter_telemetry')
      .select('*').eq('scooter_id', body.scooter_id)
      .order('scanned_at', { ascending: false }).limit(10)

    if (!records || records.length === 0) return respond({ health: { status: 'no_data' } })

    const latest = records[0]
    const flags: string[] = []
    if (latest.battery_charge_cycles > 500) flags.push('High battery cycles: ' + latest.battery_charge_cycles)
    if (latest.battery_soc !== null && latest.battery_soc < 20) flags.push('Low battery: ' + latest.battery_soc + '%')
    if (latest.fault_codes && Object.keys(latest.fault_codes).length > 0) flags.push('Active fault codes')

    const daysSince = Math.floor((Date.now() - new Date(latest.scanned_at).getTime()) / 86400000)
    if (daysSince > 90) flags.push('Stale data: ' + daysSince + ' days since last reading')

    return respond({
      health: {
        status: flags.length === 0 ? 'healthy' : 'warnings',
        flags, latest_reading: latest, readings_count: records.length,
        days_since_last: daysSince
      }
    })
  }

  if (action === 'export') {
    let query = supabase.from('scooter_telemetry')
      .select('*, scooters(zyd_serial)').order('scanned_at', { ascending: false })
    if (body.scooter_id) query = query.eq('scooter_id', body.scooter_id)
    const { data, error } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ telemetry: data })
  }

  return errorResponse('Invalid action for telemetry: ' + action)
}

async function handleLogs(supabase: any, action: string, body: any, admin: any) {
  const selectFields = '*, scooters(zyd_serial), firmware_versions(version_label), distributors(name)'

  if (action === 'list') {
    let query = supabase.from('firmware_uploads')
      .select(selectFields, { count: 'exact' })
      .order('started_at', { ascending: false })

    // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
    const territoryFilter = buildTerritoryFilter('logs', admin)
    query = applyTerritoryFilter(query, territoryFilter)

    if (body.status) query = query.eq('status', body.status)
    if (body.distributor_id) query = query.eq('distributor_id', body.distributor_id)
    if (body.scooter_id) query = query.eq('scooter_id', body.scooter_id)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ logs: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Log ID required')
    const { data, error } = await supabase.from('firmware_uploads')
      .select(selectFields).eq('id', body.id).single()
    if (error) return errorResponse('Log not found', 404)
    return respond({ log: data })
  }

  if (action === 'export') {
    const { data, error } = await supabase.from('firmware_uploads')
      .select(selectFields).order('started_at', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ logs: data })
  }

  return errorResponse('Invalid action for logs: ' + action)
}

async function handleEvents(supabase: any, action: string, body: any, admin: any) {
  if (action === 'list') {
    let query = supabase.from('activity_events')
      .select('*, users(email), scooters(zyd_serial)', { count: 'exact' })
      .order('timestamp', { ascending: false })

    // APPLY TERRITORY FILTER FIRST (before user-supplied filters)
    const territoryFilter = buildTerritoryFilter('events', admin)
    query = applyTerritoryFilter(query, territoryFilter)

    if (body.event_type) query = query.eq('event_type', body.event_type)
    if (body.country) query = query.eq('country', body.country)
    if (body.scooter_id) query = query.eq('scooter_id', body.scooter_id)
    if (body.user_id) query = query.eq('user_id', body.user_id)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ events: data, total: count })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Event ID required')
    const { data, error } = await supabase.from('activity_events')
      .select('*, users(email, first_name, last_name), scooters(zyd_serial, model)')
      .eq('id', body.id).single()
    if (error) return errorResponse('Event not found', 404)
    return respond({ event: data })
  }

  if (action === 'stats') {
    // Get event type counts
    const { data: allEvents } = await supabase.from('activity_events')
      .select('event_type')
    const typeCounts: Record<string, number> = {}
    for (const e of allEvents || []) {
      typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1
    }

    // Get recent count (last 24h)
    const yesterday = new Date(Date.now() - 86400000).toISOString()
    const { count: recentCount } = await supabase.from('activity_events')
      .select('id', { count: 'exact', head: true })
      .gte('timestamp', yesterday)

    return respond({ stats: { type_counts: typeCounts, last_24h: recentCount || 0, total: allEvents?.length || 0 } })
  }

  if (action === 'export') {
    let query = supabase.from('activity_events')
      .select('*, users(email), scooters(zyd_serial)')
      .order('timestamp', { ascending: false })
    if (body.event_type) query = query.eq('event_type', body.event_type)
    const { data, error } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ events: data })
  }

  return errorResponse('Invalid action for events: ' + action)
}

async function handleAddresses(supabase: any, action: string, body: any, _admin: any) {
  // Helper to determine which table and ID field to use
  const getTableInfo = (entityType: string) => {
    if (entityType === 'distributor') {
      return { table: 'distributor_addresses', idField: 'distributor_id' }
    } else if (entityType === 'workshop') {
      return { table: 'workshop_addresses', idField: 'workshop_id' }
    }
    throw new Error('Invalid entity_type. Must be "distributor" or "workshop"')
  }

  if (action === 'list') {
    if (!body.entity_type) {
      return errorResponse('entity_type required (distributor or workshop)')
    }
    const { table, idField } = getTableInfo(body.entity_type)

    let query = supabase.from(table).select('*').order('created_at', { ascending: false })
    if (body.entity_id) query = query.eq(idField, body.entity_id)

    const { data, error } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ addresses: data })
  }

  if (action === 'get') {
    if (!body.id || !body.entity_type) {
      return errorResponse('id and entity_type required')
    }
    const { table } = getTableInfo(body.entity_type)

    const { data, error } = await supabase.from(table)
      .select('*').eq('id', body.id).single()
    if (error) return errorResponse('Address not found', 404)
    return respond({ address: data })
  }

  if (action === 'create') {
    if (!body.entity_type || !body.entity_id || !body.line_1 || !body.city || !body.postcode || !body.country) {
      return errorResponse('entity_type, entity_id, line_1, city, postcode, country required')
    }
    const { table, idField } = getTableInfo(body.entity_type)

    const insertData: any = {
      [idField]: body.entity_id,
      line_1: body.line_1,
      line_2: body.line_2 || null,
      city: body.city,
      region: body.region || null,
      postcode: body.postcode,
      country: body.country,
      is_primary: body.is_primary !== undefined ? body.is_primary : true,
    }

    const { data, error } = await supabase.from(table)
      .insert(insertData).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, address: data }, 201)
  }

  if (action === 'update') {
    if (!body.id || !body.entity_type) {
      return errorResponse('id and entity_type required')
    }
    const { table } = getTableInfo(body.entity_type)

    const allowed = ['line_1', 'line_2', 'city', 'region', 'postcode', 'country', 'is_primary']
    const updates: Record<string, any> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }

    const { data, error } = await supabase.from(table)
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, address: data })
  }

  if (action === 'delete') {
    if (!body.id || !body.entity_type) {
      return errorResponse('id and entity_type required')
    }
    const { table } = getTableInfo(body.entity_type)

    const { error } = await supabase.from(table).delete().eq('id', body.id)
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true })
  }

  return errorResponse('Invalid action for addresses: ' + action)
}

async function handleSessions(supabase: any, action: string, body: any, _admin: any) {
  if (action === 'list') {
    let query = supabase.from('user_sessions')
      .select('*, users(email, first_name, last_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
    if (body.user_id) query = query.eq('user_id', body.user_id)

    const limit = body.limit || 50
    const offset = body.offset || 0
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ sessions: data, total: count })
  }

  if (action === 'cleanup') {
    const { data, error } = await supabase.from('user_sessions')
      .delete().lt('expires_at', new Date().toISOString())
      .select('id')
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, deleted: data?.length || 0 })
  }

  return errorResponse('Invalid action for sessions: ' + action)
}

async function handleValidation(supabase: any, action: string, _body: any, _admin: any) {
  if (action === 'orphaned-scooters') {
    const { data, error } = await supabase.from('scooters')
      .select('id, zyd_serial, model, created_at')
      .is('distributor_id', null)
    if (error) return errorResponse(error.message, 500)
    return respond({ orphaned_scooters: data || [], count: data?.length || 0 })
  }

  if (action === 'expired-sessions') {
    const { data, count } = await supabase.from('user_sessions')
      .select('id, user_id, expires_at, users(email)', { count: 'exact' })
      .lt('expires_at', new Date().toISOString())
    return respond({ expired_sessions: data || [], count: count || 0 })
  }

  if (action === 'stale-jobs') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data } = await supabase.from('service_jobs')
      .select('id, status, booked_date, scooters(zyd_serial), workshops(name)')
      .not('status', 'in', '("completed","cancelled")')
      .lt('booked_date', thirtyDaysAgo)
    return respond({ stale_jobs: data || [], count: data?.length || 0 })
  }

  if (action === 'run-all') {
    const { data: orphaned } = await supabase.from('scooters')
      .select('id').is('distributor_id', null)
    const { count: expired } = await supabase.from('user_sessions')
      .select('id', { count: 'exact', head: true })
      .lt('expires_at', new Date().toISOString())
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()
    const { data: stale } = await supabase.from('service_jobs')
      .select('id')
      .not('status', 'in', '("completed","cancelled")')
      .lt('booked_date', thirtyDaysAgo)

    return respond({
      summary: {
        orphaned_scooters: orphaned?.length || 0,
        expired_sessions: expired || 0,
        stale_jobs: stale?.length || 0,
      }
    })
  }

  return errorResponse('Invalid action for validation: ' + action)
}

async function handleDashboard(supabase: any, _action: string, _body: any, admin: any) {
  // Gather summary stats for the dashboard (with territory filtering)
  // Optimized with parallel query execution grouped by dependencies

  // Helper: Get workshop scooter IDs (reusable for workshop staff)
  let workshopScooterIds: string[] | null = null
  if (admin.territory.role === 'workshop_staff') {
    const { data: activeJobs } = await supabase
      .from('service_jobs')
      .select('scooter_id')
      .eq('workshop_id', admin.territory.workshop_id)
      .not('status', 'in', '("completed","cancelled")')
    workshopScooterIds = activeJobs?.map((j: any) => j.scooter_id) || []
  }

  // GROUP 1: Simple counts (parallel) - no dependencies
  const [
    { count: userCount },
    { count: distributorCount },
    { count: workshopCount },
    { count: firmwareCount }
  ] = await Promise.all([
    // Users
    (() => {
      let q = supabase.from('users').select('id', { count: 'exact', head: true }).eq('is_active', true)
      const filter = buildTerritoryFilter('users', admin)
      return applyTerritoryFilter(q, filter)
    })(),
    // Distributors
    (() => {
      let q = supabase.from('distributors').select('id', { count: 'exact', head: true }).eq('is_active', true)
      const filter = buildTerritoryFilter('distributors', admin)
      return applyTerritoryFilter(q, filter)
    })(),
    // Workshops
    (() => {
      let q = supabase.from('workshops').select('id', { count: 'exact', head: true }).eq('is_active', true)
      const filter = buildTerritoryFilter('workshops', admin)
      return applyTerritoryFilter(q, filter)
    })(),
    // Firmware (global)
    supabase.from('firmware_versions')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
  ])

  // GROUP 2: Scooter-related queries (parallel, uses workshopScooterIds)
  const [
    { count: scooterCount },
    { data: scooterStatuses },
    activeJobsResult
  ] = await Promise.all([
    // Scooters count
    (() => {
      let q = supabase.from('scooters').select('id', { count: 'exact', head: true })
      if (admin.territory.role === 'workshop_staff') {
        if (workshopScooterIds && workshopScooterIds.length > 0) {
          q = q.in('id', workshopScooterIds)
        } else {
          q = q.eq('id', '00000000-0000-0000-0000-000000000000')
        }
      } else {
        const filter = buildTerritoryFilter('scooters', admin)
        q = applyTerritoryFilter(q, filter)
      }
      return q
    })(),
    // Scooter statuses (for breakdown)
    (() => {
      let q = supabase.from('scooters').select('status')
      if (admin.territory.role === 'workshop_staff') {
        if (workshopScooterIds && workshopScooterIds.length > 0) {
          q = q.in('id', workshopScooterIds)
        } else {
          q = q.eq('id', '00000000-0000-0000-0000-000000000000')
        }
      } else {
        const filter = buildTerritoryFilter('scooters', admin)
        q = applyTerritoryFilter(q, filter)
      }
      return q
    })(),
    // Active service jobs (needs special handling for distributor_staff)
    (async () => {
      let q = supabase.from('service_jobs').select('id', { count: 'exact', head: true })
        .not('status', 'in', '("completed","cancelled")')

      if (admin.territory.role === 'distributor_staff') {
        // Need to fetch scooters first for distributor_staff
        const { data: territoryScooters } = await supabase
          .from('scooters')
          .select('id')
          .in('country_of_registration', admin.territory.allowed_countries)
        const scooterIds = territoryScooters?.map((s: any) => s.id) || []
        if (scooterIds.length > 0) {
          q = q.in('scooter_id', scooterIds)
        } else {
          q = q.eq('id', '00000000-0000-0000-0000-000000000000')
        }
      } else {
        const filter = buildTerritoryFilter('service-jobs', admin)
        q = applyTerritoryFilter(q, filter)
      }
      return q
    })()
  ])

  const { count: activeJobCount } = activeJobsResult

  // Compute status breakdown from scooterStatuses
  const statusBreakdown: Record<string, number> = {
    active: 0,
    in_service: 0,
    stolen: 0,
    decommissioned: 0
  }
  if (scooterStatuses) {
    for (const scooter of scooterStatuses) {
      const status = scooter.status || 'active'
      if (status in statusBreakdown) {
        statusBreakdown[status]++
      }
    }
  }

  // GROUP 3: Time-based stats (parallel)
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const [
    { count: recentEvents },
    { count: recentUploads }
  ] = await Promise.all([
    // Events (last 24h)
    (() => {
      let q = supabase.from('activity_events').select('id', { count: 'exact', head: true }).gte('timestamp', yesterday)
      const filter = buildTerritoryFilter('events', admin)
      return applyTerritoryFilter(q, filter)
    })(),
    // Uploads (last 7 days)
    (() => {
      let q = supabase.from('firmware_uploads').select('id', { count: 'exact', head: true }).gte('started_at', weekAgo)
      const filter = buildTerritoryFilter('logs', admin)
      return applyTerritoryFilter(q, filter)
    })()
  ])

  return respond({
    dashboard: {
      users: userCount || 0,
      scooters: scooterCount || 0,
      distributors: distributorCount || 0,
      workshops: workshopCount || 0,
      active_service_jobs: activeJobCount || 0,
      active_firmware: firmwareCount || 0,
      events_24h: recentEvents || 0,
      uploads_7d: recentUploads || 0,
      scooter_statuses: statusBreakdown,
    }
  })
}

// ============================================================================
// SETTINGS HANDLER (Reference Data: Models, Variants, Colours, Blocks)
// ============================================================================

async function handleSettings(supabase: any, action: string, body: any, admin: any) {
  // All settings actions require manufacturer_admin role
  const isAdmin = admin.territory.role === 'manufacturer_admin'

  // --- SCOOTER MODELS ---
  if (action === 'list-models') {
    const { data, error } = await supabase.from('scooter_models')
      .select('*').order('code', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ models: data })
  }

  if (action === 'create-model') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.code || !body.name) return errorResponse('Code and name are required')
    const { data, error } = await supabase.from('scooter_models')
      .insert({ code: body.code, name: body.name, description: body.description || null })
      .select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, model: data }, 201)
  }

  if (action === 'update-model') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Model ID required')
    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.is_active !== undefined) updates.is_active = body.is_active
    const { data, error } = await supabase.from('scooter_models')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, model: data })
  }

  if (action === 'deactivate-model') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Model ID required')
    const { data, error } = await supabase.from('scooter_models')
      .update({ is_active: false }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, model: data })
  }

  // --- BATTERY VARIANTS ---
  if (action === 'list-variants') {
    const { data, error } = await supabase.from('battery_variants')
      .select('*').order('code', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ variants: data })
  }

  if (action === 'create-variant') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.code || !body.name || !body.capacity_ah) return errorResponse('Code, name, and capacity are required')
    const { data, error } = await supabase.from('battery_variants')
      .insert({
        code: body.code, name: body.name,
        capacity_ah: body.capacity_ah, voltage: body.voltage || 48.0,
        description: body.description || null
      }).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, variant: data }, 201)
  }

  if (action === 'update-variant') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Variant ID required')
    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.capacity_ah !== undefined) updates.capacity_ah = body.capacity_ah
    if (body.voltage !== undefined) updates.voltage = body.voltage
    if (body.description !== undefined) updates.description = body.description
    if (body.is_active !== undefined) updates.is_active = body.is_active
    const { data, error } = await supabase.from('battery_variants')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, variant: data })
  }

  if (action === 'deactivate-variant') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Variant ID required')
    const { data, error } = await supabase.from('battery_variants')
      .update({ is_active: false }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, variant: data })
  }

  // --- COLOUR OPTIONS ---
  if (action === 'list-colours') {
    const { data, error } = await supabase.from('colour_options')
      .select('*').order('code', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ colours: data })
  }

  if (action === 'create-colour') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.code || !body.name) return errorResponse('Code and name are required')
    const { data, error } = await supabase.from('colour_options')
      .insert({ code: body.code, name: body.name, hex_colour: body.hex_colour || null })
      .select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, colour: data }, 201)
  }

  if (action === 'update-colour') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Colour ID required')
    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.hex_colour !== undefined) updates.hex_colour = body.hex_colour
    if (body.is_active !== undefined) updates.is_active = body.is_active
    const { data, error } = await supabase.from('colour_options')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, colour: data })
  }

  if (action === 'deactivate-colour') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Colour ID required')
    const { data, error } = await supabase.from('colour_options')
      .update({ is_active: false }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, colour: data })
  }

  // --- BLOCK CODES ---
  if (action === 'list-blocks') {
    const { data, error } = await supabase.from('block_codes')
      .select('*').order('code', { ascending: true })
    if (error) return errorResponse(error.message, 500)
    return respond({ blocks: data })
  }

  if (action === 'create-block') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.code || !body.name) return errorResponse('Code and name are required')
    const { data, error } = await supabase.from('block_codes')
      .insert({ code: body.code, name: body.name, regions: body.regions || [] })
      .select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, block: data }, 201)
  }

  if (action === 'update-block') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Block ID required')
    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.regions !== undefined) updates.regions = body.regions
    if (body.is_active !== undefined) updates.is_active = body.is_active
    const { data, error } = await supabase.from('block_codes')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, block: data })
  }

  if (action === 'deactivate-block') {
    if (!isAdmin) return errorResponse('Manufacturer admin access required', 403)
    if (!body.id) return errorResponse('Block ID required')
    const { data, error } = await supabase.from('block_codes')
      .update({ is_active: false }).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, block: data })
  }

  return errorResponse('Invalid action for settings: ' + action)
}


// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Validate origin
    const originError = validateOrigin(req)
    if (originError) {
      return errorResponse(originError, 403)
    }

    const body = await req.json()
    const { resource, action } = body

    if (!resource || !action) {
      return errorResponse('resource and action are required')
    }

    // Extract session token: prefer X-Session-Token header, fall back to body
    const headerToken = req.headers.get('X-Session-Token')
    const session_token = headerToken || body.session_token

    // Rate limit by session token (or by IP-like key if no token yet)
    const rateLimitKey = session_token || req.headers.get('x-forwarded-for') || 'anonymous'
    const rateCheck = checkRateLimit(rateLimitKey)
    if (!rateCheck.allowed) {
      const retryAfter = Math.ceil((rateCheck.retryAfterMs || 1000) / 1000)
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Retry-After': String(retryAfter),
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
          'X-RateLimit-Remaining': '0',
        },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Authenticate as admin
    const admin = await authenticateAdmin(supabase, session_token)
    if (!admin) {
      return errorResponse('Admin authentication required', 401)
    }

    // Route to resource handler (pass admin context for territory scoping)
    switch (resource) {
      case 'users':        return await handleUsers(supabase, action, body, admin)
      case 'scooters':     return await handleScooters(supabase, action, body, admin)
      case 'distributors': return await handleDistributors(supabase, action, body, admin)
      case 'workshops':    return await handleWorkshops(supabase, action, body, admin)
      case 'firmware':     return await handleFirmware(supabase, action, body, admin)
      case 'service-jobs': return await handleServiceJobs(supabase, action, body, admin)
      case 'telemetry':    return await handleTelemetry(supabase, action, body, admin)
      case 'logs':         return await handleLogs(supabase, action, body, admin)
      case 'events':       return await handleEvents(supabase, action, body, admin)
      case 'addresses':    return await handleAddresses(supabase, action, body, admin)
      case 'sessions':     return await handleSessions(supabase, action, body, admin)
      case 'validation':   return await handleValidation(supabase, action, body, admin)
      case 'dashboard':    return await handleDashboard(supabase, action, body, admin)
      case 'settings':     return await handleSettings(supabase, action, body, admin)
      default:
        return errorResponse('Unknown resource: ' + resource + '. Available: users, scooters, distributors, workshops, firmware, service-jobs, telemetry, logs, events, addresses, sessions, validation, dashboard, settings')
    }

  } catch (error) {
    console.error('Admin function error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
