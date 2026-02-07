// Supabase Edge Function: Admin API
// Deploy with: supabase functions deploy admin
//
// Single endpoint for all admin operations. Requires manufacturer_admin role.
// Used by the web admin dashboard (static SPA hosted on shared hosting).
//
// Auth: session_token in request body (same as other Edge Functions)
// All requests are POST with JSON body: { session_token, resource, action, ...params }
//
// Resources & Actions:
//   users:        list, get, update, deactivate, export, search
//   scooters:     list, get, create, update, link-user, unlink-user, export
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

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
}

function respond(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

function errorResponse(msg: string, status = 400) {
  return respond({ error: msg }, status)
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

  // Check admin role
  const roles: string[] = user.roles || []
  const isAdmin = roles.includes('manufacturer_admin') || user.user_level === 'admin'
  if (!isAdmin) return null

  // Update last activity
  await supabase
    .from('user_sessions')
    .update({ last_activity: new Date().toISOString() })
    .eq('session_token', sessionToken)

  return user
}

// ============================================================================
// RESOURCE HANDLERS
// ============================================================================

async function handleUsers(supabase: any, action: string, body: any) {
  const selectFields = 'id, email, first_name, last_name, user_level, roles, distributor_id, workshop_id, is_active, is_verified, home_country, current_country, created_at, last_login'

  if (action === 'list' || action === 'search') {
    let query = supabase.from('users').select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (body.search) {
      query = query.or(`email.ilike.%${body.search}%,first_name.ilike.%${body.search}%,last_name.ilike.%${body.search}%`)
    }
    if (body.user_level) query = query.eq('user_level', body.user_level)
    if (body.distributor_id) query = query.eq('distributor_id', body.distributor_id)
    if (body.is_active !== undefined) query = query.eq('is_active', body.is_active)

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

  if (action === 'update') {
    if (!body.id) return errorResponse('User ID required')
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
    return respond({ success: true, user: data })
  }

  if (action === 'deactivate') {
    if (!body.id) return errorResponse('User ID required')
    const { data, error } = await supabase.from('users')
      .update({ is_active: false }).eq('id', body.id).select(selectFields).single()
    if (error) return errorResponse(error.message, 500)

    // Kill active sessions
    await supabase.from('user_sessions').delete().eq('user_id', body.id)
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

async function handleScooters(supabase: any, action: string, body: any) {
  const selectFields = '*, distributors(name)'

  if (action === 'list') {
    let query = supabase.from('scooters').select(selectFields, { count: 'exact' })
      .order('created_at', { ascending: false })

    if (body.search) {
      query = query.or(`zyd_serial.ilike.%${body.search}%,model.ilike.%${body.search}%`)
    }
    if (body.distributor_id) query = query.eq('distributor_id', body.distributor_id)
    if (body.status) query = query.eq('status', body.status)

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
    if (!body.zyd_serial) return errorResponse('Serial number required')
    const record: Record<string, any> = {
      zyd_serial: body.zyd_serial,
      distributor_id: body.distributor_id || null,
      model: body.model || null,
      hw_version: body.hw_version || null,
      notes: body.notes || null,
    }
    const { data, error } = await supabase.from('scooters')
      .insert(record).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, scooter: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Scooter ID required')
    const allowed = ['distributor_id', 'model', 'hw_version', 'notes', 'status',
      'firmware_version', 'country_of_registration']
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

  if (action === 'export') {
    const { data, error } = await supabase.from('scooters')
      .select(selectFields).order('created_at', { ascending: false })
    if (error) return errorResponse(error.message, 500)
    return respond({ scooters: data })
  }

  return errorResponse('Invalid action for scooters: ' + action)
}

async function handleDistributors(supabase: any, action: string, body: any) {
  const selectFields = '*'

  if (action === 'list') {
    let query = supabase.from('distributors').select(selectFields, { count: 'exact' })
      .order('name', { ascending: true })
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

    // Get addresses
    const { data: addresses } = await supabase.from('addresses')
      .select('*').eq('entity_type', 'distributor').eq('entity_id', body.id)

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
    // Generate activation code
    const code = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()

    const { data, error } = await supabase.from('distributors')
      .insert({
        name: body.name, activation_code: code,
        countries: body.countries || [], phone: body.phone || null,
        email: body.email || null, is_active: true,
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

async function handleWorkshops(supabase: any, action: string, body: any) {
  if (action === 'list') {
    let query = supabase.from('workshops')
      .select('*, distributors:parent_distributor_id(name)', { count: 'exact' })
      .order('name', { ascending: true })
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

    const { data: addresses } = await supabase.from('addresses')
      .select('*').eq('entity_type', 'workshop').eq('entity_id', body.id)

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
        name: body.name, phone: body.phone || null, email: body.email || null,
        parent_distributor_id: body.parent_distributor_id || null,
        service_area_countries: body.service_area_countries || [], is_active: true,
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

async function handleFirmware(supabase: any, action: string, body: any) {
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

async function handleServiceJobs(supabase: any, action: string, body: any) {
  const selectFields = '*, scooters(zyd_serial, model, status), workshops(name), users!service_jobs_customer_id_fkey(email, first_name, last_name)'

  if (action === 'list') {
    let query = supabase.from('service_jobs')
      .select(selectFields, { count: 'exact' })
      .order('booked_date', { ascending: false })
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

async function handleTelemetry(supabase: any, action: string, body: any) {
  if (action === 'list') {
    let query = supabase.from('scooter_telemetry')
      .select('*, scooters(zyd_serial, model), users(email)', { count: 'exact' })
      .order('captured_at', { ascending: false })
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
      .order('captured_at', { ascending: false }).limit(10)

    if (!records || records.length === 0) return respond({ health: { status: 'no_data' } })

    const latest = records[0]
    const flags: string[] = []
    if (latest.charge_cycles > 500) flags.push('High battery cycles: ' + latest.charge_cycles)
    if (latest.battery_soc !== null && latest.battery_soc < 20) flags.push('Low battery: ' + latest.battery_soc + '%')
    if (latest.fault_codes && Object.keys(latest.fault_codes).length > 0) flags.push('Active fault codes')

    const daysSince = Math.floor((Date.now() - new Date(latest.captured_at).getTime()) / 86400000)
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
      .select('*, scooters(zyd_serial)').order('captured_at', { ascending: false })
    if (body.scooter_id) query = query.eq('scooter_id', body.scooter_id)
    const { data, error } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ telemetry: data })
  }

  return errorResponse('Invalid action for telemetry: ' + action)
}

async function handleLogs(supabase: any, action: string, body: any) {
  const selectFields = '*, scooters(zyd_serial), firmware_versions(version_label), distributors(name)'

  if (action === 'list') {
    let query = supabase.from('firmware_uploads')
      .select(selectFields, { count: 'exact' })
      .order('started_at', { ascending: false })
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

async function handleEvents(supabase: any, action: string, body: any) {
  if (action === 'list') {
    let query = supabase.from('activity_events')
      .select('*, users(email), scooters(zyd_serial)', { count: 'exact' })
      .order('timestamp', { ascending: false })
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

async function handleAddresses(supabase: any, action: string, body: any) {
  if (action === 'list') {
    let query = supabase.from('addresses').select('*').order('created_at', { ascending: false })
    if (body.entity_type) query = query.eq('entity_type', body.entity_type)
    if (body.entity_id) query = query.eq('entity_id', body.entity_id)

    const { data, error } = await query
    if (error) return errorResponse(error.message, 500)
    return respond({ addresses: data })
  }

  if (action === 'get') {
    if (!body.id) return errorResponse('Address ID required')
    const { data, error } = await supabase.from('addresses')
      .select('*').eq('id', body.id).single()
    if (error) return errorResponse('Address not found', 404)
    return respond({ address: data })
  }

  if (action === 'create') {
    if (!body.entity_type || !body.entity_id || !body.line_1 || !body.city || !body.postcode || !body.country) {
      return errorResponse('entity_type, entity_id, line_1, city, postcode, country required')
    }
    const { data, error } = await supabase.from('addresses')
      .insert({
        entity_type: body.entity_type, entity_id: body.entity_id,
        line_1: body.line_1, line_2: body.line_2 || null,
        city: body.city, region: body.region || null,
        postcode: body.postcode, country: body.country,
        is_primary: body.is_primary !== undefined ? body.is_primary : true,
      }).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, address: data }, 201)
  }

  if (action === 'update') {
    if (!body.id) return errorResponse('Address ID required')
    const allowed = ['line_1', 'line_2', 'city', 'region', 'postcode', 'country', 'is_primary']
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key]
    }
    const { data, error } = await supabase.from('addresses')
      .update(updates).eq('id', body.id).select().single()
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true, address: data })
  }

  if (action === 'delete') {
    if (!body.id) return errorResponse('Address ID required')
    const { error } = await supabase.from('addresses').delete().eq('id', body.id)
    if (error) return errorResponse(error.message, 500)
    return respond({ success: true })
  }

  return errorResponse('Invalid action for addresses: ' + action)
}

async function handleSessions(supabase: any, action: string, body: any) {
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

async function handleValidation(supabase: any, action: string, _body: any) {
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

async function handleDashboard(supabase: any, _action: string, _body: any) {
  // Gather summary stats for the dashboard
  const { count: userCount } = await supabase.from('users')
    .select('id', { count: 'exact', head: true }).eq('is_active', true)
  const { count: scooterCount } = await supabase.from('scooters')
    .select('id', { count: 'exact', head: true })
  const { count: distributorCount } = await supabase.from('distributors')
    .select('id', { count: 'exact', head: true }).eq('is_active', true)
  const { count: workshopCount } = await supabase.from('workshops')
    .select('id', { count: 'exact', head: true }).eq('is_active', true)
  const { count: activeJobCount } = await supabase.from('service_jobs')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '("completed","cancelled")')
  const { count: firmwareCount } = await supabase.from('firmware_versions')
    .select('id', { count: 'exact', head: true }).eq('is_active', true)

  // Recent events (last 24h)
  const yesterday = new Date(Date.now() - 86400000).toISOString()
  const { count: recentEvents } = await supabase.from('activity_events')
    .select('id', { count: 'exact', head: true }).gte('timestamp', yesterday)

  // Recent uploads (last 7 days)
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const { count: recentUploads } = await supabase.from('firmware_uploads')
    .select('id', { count: 'exact', head: true }).gte('started_at', weekAgo)

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
    }
  })
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { session_token, resource, action } = body

    if (!resource || !action) {
      return errorResponse('resource and action are required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Authenticate as admin
    const admin = await authenticateAdmin(supabase, session_token)
    if (!admin) {
      return errorResponse('Admin authentication required', 401)
    }

    // Route to resource handler
    switch (resource) {
      case 'users':        return await handleUsers(supabase, action, body)
      case 'scooters':     return await handleScooters(supabase, action, body)
      case 'distributors': return await handleDistributors(supabase, action, body)
      case 'workshops':    return await handleWorkshops(supabase, action, body)
      case 'firmware':     return await handleFirmware(supabase, action, body)
      case 'service-jobs': return await handleServiceJobs(supabase, action, body)
      case 'telemetry':    return await handleTelemetry(supabase, action, body)
      case 'logs':         return await handleLogs(supabase, action, body)
      case 'events':       return await handleEvents(supabase, action, body)
      case 'addresses':    return await handleAddresses(supabase, action, body)
      case 'sessions':     return await handleSessions(supabase, action, body)
      case 'validation':   return await handleValidation(supabase, action, body)
      case 'dashboard':    return await handleDashboard(supabase, action, body)
      default:
        return errorResponse('Unknown resource: ' + resource + '. Available: users, scooters, distributors, workshops, firmware, service-jobs, telemetry, logs, events, addresses, sessions, validation, dashboard')
    }

  } catch (error) {
    console.error('Admin function error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
