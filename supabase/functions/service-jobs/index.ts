// Supabase Edge Function for Service Job CRUD
// Deploy with: supabase functions deploy service-jobs
//
// Routes (method + action field in JSON body):
//   POST { action: "list" }                     - List jobs (filtered by role/territory)
//   POST { action: "get", id: UUID }            - Get single job with scooter + customer info
//   POST { action: "create", ... }              - Create job (workshop_staff, distributor_staff, manufacturer_admin)
//   POST { action: "update", id: UUID, ... }    - Update job status/notes/parts
//   POST { action: "cancel", id: UUID }         - Cancel a job

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  }
  const mapped = levelMap[user.user_level]
  return mapped ? allowed.includes(mapped) : false
}

// Valid status transitions
const validTransitions: Record<string, string[]> = {
  'booked':                ['in_progress', 'cancelled'],
  'in_progress':           ['awaiting_parts', 'ready_for_collection', 'completed', 'cancelled'],
  'awaiting_parts':        ['in_progress', 'cancelled'],
  'ready_for_collection':  ['completed', 'cancelled'],
}

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

    // ---------- LIST ----------
    if (action === 'list') {
      const selectFields = '*, scooters(zyd_serial, model, status), workshops(name)'

      let query = supabase
        .from('service_jobs')
        .select(selectFields)
        .order('booked_date', { ascending: false })

      // Optional status filter
      if (body.status) {
        query = query.eq('status', body.status)
      }

      // Pagination
      const limit = body.limit || 50
      const offset = body.offset || 0
      query = query.range(offset, offset + limit - 1)

      // Territory scoping
      if (hasRole(user, ['manufacturer_admin'])) {
        // No filter
      } else if (hasRole(user, ['distributor_staff']) && user.distributor_id) {
        // Get workshop IDs belonging to this distributor
        const { data: workshops } = await supabase
          .from('workshops')
          .select('id')
          .eq('parent_distributor_id', user.distributor_id)
          .eq('is_active', true)

        const workshopIds = (workshops || []).map((w: any) => w.id)
        if (workshopIds.length === 0) {
          return respond({ jobs: [] })
        }
        query = query.in('workshop_id', workshopIds)
      } else if (hasRole(user, ['workshop_staff']) && user.workshop_id) {
        query = query.eq('workshop_id', user.workshop_id)
      } else if (hasRole(user, ['customer'])) {
        query = query.eq('customer_id', user.id)
      } else {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      const { data, error } = await query
      if (error) {
        console.error('List service jobs error:', error)
        return respond({ error: 'Failed to list service jobs' }, 500)
      }
      return respond({ jobs: data })
    }

    // ---------- GET ----------
    if (action === 'get') {
      if (!body.id) return respond({ error: 'Job ID required' }, 400)

      const { data, error } = await supabase
        .from('service_jobs')
        .select('*, scooters(zyd_serial, model, status, firmware_version), workshops(name, phone, email), users!service_jobs_customer_id_fkey(email, first_name, last_name)')
        .eq('id', body.id)
        .single()

      if (error || !data) return respond({ error: 'Job not found' }, 404)

      // Access check
      if (!hasRole(user, ['manufacturer_admin'])) {
        if (hasRole(user, ['customer']) && data.customer_id !== user.id) {
          return respond({ error: 'Not your service job' }, 403)
        }
        if (hasRole(user, ['workshop_staff']) && data.workshop_id !== user.workshop_id) {
          return respond({ error: 'Job not assigned to your workshop' }, 403)
        }
      }

      return respond({ job: data })
    }

    // ---------- CREATE ----------
    if (action === 'create') {
      if (!hasRole(user, ['workshop_staff', 'distributor_staff', 'manufacturer_admin'])) {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      if (!body.scooter_id || !body.issue_description) {
        return respond({ error: 'scooter_id and issue_description required' }, 400)
      }

      // Resolve workshop_id
      let workshopId = body.workshop_id
      if (!workshopId && hasRole(user, ['workshop_staff']) && user.workshop_id) {
        workshopId = user.workshop_id
      }
      if (!workshopId) {
        return respond({ error: 'workshop_id required' }, 400)
      }

      // Look up scooter owner for customer_id
      let customerId = body.customer_id
      if (!customerId) {
        const { data: ownerLink } = await supabase
          .from('user_scooters')
          .select('user_id')
          .eq('scooter_id', body.scooter_id)
          .order('registered_at', { ascending: false })
          .limit(1)
          .single()

        customerId = ownerLink?.user_id || null
      }

      if (!customerId) {
        return respond({ error: 'Could not determine scooter owner. Provide customer_id.' }, 400)
      }

      const { data, error } = await supabase
        .from('service_jobs')
        .insert({
          scooter_id: body.scooter_id,
          workshop_id: workshopId,
          customer_id: customerId,
          technician_id: body.technician_id || null,
          issue_description: body.issue_description,
          status: 'booked',
          booked_date: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Create service job error:', error)
        return respond({ error: 'Failed to create service job' }, 500)
      }

      // Update scooter status to in_service
      await supabase
        .from('scooters')
        .update({ status: 'in_service' })
        .eq('id', body.scooter_id)

      return respond({ success: true, job: data }, 201)
    }

    // ---------- UPDATE ----------
    if (action === 'update') {
      if (!body.id) return respond({ error: 'Job ID required' }, 400)

      if (!hasRole(user, ['workshop_staff', 'distributor_staff', 'manufacturer_admin'])) {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      // Get current job
      const { data: existing } = await supabase
        .from('service_jobs')
        .select('id, status, workshop_id, scooter_id')
        .eq('id', body.id)
        .single()

      if (!existing) return respond({ error: 'Job not found' }, 404)

      // Workshop staff can only update their own workshop's jobs
      if (hasRole(user, ['workshop_staff']) && !hasRole(user, ['manufacturer_admin', 'distributor_staff'])) {
        if (existing.workshop_id !== user.workshop_id) {
          return respond({ error: 'Job not assigned to your workshop' }, 403)
        }
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() }

      // Status transition validation
      if (body.status && body.status !== existing.status) {
        const allowed = validTransitions[existing.status]
        if (!allowed || !allowed.includes(body.status)) {
          return respond({
            error: `Cannot transition from '${existing.status}' to '${body.status}'. Allowed: ${allowed?.join(', ') || 'none'}`
          }, 400)
        }
        updates.status = body.status

        // Auto-set timestamps
        if (body.status === 'in_progress' && !existing.started_date) {
          updates.started_date = new Date().toISOString()
        }
        if (body.status === 'completed' || body.status === 'cancelled') {
          updates.completed_date = new Date().toISOString()

          // Restore scooter status to active when job completes
          await supabase
            .from('scooters')
            .update({ status: 'active' })
            .eq('id', existing.scooter_id)
        }
      }

      if (body.technician_id !== undefined) updates.technician_id = body.technician_id
      if (body.technician_notes !== undefined) updates.technician_notes = body.technician_notes
      if (body.parts_used !== undefined) updates.parts_used = body.parts_used
      if (body.firmware_updated !== undefined) {
        updates.firmware_updated = body.firmware_updated
        if (body.firmware_version_before) updates.firmware_version_before = body.firmware_version_before
        if (body.firmware_version_after) updates.firmware_version_after = body.firmware_version_after
      }

      const { data, error } = await supabase
        .from('service_jobs')
        .update(updates)
        .eq('id', body.id)
        .select()
        .single()

      if (error) {
        console.error('Update service job error:', error)
        return respond({ error: 'Failed to update service job' }, 500)
      }

      return respond({ success: true, job: data })
    }

    // ---------- CANCEL (convenience alias) ----------
    if (action === 'cancel') {
      if (!body.id) return respond({ error: 'Job ID required' }, 400)

      const { data: existing } = await supabase
        .from('service_jobs')
        .select('id, status, scooter_id, workshop_id')
        .eq('id', body.id)
        .single()

      if (!existing) return respond({ error: 'Job not found' }, 404)

      if (existing.status === 'completed' || existing.status === 'cancelled') {
        return respond({ error: `Cannot cancel a job that is already '${existing.status}'` }, 400)
      }

      // Permission check
      if (hasRole(user, ['workshop_staff']) && existing.workshop_id !== user.workshop_id) {
        return respond({ error: 'Job not assigned to your workshop' }, 403)
      }
      if (hasRole(user, ['customer']) && existing.customer_id !== user.id) {
        return respond({ error: 'Not your service job' }, 403)
      }

      const { data, error } = await supabase
        .from('service_jobs')
        .update({
          status: 'cancelled',
          completed_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .select()
        .single()

      if (error) {
        console.error('Cancel service job error:', error)
        return respond({ error: 'Failed to cancel service job' }, 500)
      }

      // Restore scooter status
      await supabase
        .from('scooters')
        .update({ status: 'active' })
        .eq('id', existing.scooter_id)

      return respond({ success: true, job: data })
    }

    return respond({ error: 'Invalid action. Use: list, get, create, update, cancel' }, 400)

  } catch (error) {
    console.error('Service jobs function error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
