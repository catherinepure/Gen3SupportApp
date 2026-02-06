// Supabase Edge Function for Workshop CRUD
// Deploy with: supabase functions deploy workshops
//
// Routes (method + action field in JSON body):
//   POST { action: "list" }                    - List workshops (filtered by role/territory)
//   POST { action: "get", id: UUID }           - Get single workshop
//   POST { action: "create", ... }             - Create workshop (distributor_staff, manufacturer_admin)
//   POST { action: "update", id: UUID, ... }   - Update workshop
//   POST { action: "delete", id: UUID }        - Soft-delete workshop (manufacturer_admin only)

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

/** Validate session token and return user with role info. */
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

/** Check if user has one of the allowed roles. */
function hasRole(user: any, allowed: string[]): boolean {
  // Check new roles array first, fall back to user_level mapping
  const roles: string[] = user.roles || []
  if (roles.some((r: string) => allowed.includes(r))) return true

  // Fallback mapping from legacy user_level
  const levelMap: Record<string, string> = {
    'admin': 'manufacturer_admin',
    'distributor': 'distributor_staff',
    'maintenance': 'workshop_staff',
  }
  const mapped = levelMap[user.user_level]
  return mapped ? allowed.includes(mapped) : false
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

    // Authenticate
    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return respond({ error: 'Authentication required' }, 401)
    }

    // ---------- LIST ----------
    if (action === 'list') {
      let query = supabase
        .from('workshops')
        .select('*, addresses(*)')
        .eq('is_active', true)
        .order('name')

      // Territory scoping
      if (hasRole(user, ['manufacturer_admin'])) {
        // No filter — global access
      } else if (hasRole(user, ['distributor_staff']) && user.distributor_id) {
        query = query.eq('parent_distributor_id', user.distributor_id)
      } else if (hasRole(user, ['workshop_staff']) && user.workshop_id) {
        query = query.eq('id', user.workshop_id)
      } else {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      const { data, error } = await query
      if (error) {
        console.error('List workshops error:', error)
        return respond({ error: 'Failed to list workshops' }, 500)
      }
      return respond({ workshops: data })
    }

    // ---------- GET ----------
    if (action === 'get') {
      if (!body.id) return respond({ error: 'Workshop ID required' }, 400)

      const { data, error } = await supabase
        .from('workshops')
        .select('*, addresses(*)')
        .eq('id', body.id)
        .single()

      if (error || !data) return respond({ error: 'Workshop not found' }, 404)

      // Territory check
      if (!hasRole(user, ['manufacturer_admin'])) {
        if (hasRole(user, ['distributor_staff']) && data.parent_distributor_id !== user.distributor_id) {
          return respond({ error: 'Workshop not in your territory' }, 403)
        }
        if (hasRole(user, ['workshop_staff']) && data.id !== user.workshop_id) {
          return respond({ error: 'Not your workshop' }, 403)
        }
      }

      return respond({ workshop: data })
    }

    // ---------- CREATE ----------
    if (action === 'create') {
      if (!hasRole(user, ['manufacturer_admin', 'distributor_staff'])) {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      if (!body.name) return respond({ error: 'Workshop name required' }, 400)

      // Distributors can only create workshops linked to themselves
      let distributorId = body.parent_distributor_id || null
      if (hasRole(user, ['distributor_staff']) && !hasRole(user, ['manufacturer_admin'])) {
        distributorId = user.distributor_id
      }

      const { data, error } = await supabase
        .from('workshops')
        .insert({
          name: body.name,
          phone: body.phone || null,
          email: body.email || null,
          parent_distributor_id: distributorId,
          service_area_countries: body.service_area_countries || [],
        })
        .select()
        .single()

      if (error) {
        console.error('Create workshop error:', error)
        return respond({ error: 'Failed to create workshop' }, 500)
      }

      // Create address if provided
      if (body.address) {
        await supabase.from('addresses').insert({
          entity_type: 'workshop',
          entity_id: data.id,
          line_1: body.address.line_1,
          line_2: body.address.line_2 || null,
          city: body.address.city,
          region: body.address.region || null,
          postcode: body.address.postcode,
          country: body.address.country,
        })
      }

      return respond({ success: true, workshop: data }, 201)
    }

    // ---------- UPDATE ----------
    if (action === 'update') {
      if (!body.id) return respond({ error: 'Workshop ID required' }, 400)

      // Check permissions
      if (!hasRole(user, ['manufacturer_admin', 'distributor_staff', 'workshop_staff'])) {
        return respond({ error: 'Insufficient permissions' }, 403)
      }

      // Verify access to this workshop
      const { data: existing } = await supabase
        .from('workshops')
        .select('id, parent_distributor_id')
        .eq('id', body.id)
        .single()

      if (!existing) return respond({ error: 'Workshop not found' }, 404)

      if (hasRole(user, ['distributor_staff']) && !hasRole(user, ['manufacturer_admin'])) {
        if (existing.parent_distributor_id !== user.distributor_id) {
          return respond({ error: 'Workshop not in your territory' }, 403)
        }
      }
      if (hasRole(user, ['workshop_staff']) && !hasRole(user, ['manufacturer_admin', 'distributor_staff'])) {
        if (existing.id !== user.workshop_id) {
          return respond({ error: 'Not your workshop' }, 403)
        }
      }

      const updates: Record<string, any> = { updated_at: new Date().toISOString() }
      if (body.name !== undefined) updates.name = body.name
      if (body.phone !== undefined) updates.phone = body.phone
      if (body.email !== undefined) updates.email = body.email
      if (body.service_area_countries !== undefined) updates.service_area_countries = body.service_area_countries
      // Only manufacturer_admin can reassign parent distributor
      if (body.parent_distributor_id !== undefined && hasRole(user, ['manufacturer_admin'])) {
        updates.parent_distributor_id = body.parent_distributor_id
      }

      const { data, error } = await supabase
        .from('workshops')
        .update(updates)
        .eq('id', body.id)
        .select()
        .single()

      if (error) {
        console.error('Update workshop error:', error)
        return respond({ error: 'Failed to update workshop' }, 500)
      }

      return respond({ success: true, workshop: data })
    }

    // ---------- DELETE (soft) ----------
    if (action === 'delete') {
      if (!hasRole(user, ['manufacturer_admin'])) {
        return respond({ error: 'Only manufacturer admins can delete workshops' }, 403)
      }
      if (!body.id) return respond({ error: 'Workshop ID required' }, 400)

      const { error } = await supabase
        .from('workshops')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', body.id)

      if (error) {
        console.error('Delete workshop error:', error)
        return respond({ error: 'Failed to delete workshop' }, 500)
      }

      return respond({ success: true })
    }

    return respond({ error: 'Invalid action. Use: list, get, create, update, delete' }, 400)

  } catch (error) {
    console.error('Workshop function error:', error)
    return respond({ error: error.message || 'Internal error' }, 500)
  }
})
