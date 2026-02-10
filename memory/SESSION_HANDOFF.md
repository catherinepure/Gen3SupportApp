# Session Handoff: Scooter Connection & Telemetry Updates

**Date:** 2026-02-10
**Status:** COMPLETE — Static scooter record updates, persistent BLE connection, disconnect button

## What Was Done (This Session)

### Phase 1: Update Static Scooter Record on BLE Connection
When a scooter connects via BLE, the `scooters` table is now updated with firmware/hardware version info from the 0xB0 packet:

- **New migration** `20260210200000_add_scooter_version_fields.sql` — adds 8 columns: controller_hw/sw, meter_hw/sw, bms_hw/sw, embedded_serial, last_connected_at
- **New migration** `20260210200001_add_scooters_update_policy.sql` — adds RLS UPDATE policy for anon role (was missing)
- **`SupabaseScooterRepository`** — added `updateScooterRecord()` (PATCH), `getScooterRegistrationStatusById()`, refactored registration query with JOIN for PIN check
- **`SupabaseTelemetryRepository`** — new `createTelemetryRecord()` overload with VersionInfo + model, calls `updateScooterRecord`
- **`ScooterConnectionService`** — stores all GATT fields (model, firmware rev, manufacturer), added getters
- **`ScanScooterActivity`** — captures GATT model, passes to telemetry, parallelized telemetry + registration lookup
- **`SupabaseClient`** — added delegate for new createTelemetryRecord signature
- **`web-admin/js/pages/scooters.js`** — updated detail view to show new firmware version fields

### Phase 2: Persistent BLE Connection + Disconnect Button
BLE connection now persists across activity transitions and until explicit user disconnect:

- **`BLEManager`** — uses `getApplicationContext()` to prevent Activity leaks
- **`ServiceFactory`** — added shared BLE singleton: `getConnectionService()`, `releaseConnectionService()`, `isConnectionServiceActive()`
- **`ScanScooterActivity`** — uses shared singleton, `navigatingForward` flag skips cleanup on transition to details
- **`ScooterDetailsActivity`** — implements `ConnectionListener`, shows Disconnect button when connected, `onDestroy` only detaches listener (doesn't disconnect)
- **`activity_scooter_details.xml`** — added Material3 TonalButton for disconnect (visibility=gone by default)

### BLE Connection Lifecycle
- **Stays alive** when closing ScooterDetailsActivity (listener detached, connection persists)
- **Disconnects** when user presses the Disconnect button
- **Disconnects** when user cancels/backs out of scan
- **Disconnects** on app shutdown (ServiceFactory.shutdown)

## Key Lessons
- Supabase PostgREST returns HTTP 200 with 0 rows when RLS blocks an UPDATE (silent failure)
- `"now()"` as a JSON string value doesn't evaluate as SQL — must generate ISO 8601 timestamp
- BLEManager must use Application context (not Activity) when used as a singleton

## Previous Session
T&C acceptance wired into LoginActivity (post-login) and RegistrationChoiceActivity (periodic re-check).
SessionManager now stores `user_id`. Gson `@SerializedName` annotations added to TermsManager data classes.
