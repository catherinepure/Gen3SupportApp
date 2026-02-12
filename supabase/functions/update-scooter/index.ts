// Supabase Edge Function for Scooter Record Operations
// Deploy with: supabase functions deploy update-scooter --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
//
// Replaces direct anon PostgREST writes to scooters, scooter_telemetry, firmware_uploads.
// All writes use service_role after session token validation.
//
// Actions:
//   get-or-create       — lookup scooter by zyd_serial, create if not found, return ID
//   update-version      — update firmware versions, model, embedded_serial, last_connected_at
//   create-telemetry    — insert scooter_telemetry record + update scooter version info
//   create-scan-record  — insert firmware_uploads record (scan tracking)
//   request-diagnostic  — (admin/manager) set diagnostic flag + config on a scooter + notify owner
//   clear-diagnostic    — clear diagnostic flag, optionally record decline timestamp + notify owner

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
}

function respond(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorResponse(message: string, status = 400) {
  return respond({ error: message }, status)
}

/**
 * Authenticate user via session token. Returns user or null.
 */
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
    .select('id, email, is_active, user_level, distributor_id')
    .eq('id', session.user_id)
    .single()

  if (!user || !user.is_active) return null

  return user
}

/**
 * Fire diagnostic notification templates for a scooter owner.
 * Finds active templates with trigger_type='diagnostic_request' and matching event,
 * creates a push_notification record, and invokes send-notification fire-and-forget.
 */
async function fireDiagnosticNotification(
  supabase: any,
  scooterId: string,
  event: 'requested' | 'cancelled',
  adminUserId: string
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Find active diagnostic_request templates matching this event
    const { data: templates } = await supabase
      .from('notification_templates')
      .select('*')
      .eq('trigger_type', 'diagnostic_request')
      .eq('is_active', true)

    if (!templates || templates.length === 0) {
      console.log(`No active diagnostic_request templates for event: ${event}`)
      return
    }

    for (const template of templates) {
      // Filter by trigger_config.event if set
      const configEvent = template.trigger_config?.event
      if (configEvent && configEvent !== event) continue

      // For trigger_match target, resolve to scooter_owner
      let targetType = template.target_type
      let targetValue = template.target_value
      if (targetType === 'trigger_match') {
        targetType = 'scooter_owner'
        targetValue = scooterId
      }

      // Create push_notifications record
      const { data: notification, error } = await supabase
        .from('push_notifications')
        .insert({
          title: template.title_template,
          body: template.body_template,
          action: template.tap_action || 'none',
          target_type: targetType,
          target_value: targetValue,
          sent_by: adminUserId,
          status: 'pending',
          template_id: template.id,
          template_data: { scooter_id: scooterId, event },
        })
        .select()
        .single()

      if (error || !notification) {
        console.error('Failed to create diagnostic notification:', error?.message)
        continue
      }

      // Fire-and-forget
      fetch(`${supabaseUrl}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ notification_id: notification.id }),
      }).catch(err => {
        console.error('Failed to invoke send-notification for diagnostic:', err)
      })
    }

    console.log(`Fired diagnostic notification templates for event: ${event}, scooter: ${scooterId}`)
  } catch (err) {
    // Non-fatal — don't fail the main request
    console.error('fireDiagnosticNotification error:', err)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { action, session_token } = body

    if (!action) {
      return errorResponse('Action required')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // All actions require authentication
    if (!session_token) {
      return errorResponse('Session token required', 401)
    }

    const user = await authenticateUser(supabase, session_token)
    if (!user) {
      return errorResponse('Authentication failed', 401)
    }

    // ================================================================
    // ACTION: get-or-create — Lookup scooter by serial, create if needed
    // ================================================================
    if (action === 'get-or-create') {
      const { zyd_serial, distributor_id } = body

      if (!zyd_serial) {
        return errorResponse('zyd_serial required')
      }

      // Try to find existing scooter
      const { data: existing } = await supabase
        .from('scooters')
        .select('id')
        .eq('zyd_serial', zyd_serial)
        .single()

      if (existing) {
        return respond({ id: existing.id })
      }

      // Create new scooter record
      const insertData: any = {
        zyd_serial,
        distributor_id: distributor_id || user.distributor_id || null,
      }

      const { data: created, error: createError } = await supabase
        .from('scooters')
        .insert(insertData)
        .select('id')
        .single()

      if (createError) {
        // Handle race condition: another request may have created it
        if (createError.code === '23505') {
          const { data: retry } = await supabase
            .from('scooters')
            .select('id')
            .eq('zyd_serial', zyd_serial)
            .single()
          if (retry) {
            return respond({ id: retry.id })
          }
        }
        console.error('create scooter error:', createError)
        return errorResponse('Failed to create scooter: ' + createError.message, 500)
      }

      return respond({ id: created.id })
    }

    // ================================================================
    // ACTION: update-version — Update scooter firmware versions
    // ================================================================
    if (action === 'update-version') {
      const { scooter_id, controller_hw_version, controller_sw_version,
              meter_hw_version, meter_sw_version, bms_hw_version, bms_sw_version,
              embedded_serial, model } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      const updateData: any = {
        last_connected_at: new Date().toISOString(),
      }

      if (controller_hw_version) updateData.controller_hw_version = controller_hw_version
      if (controller_sw_version) updateData.controller_sw_version = controller_sw_version
      if (meter_hw_version) updateData.meter_hw_version = meter_hw_version
      if (meter_sw_version) updateData.meter_sw_version = meter_sw_version
      if (bms_hw_version) updateData.bms_hw_version = bms_hw_version
      if (bms_sw_version) updateData.bms_sw_version = bms_sw_version
      if (embedded_serial) updateData.embedded_serial = embedded_serial
      if (model) updateData.model = model

      const { error: updateError } = await supabase
        .from('scooters')
        .update(updateData)
        .eq('id', scooter_id)

      if (updateError) {
        console.error('update scooter error:', updateError)
        return errorResponse('Failed to update scooter: ' + updateError.message, 500)
      }

      return respond({ success: true })
    }

    // ================================================================
    // ACTION: create-telemetry — Insert telemetry + update scooter
    // ================================================================
    if (action === 'create-telemetry') {
      const { scooter_id, distributor_id, hw_version, sw_version, scan_type,
              record_type,
              // Version info for scooter update
              controller_hw_version, controller_sw_version,
              meter_hw_version, meter_sw_version, bms_hw_version, bms_sw_version,
              embedded_serial, model,
              // Telemetry fields
              voltage, current, battery_soc, battery_health,
              battery_charge_cycles, battery_discharge_cycles,
              remaining_capacity_mah, full_capacity_mah, battery_temp,
              speed_kmh, odometer_km, motor_temp, controller_temp,
              fault_code, gear_level, trip_distance_km, remaining_range_km,
              motor_rpm, current_limit } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      // 1. Update scooter record with version info (non-fatal if fails)
      const scooterUpdate: any = {
        last_connected_at: new Date().toISOString(),
      }
      if (controller_hw_version) scooterUpdate.controller_hw_version = controller_hw_version
      if (controller_sw_version) scooterUpdate.controller_sw_version = controller_sw_version
      if (meter_hw_version) scooterUpdate.meter_hw_version = meter_hw_version
      if (meter_sw_version) scooterUpdate.meter_sw_version = meter_sw_version
      if (bms_hw_version) scooterUpdate.bms_hw_version = bms_hw_version
      if (bms_sw_version) scooterUpdate.bms_sw_version = bms_sw_version
      if (embedded_serial) scooterUpdate.embedded_serial = embedded_serial
      if (model) scooterUpdate.model = model

      try {
        await supabase.from('scooters').update(scooterUpdate).eq('id', scooter_id)
      } catch (e) {
        console.warn('Non-fatal: failed to update scooter record:', e)
      }

      // 2. Look up user_id from user_scooters (for telemetry record)
      let telemetryUserId = null
      try {
        const { data: ownership } = await supabase
          .from('user_scooters')
          .select('user_id')
          .eq('scooter_id', scooter_id)
          .order('registered_at', { ascending: false })
          .limit(1)
          .single()
        if (ownership) telemetryUserId = ownership.user_id
      } catch (_) {
        // No owner — normal for unregistered scooters
      }

      // 3. Insert telemetry record
      const telemetryData: any = {
        scooter_id,
        distributor_id: distributor_id || null,
        user_id: telemetryUserId,
        hw_version: hw_version || null,
        sw_version: sw_version || null,
        scan_type: scan_type || 'unknown',
      }

      // Add record_type if provided (start/stop/riding)
      if (record_type) telemetryData.record_type = record_type

      // Add telemetry fields if present
      if (voltage !== undefined) telemetryData.voltage = voltage
      if (current !== undefined) telemetryData.current = current
      if (battery_soc !== undefined) telemetryData.battery_soc = battery_soc
      if (battery_health !== undefined) telemetryData.battery_health = battery_health
      if (battery_charge_cycles !== undefined) telemetryData.battery_charge_cycles = battery_charge_cycles
      if (battery_discharge_cycles !== undefined) telemetryData.battery_discharge_cycles = battery_discharge_cycles
      if (remaining_capacity_mah !== undefined) telemetryData.remaining_capacity_mah = remaining_capacity_mah
      if (full_capacity_mah !== undefined) telemetryData.full_capacity_mah = full_capacity_mah
      if (battery_temp !== undefined) telemetryData.battery_temp = battery_temp
      if (speed_kmh !== undefined) telemetryData.speed_kmh = speed_kmh
      if (odometer_km !== undefined) telemetryData.odometer_km = odometer_km
      if (motor_temp !== undefined) telemetryData.motor_temp = motor_temp
      if (controller_temp !== undefined) telemetryData.controller_temp = controller_temp
      if (fault_code !== undefined) telemetryData.fault_code = fault_code
      if (gear_level !== undefined) telemetryData.gear_level = gear_level
      if (trip_distance_km !== undefined) telemetryData.trip_distance_km = trip_distance_km
      if (remaining_range_km !== undefined) telemetryData.remaining_range_km = remaining_range_km
      if (motor_rpm !== undefined) telemetryData.motor_rpm = motor_rpm
      if (current_limit !== undefined) telemetryData.current_limit = current_limit
      if (embedded_serial) telemetryData.embedded_serial = embedded_serial

      const { data: telemetry, error: telemetryError } = await supabase
        .from('scooter_telemetry')
        .insert(telemetryData)
        .select('id')
        .single()

      if (telemetryError) {
        console.error('create telemetry error:', telemetryError)
        return errorResponse('Failed to create telemetry: ' + telemetryError.message, 500)
      }

      return respond({ id: telemetry.id })
    }

    // ================================================================
    // ACTION: create-scan-record — Insert firmware_uploads record
    // ================================================================
    if (action === 'create-scan-record') {
      const { scooter_id, distributor_id, firmware_version_id,
              old_hw_version, old_sw_version,
              // Telemetry fields
              voltage, current, battery_soc, battery_health,
              battery_charge_cycles, battery_discharge_cycles,
              remaining_capacity_mah, full_capacity_mah, battery_temp,
              speed_kmh, odometer_km, motor_temp, controller_temp,
              fault_code, gear_level, trip_distance_km, remaining_range_km,
              motor_rpm, current_limit, embedded_serial } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      // If no firmware_version_id provided, get the latest one
      let fwVersionId = firmware_version_id
      if (!fwVersionId) {
        const { data: latest } = await supabase
          .from('firmware_versions')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!latest) {
          return errorResponse('No firmware versions found', 404)
        }
        fwVersionId = latest.id
      }

      const scanData: any = {
        scooter_id,
        distributor_id: distributor_id || null,
        firmware_version_id: fwVersionId,
        old_hw_version: old_hw_version || null,
        old_sw_version: old_sw_version || null,
        status: 'scanned',
      }

      // Add telemetry fields if present
      if (voltage !== undefined) scanData.voltage = voltage
      if (current !== undefined) scanData.current = current
      if (battery_soc !== undefined) scanData.battery_soc = battery_soc
      if (battery_health !== undefined) scanData.battery_health = battery_health
      if (battery_charge_cycles !== undefined) scanData.battery_charge_cycles = battery_charge_cycles
      if (battery_discharge_cycles !== undefined) scanData.battery_discharge_cycles = battery_discharge_cycles
      if (remaining_capacity_mah !== undefined) scanData.remaining_capacity_mah = remaining_capacity_mah
      if (full_capacity_mah !== undefined) scanData.full_capacity_mah = full_capacity_mah
      if (battery_temp !== undefined) scanData.battery_temp = battery_temp
      if (speed_kmh !== undefined) scanData.speed_kmh = speed_kmh
      if (odometer_km !== undefined) scanData.odometer_km = odometer_km
      if (motor_temp !== undefined) scanData.motor_temp = motor_temp
      if (controller_temp !== undefined) scanData.controller_temp = controller_temp
      if (fault_code !== undefined) scanData.fault_code = fault_code
      if (gear_level !== undefined) scanData.gear_level = gear_level
      if (trip_distance_km !== undefined) scanData.trip_distance_km = trip_distance_km
      if (remaining_range_km !== undefined) scanData.remaining_range_km = remaining_range_km
      if (motor_rpm !== undefined) scanData.motor_rpm = motor_rpm
      if (current_limit !== undefined) scanData.current_limit = current_limit
      if (embedded_serial) scanData.embedded_serial = embedded_serial

      const { data: scan, error: scanError } = await supabase
        .from('firmware_uploads')
        .insert(scanData)
        .select('id')
        .single()

      if (scanError) {
        console.error('create scan record error:', scanError)
        return errorResponse('Failed to create scan record: ' + scanError.message, 500)
      }

      return respond({ id: scan.id })
    }

    // ================================================================
    // ACTION: request-diagnostic — Admin/manager sets diagnostic flag
    // ================================================================
    if (action === 'request-diagnostic') {
      const { scooter_id, diagnostic_config } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      // Only admin or manager can request diagnostics
      if (user.user_level !== 'admin' && user.user_level !== 'manager') {
        return errorResponse('Only admin or manager can request diagnostics', 403)
      }

      if (!diagnostic_config || !diagnostic_config.reason) {
        return errorResponse('diagnostic_config with reason is required')
      }

      const { error: diagError } = await supabase
        .from('scooters')
        .update({
          diagnostic_requested: true,
          diagnostic_config: diagnostic_config,
          diagnostic_requested_by: user.id,
          diagnostic_requested_at: new Date().toISOString(),
          diagnostic_declined_at: null,
        })
        .eq('id', scooter_id)

      if (diagError) {
        console.error('request-diagnostic error:', diagError)
        return errorResponse('Failed to set diagnostic flag: ' + diagError.message, 500)
      }

      // Notify scooter owner (fire-and-forget)
      fireDiagnosticNotification(supabase, scooter_id, 'requested', user.id)

      return respond({ success: true, message: 'Diagnostic requested' })
    }

    // ================================================================
    // ACTION: clear-diagnostic — Clear diagnostic flag on scooter
    // ================================================================
    if (action === 'clear-diagnostic') {
      const { scooter_id, declined } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      const updateData: any = {
        diagnostic_requested: false,
        diagnostic_config: null,
        diagnostic_requested_by: null,
        diagnostic_requested_at: null,
      }

      // If user declined, record the timestamp
      if (declined) {
        updateData.diagnostic_declined_at = new Date().toISOString()
      } else {
        updateData.diagnostic_declined_at = null
      }

      const { error: clearError } = await supabase
        .from('scooters')
        .update(updateData)
        .eq('id', scooter_id)

      if (clearError) {
        console.error('clear-diagnostic error:', clearError)
        return errorResponse('Failed to clear diagnostic flag: ' + clearError.message, 500)
      }

      // Notify scooter owner of cancellation (only if admin cancelled, not user decline)
      if (!declined) {
        fireDiagnosticNotification(supabase, scooter_id, 'cancelled', user.id)
      }

      return respond({ success: true, message: 'Diagnostic cleared' })
    }

    // ================================================================
    // ACTION: create-ride-session — Upload ride recording with samples
    // ================================================================
    if (action === 'create-ride-session') {
      const { scooter_id, trigger_type, started_at, ended_at,
              sample_count, max_duration_seconds, diagnostic_config, samples } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }
      if (!samples || !Array.isArray(samples)) {
        return errorResponse('samples array required')
      }

      // Look up user_id from user_scooters
      let rideUserId = null
      try {
        const { data: ownership } = await supabase
          .from('user_scooters')
          .select('user_id')
          .eq('scooter_id', scooter_id)
          .order('registered_at', { ascending: false })
          .limit(1)
          .single()
        if (ownership) rideUserId = ownership.user_id
      } catch (_) {
        // No owner — normal for unregistered scooters
      }

      // Insert ride_sessions row
      const sessionData: any = {
        scooter_id,
        user_id: rideUserId,
        trigger_type: trigger_type || 'manual',
        started_at,
        ended_at: ended_at || null,
        sample_count: sample_count || samples.length,
        max_duration_seconds: max_duration_seconds || 300,
        status: 'uploaded',
        diagnostic_config: diagnostic_config || null,
      }

      const { data: sessionRow, error: sessionError } = await supabase
        .from('ride_sessions')
        .insert(sessionData)
        .select('id')
        .single()

      if (sessionError) {
        console.error('create-ride-session session error:', sessionError)
        return errorResponse('Failed to create ride session: ' + sessionError.message, 500)
      }

      const rideSessionId = sessionRow.id

      // Batch insert ride_telemetry samples (chunks of 500)
      let insertedCount = 0
      for (let i = 0; i < samples.length; i += 500) {
        const chunk = samples.slice(i, i + 500).map((s: any) => ({
          ride_session_id: rideSessionId,
          sample_index: s.sample_index,
          recorded_at: s.recorded_at,
          speed_kmh: s.speed_kmh,
          motor_temp: s.motor_temp,
          controller_temp: s.controller_temp,
          fault_code: s.fault_code,
          gear_level: s.gear_level,
          trip_distance_km: s.trip_distance_km,
          total_distance_km: s.total_distance_km,
          remaining_range_km: s.remaining_range_km,
          motor_rpm: s.motor_rpm,
          current_limit: s.current_limit,
          control_flags: s.control_flags,
          battery_voltage: s.battery_voltage,
          battery_current: s.battery_current,
          battery_percent: s.battery_percent,
          battery_temp: s.battery_temp,
        }))

        const { error: samplesError } = await supabase
          .from('ride_telemetry')
          .insert(chunk)

        if (samplesError) {
          console.error('create-ride-session samples error (batch ' + i + '):', samplesError)
          return errorResponse('Failed to insert samples: ' + samplesError.message, 500)
        }
        insertedCount += chunk.length
      }

      // If diagnostic trigger: auto-clear diagnostic flag on scooter
      if (trigger_type === 'diagnostic') {
        try {
          await supabase
            .from('scooters')
            .update({
              diagnostic_requested: false,
              diagnostic_config: null,
              diagnostic_requested_by: null,
              diagnostic_requested_at: null,
              diagnostic_declined_at: null,
            })
            .eq('id', scooter_id)
        } catch (e) {
          console.warn('Non-fatal: failed to clear diagnostic flag after session upload:', e)
        }
      }

      return respond({
        id: rideSessionId,
        sample_count: insertedCount,
      })
    }

    // ================================================================
    // ACTION: delete-ride-sessions — Delete all ride sessions for a scooter
    // Called when user re-records during a diagnostic (replace old data)
    // ================================================================
    if (action === 'delete-ride-sessions') {
      const { scooter_id } = body

      if (!scooter_id) {
        return errorResponse('scooter_id required')
      }

      // ride_telemetry has ON DELETE CASCADE from ride_sessions, so deleting
      // sessions automatically removes their samples
      const { error, count } = await supabase
        .from('ride_sessions')
        .delete()
        .eq('scooter_id', scooter_id)

      if (error) {
        return errorResponse('Failed to delete ride sessions: ' + error.message, 500)
      }

      console.log(`Deleted ride sessions for scooter ${scooter_id}, count=${count}`)
      return respond({ success: true, deleted: count || 0 })
    }

    return errorResponse('Unknown action: ' + action)

  } catch (err) {
    console.error('update-scooter error:', err)
    return errorResponse('Internal server error', 500)
  }
})
