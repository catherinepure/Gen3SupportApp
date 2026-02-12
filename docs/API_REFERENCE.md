# Gen3 Scooter Platform — API Reference

**Base URL:** `https://hhpxmlrpdharhhzwjxuc.supabase.co`

All API endpoints are Supabase Edge Functions accessed at `/functions/v1/{function-name}`.
All requests use `POST` with JSON body unless otherwise noted.

Every request must include the header:
```
apikey: {SUPABASE_ANON_KEY}
```

---

## Table of Contents

1. [Authentication](#authentication)
2. [Session Management](#session-management)
3. [User Registration](#user-registration)
4. [Scooter Operations](#scooter-operations)
5. [Telemetry](#telemetry)
6. [Firmware](#firmware)
7. [PIN Management](#pin-management)
8. [Terms & Conditions](#terms--conditions)
9. [Push Notifications](#push-notifications)
10. [Activity Events](#activity-events)
11. [Service Jobs](#service-jobs)
12. [Workshops](#workshops)
13. [Admin API](#admin-api)
14. [Data Model](#data-model)
15. [Error Handling](#error-handling)

---

## Authentication

All authenticated endpoints require a `session_token` obtained from the login endpoint. Pass it in the request body or as an `X-Session-Token` header.

Sessions expire after **30 days** of inactivity.

### Login

```
POST /functions/v1/login
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | User's email address |
| `password` | string | Yes | User's password |
| `device_info` | string | No | Device identifier for session tracking |

**Response:**
```json
{
  "success": true,
  "session_token": "uuid",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "normal",
    "roles": ["customer"],
    "distributor_id": "uuid or null",
    "workshop_id": "uuid or null",
    "first_name": "Jane",
    "last_name": "Doe",
    "home_country": "GB",
    "current_country": "GB",
    "scooters": ["uuid1", "uuid2"]
  }
}
```

**Notes:**
- `role` is mapped from the database field `user_level` (values: `admin`, `manager`, `normal`)
- `scooters` is an array of scooter UUIDs linked to this user via `user_scooters`
- Supports bcrypt and legacy SHA-256 passwords; SHA-256 is auto-migrated to bcrypt on login

### Logout

```
POST /functions/v1/logout
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_token` | string | Yes | Via body or `X-Session-Token` header |

**Response:**
```json
{ "success": true, "message": "Logged out successfully" }
```

### Validate Session

```
POST /functions/v1/validate-session
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_token` | string | Yes | Session token to validate |

**Response:**
```json
{
  "valid": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "normal",
    "roles": ["customer"],
    "distributor_id": null,
    "workshop_id": null,
    "home_country": "GB",
    "current_country": "GB"
  }
}
```

---

## Session Management

### Change Email

```
POST /functions/v1/change-email
```

**Step 1: Request change** — sends a 6-digit verification code to the user's *current* email.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"request-change"` |
| `new_email` | string | Yes | New email address |
| `session_token` | string | Yes | Authenticated session |

**Step 2: Verify change** — confirms the code and updates the email.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"verify-change"` |
| `code` | string | Yes | 6-digit verification code |
| `new_email` | string | Yes | Must match step 1 |
| `session_token` | string | Yes | Authenticated session |

**Rate limit:** 1 request per 5 minutes. Codes expire after 30 minutes.

### Password Reset

```
POST /functions/v1/password-reset
```

**Step 1: Request reset**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"request"` |
| `email` | string | Yes | Account email |

**Step 2: Reset password**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"reset"` |
| `token` | string | Yes | Token from reset email link |
| `new_password` | string | Yes | New password |

**Rate limit:** 3 requests per hour. Tokens expire after 1 hour.

---

## User Registration

### Register (Account Only)

```
POST /functions/v1/register
```

Creates a user account without linking a scooter.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |
| `first_name` | string | No | First name |
| `last_name` | string | No | Last name |
| `age_range` | string | No | e.g. "25-34" |
| `gender` | string | No | |
| `scooter_use_type` | string | No | e.g. "commuting" |
| `home_country` | string | No | ISO country code |
| `current_country` | string | No | ISO country code |
| `registration_country` | string | No | ISO country code (from GPS) |

**Response:**
```json
{
  "success": true,
  "user_id": "uuid",
  "session_token": "uuid",
  "message": "Registration successful. Please verify your email."
}
```

### Register with Scooter

```
POST /functions/v1/register-user
```

Creates a user account and links it to a scooter.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Email address |
| `password` | string | Yes | Password |
| `scooter_serial` | string | Yes | Scooter ZYD serial number |
| `scooter_id` | uuid | No | If known, skips serial lookup |
| `first_name` | string | No | First name |
| `last_name` | string | No | Last name |
| `home_country` | string | No | ISO country code |
| `current_country` | string | No | ISO country code |
| `registration_country` | string | No | ISO country code |
| `telemetry` | object | No | Initial telemetry snapshot (see below) |

**Telemetry object:**

| Field | Type | Description |
|-------|------|-------------|
| `odometer_km` | number | Current odometer reading |
| `battery_soc` | integer | Battery state of charge (%) |
| `charge_cycles` | integer | Battery charge cycle count |
| `discharge_cycles` | integer | Battery discharge cycle count |
| `controller_hw_version` | string | Controller hardware version |
| `controller_sw_version` | string | Controller software version |
| `bms_hw_version` | string | BMS hardware version |
| `bms_sw_version` | string | BMS software version |

**Response:**
```json
{
  "success": true,
  "user_id": "uuid",
  "session_token": "uuid",
  "scooter_id": "uuid",
  "message": "Registration successful"
}
```

### Verify Email

```
GET /functions/v1/verify?token={token}
```

Called from email verification link. Returns an HTML page with success/error message.

Also supports `POST` with `{ "token": "..." }` for programmatic verification, returning JSON.

### Resend Verification

```
POST /functions/v1/resend-verification
```

| Field | Type | Required |
|-------|------|----------|
| `email` | string | Yes |

Always returns a success response (does not reveal whether the email exists).

---

## Scooter Operations

```
POST /functions/v1/update-scooter
```

All scooter write operations go through this Edge Function. Every action requires `session_token`.

### Get or Create Scooter

Looks up a scooter by ZYD serial number. Creates a new record if not found.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"get-or-create"` |
| `zyd_serial` | string | Yes | Scooter serial number |
| `distributor_id` | uuid | No | Distributor who manages this scooter |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "id": "uuid" }
```

### Update Scooter Version Info

Updates a scooter's firmware version fields and last connection timestamp.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"update-version"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `controller_hw_version` | string | No | Controller hardware version |
| `controller_sw_version` | string | No | Controller software version |
| `meter_hw_version` | string | No | Meter hardware version |
| `meter_sw_version` | string | No | Meter software version |
| `bms_hw_version` | string | No | BMS hardware version |
| `bms_sw_version` | string | No | BMS software version |
| `embedded_serial` | string | No | Embedded serial from BLE |
| `model` | string | No | Scooter model name |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "success": true }
```

**Note:** `last_connected_at` is set automatically to the current UTC timestamp.

---

## Telemetry

### Create Telemetry Record

Creates a telemetry snapshot in `scooter_telemetry` and updates the scooter's firmware version info. The user_id is resolved server-side from the `user_scooters` table.

```
POST /functions/v1/update-scooter
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"create-telemetry"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `distributor_id` | uuid | No | Distributor UUID |
| `hw_version` | string | No | Hardware version at time of scan |
| `sw_version` | string | No | Software version at time of scan |
| `scan_type` | string | No | e.g. `"user_dashboard"`, `"distributor_scan"`, `"user_scan"` |
| `controller_hw_version` | string | No | For scooter record update |
| `controller_sw_version` | string | No | For scooter record update |
| `meter_hw_version` | string | No | For scooter record update |
| `meter_sw_version` | string | No | For scooter record update |
| `bms_hw_version` | string | No | For scooter record update |
| `bms_sw_version` | string | No | For scooter record update |
| `embedded_serial` | string | No | Embedded serial from BLE |
| `model` | string | No | Scooter model |
| `voltage` | number | No | Battery voltage (V) |
| `current` | number | No | Battery current (A) |
| `battery_soc` | integer | No | State of charge (%) |
| `battery_health` | integer | No | Battery health (%) |
| `battery_charge_cycles` | integer | No | Charge cycle count |
| `battery_discharge_cycles` | integer | No | Discharge cycle count |
| `remaining_capacity_mah` | integer | No | Remaining capacity (mAh) |
| `full_capacity_mah` | integer | No | Full capacity (mAh) |
| `battery_temp` | integer | No | Battery temperature (C) |
| `speed_kmh` | number | No | Current speed (km/h) |
| `odometer_km` | integer | No | Total distance (km) |
| `motor_temp` | integer | No | Motor temperature (C) |
| `controller_temp` | integer | No | Controller temperature (C) |
| `fault_code` | integer | No | Active fault code |
| `gear_level` | integer | No | Current gear/speed mode |
| `trip_distance_km` | integer | No | Trip distance (km) |
| `remaining_range_km` | integer | No | Estimated remaining range (km) |
| `motor_rpm` | integer | No | Motor RPM |
| `current_limit` | number | No | Current limit (A) |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "id": "telemetry-record-uuid" }
```

### Create Scan Record (Firmware Upload Tracking)

Creates a record in `firmware_uploads` to track scooter scan events.

```
POST /functions/v1/update-scooter
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"create-scan-record"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `distributor_id` | uuid | No | Distributor UUID |
| `firmware_version_id` | uuid | No | Specific firmware version (auto-resolves latest if omitted) |
| `old_hw_version` | string | No | Hardware version before update |
| `old_sw_version` | string | No | Software version before update |
| *(telemetry fields)* | | No | Same telemetry fields as create-telemetry |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "id": "scan-record-uuid" }
```

### Read Telemetry (Direct PostgREST)

Telemetry reads use the Supabase REST API directly (no Edge Function needed).

```
GET /rest/v1/scooter_telemetry?scooter_id=eq.{uuid}&select=*&order=scanned_at.desc&limit=50
Headers:
  apikey: {ANON_KEY}
  Authorization: Bearer {ANON_KEY}
```

---

## Firmware

Firmware reads use the Supabase REST API directly.

### Get Latest Firmware for Hardware Version

```
GET /rest/v1/firmware_versions?target_hw_version=eq.{hw}&is_active=eq.true&order=created_at.desc&limit=1
Headers:
  apikey: {ANON_KEY}
  Authorization: Bearer {ANON_KEY}
```

### Get All Firmware for Hardware Version

```
GET /rest/v1/firmware_versions?target_hw_version=eq.{hw}&is_active=eq.true&order=created_at.desc
```

### Download Firmware Binary

Firmware binaries are stored in Supabase Storage in the `firmware` bucket.

```
GET /storage/v1/object/public/firmware/{file_path}
```

The `file_path` is from the `firmware_versions.file_path` field.

### Firmware Management (Admin)

Use the [Admin API](#admin-api) with resource `firmware` for create/update/deactivate operations.

---

## PIN Management

```
POST /functions/v1/user-pin
```

PINs are app-level only (not sent to the scooter hardware). They protect the lock/unlock toggle in the app.

### Check PIN Status

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"check-pin"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "has_pin": true }
```

### Set PIN

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"set-pin"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `pin` | string | Yes | Exactly 6 digits |
| `session_token` | string | Yes | Authenticated session |

**Ownership required:** User must own the scooter (via `user_scooters`), or be admin/manager.

### Verify PIN

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"verify-pin"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `pin` | string | Yes | 6-digit PIN to verify |
| `session_token` | string | Yes | Authenticated session |

**Response:**
```json
{ "valid": true }
```

**Rate limit:** 5 failed attempts per scooter per 15 minutes triggers lockout.

### Request PIN Recovery

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"request-recovery"` |
| `email` | string | Yes | Account email |
| `scooter_id` | uuid | No | Specific scooter |

No authentication required. Always returns success (does not reveal email existence). Sends a recovery link via email, valid for 1 hour.

### Reset PIN via Recovery Token

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"reset-pin"` |
| `token` | string | Yes | Recovery token from email |
| `new_pin` | string | Yes | New 6-digit PIN |

No authentication required. Token is single-use.

---

## Terms & Conditions

```
POST /functions/v1/terms
```

Uses URL path routing: `/functions/v1/terms/{endpoint}`.

### Get Latest Terms

```
GET /functions/v1/terms/latest?region={code}&language={code}&state={state}&document_type={type}
```

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `region` | string | Yes | ISO country code (e.g. `GB`, `US`) |
| `language` | string | No | Language code (default: `en`) |
| `state` | string | No | ISO 3166-2 state code |
| `document_type` | string | No | e.g. `terms_of_service`, `privacy_policy` |

**Response:**
```json
{
  "id": "uuid",
  "version": "1.0",
  "storage_path": "GB/terms-1.0-en.html",
  "public_url": "https://...supabase.co/storage/v1/object/public/terms-and-conditions/...",
  "title": "Terms of Service",
  "effective_date": "2026-01-01T00:00:00Z",
  "is_active": true
}
```

**Fallback logic:** state-specific -> country-level -> English default.

### Check Acceptance Status

```
GET /functions/v1/terms/check-acceptance?user_id={uuid}
Headers: X-Session-Token: {token}
```

**Response:**
```json
{
  "needs_acceptance": true,
  "current_version": "1.0",
  "latest_version": "2.0",
  "terms_url": "https://...",
  "terms_id": "uuid",
  "terms_title": "Terms of Service"
}
```

### Record Consent

```
POST /functions/v1/terms/record-consent
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_token` | string | Yes | Authenticated session |
| `user_id` | uuid | Yes | User UUID |
| `terms_id` | uuid | Yes | Terms document UUID |
| `version` | string | Yes | Version accepted |
| `language_code` | string | Yes | Language of accepted document |
| `region_code` | string | Yes | Region code |
| `document_type` | string | Yes | Document type |
| `accepted` | boolean | Yes | Must be `true` |
| `scrolled_to_bottom` | boolean | No | Whether user scrolled through |
| `time_to_read_seconds` | integer | No | Time spent reading |
| `ip_address` | string | No | User's IP |
| `user_agent` | string | No | Browser/app user agent |
| `device_info` | string | No | Device description |

### Upload Terms (Admin/Manager)

```
POST /functions/v1/terms/upload
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `session_token` | string | Yes | Admin/Manager session |
| `version` | string | Yes | Version number |
| `language_code` | string | Yes | e.g. `en` |
| `region_code` | string | Yes | e.g. `GB` |
| `state_code` | string | No | ISO 3166-2 state code |
| `document_type` | string | Yes | e.g. `terms_of_service` |
| `title` | string | Yes | Document title |
| `file_content` | string | Yes | Base64-encoded HTML |
| `file_name` | string | Yes | Original filename |
| `effective_date` | string | Yes | ISO 8601 date |

### List Terms (Admin/Manager)

```
GET /functions/v1/terms/list
Headers: X-Session-Token: {token}
```

### Acceptance History (Admin/Manager)

```
GET /functions/v1/terms/acceptance-history?limit=50&offset=0
Headers: X-Session-Token: {token}
```

Optional filters: `region`, `version`, `user_id`.

---

## Push Notifications

### Register Device Token

```
POST /functions/v1/register-device
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"register"` |
| `fcm_token` | string | Yes | Firebase Cloud Messaging token |
| `device_fingerprint` | string | Yes | Unique device identifier |
| `device_name` | string | No | Human-readable device name |
| `app_version` | string | No | App version string |
| `session_token` | string | Yes | Authenticated session |

### Unregister Device Token

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"unregister"` |
| `device_fingerprint` | string | Yes | Device to unregister |
| `session_token` | string | Yes | Authenticated session |

### Sending Notifications (Admin Only)

Notifications are sent through the Admin API using notification templates. See the [Admin API](#admin-api) section for `send-template`.

---

## Activity Events

```
POST /functions/v1/activity-events
```

### Ingest Events

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"ingest"` |
| `events` | array | Yes | Array of event objects (max 100) |
| `session_token` | string | Yes | Authenticated session |

**Event object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `event_type` | string | Yes | e.g. `ble_connect`, `firmware_update`, `lock_toggle` |
| `scooter_id` | uuid | No | Related scooter |
| `country` | string | No | ISO country code |
| `payload` | object | No | Arbitrary JSON data |
| `app_version` | string | No | App version |
| `device_type` | string | No | Device description |
| `timestamp` | string | No | ISO 8601 (defaults to now) |

### Query Events

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"query"` |
| `filters` | object | No | See below |
| `session_token` | string | Yes | Authenticated session |

**Filters:**

| Field | Type | Description |
|-------|------|-------------|
| `limit` | integer | Max results (default 50) |
| `offset` | integer | Pagination offset |
| `event_type` | string | Filter by event type |
| `scooter_id` | uuid | Filter by scooter |
| `user_id` | uuid | Filter by user |
| `country` | string | Filter by country |
| `from` | string | Start date (ISO 8601) |
| `to` | string | End date (ISO 8601) |

**Territory scoping:** Admin sees all. Distributor staff see their territory. Normal users see only their own events.

---

## Service Jobs

```
POST /functions/v1/service-jobs
```

### List Service Jobs

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"list"` |
| `status` | string | No | Filter by status |
| `limit` | integer | No | Max results |
| `offset` | integer | No | Pagination offset |
| `session_token` | string | Yes | Authenticated session |

### Get Service Job

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"get"` |
| `id` | uuid | Yes | Job UUID |
| `session_token` | string | Yes | Authenticated session |

### Create Service Job

Requires workshop, distributor, or admin role.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"create"` |
| `scooter_id` | uuid | Yes | Scooter UUID |
| `service_type` | string | Yes | Type of service |
| `notes` | string | No | Description |
| `session_token` | string | Yes | Authenticated session |

### Update Service Job

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"update"` |
| `id` | uuid | Yes | Job UUID |
| `status` | string | No | New status |
| `notes` | string | No | Updated notes |
| `session_token` | string | Yes | Authenticated session |

**Status flow:** `booked` -> `in_progress` / `cancelled` -> `awaiting_parts` / `ready_for_collection` / `completed`

### Cancel Service Job

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"cancel"` |
| `id` | uuid | Yes | Job UUID |
| `session_token` | string | Yes | Authenticated session |

---

## Workshops

```
POST /functions/v1/workshops
```

### List Workshops

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"list"` |
| `session_token` | string | Yes | Authenticated session |

### Get Workshop

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"get"` |
| `id` | uuid | Yes | Workshop UUID |
| `session_token` | string | Yes | Authenticated session |

### Create Workshop

Requires admin or distributor staff role.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"create"` |
| `name` | string | Yes | Workshop name |
| `phone` | string | No | Phone number |
| `email` | string | No | Email |
| `parent_distributor_id` | uuid | Yes | Parent distributor |
| `service_area_countries` | string[] | No | ISO country codes |
| `address` | object | No | Address with line_1, city, postcode, country |
| `session_token` | string | Yes | Authenticated session |

### Update Workshop

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"update"` |
| `id` | uuid | Yes | Workshop UUID |
| *(fields)* | | No | Same as create |
| `session_token` | string | Yes | Authenticated session |

### Delete Workshop (Admin Only)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `action` | string | Yes | `"delete"` |
| `id` | uuid | Yes | Workshop UUID |
| `session_token` | string | Yes | Admin session required |

---

## Admin API

```
POST /functions/v1/admin
```

The admin API follows a resource + action pattern. All requests require a session token from a user with `admin` or `manager` user_level.

**Rate limit:** 120 requests per minute.

### Request Format

```json
{
  "resource": "users",
  "action": "list",
  "session_token": "uuid",
  "...additional params"
}
```

### Available Resources and Actions

| Resource | Actions |
|----------|---------|
| **users** | `list`, `get`, `create`, `update`, `deactivate`, `export`, `search` |
| **scooters** | `list`, `get`, `create`, `update`, `link-user`, `unlink-user`, `set-pin`, `get-pin`, `reset-pin`, `export` |
| **distributors** | `list`, `get`, `create`, `update`, `export` |
| **workshops** | `list`, `get`, `create`, `update`, `export` |
| **firmware** | `list`, `get`, `create`, `update`, `deactivate`, `reactivate`, `export` |
| **service-jobs** | `list`, `get`, `create`, `update`, `cancel`, `export` |
| **telemetry** | `list`, `get`, `health-check`, `export` |
| **logs** | `list`, `get`, `export` |
| **events** | `list`, `get`, `stats`, `export` |
| **addresses** | `list`, `get`, `create`, `update`, `delete` |
| **sessions** | `list`, `cleanup` |
| **validation** | `orphaned-scooters`, `expired-sessions`, `stale-jobs`, `run-all` |
| **dashboard** | `stats` |
| **notifications** | `create-template`, `update-template`, `list-templates`, `get-template`, `delete-template`, `toggle-template`, `send-template` |

### Territory Scoping

- **Admin (`user_level: admin`):** Global access to all data
- **Manager with distributor:** Scoped to the distributor's countries
- **Manager with workshop:** Scoped to the workshop's service territory

### Notification Templates

Templates support placeholder variables that are auto-resolved at send time:

| Placeholder | Resolved From | Description |
|-------------|---------------|-------------|
| `{{user_name}}` | `users.first_name` | Recipient's first name |
| `{{user_email}}` | `users.email` | Recipient's email |
| `{{firmware_version}}` | template_data | Firmware version (manual) |
| `{{release_notes}}` | template_data | Release notes (manual) |
| `{{hw_version}}` | template_data | Hardware version (manual) |

**Target types for notifications:**

| Target Type | Description |
|-------------|-------------|
| `all` | All users with registered devices |
| `role` | Users with a specific role |
| `user` | Specific user UUID |
| `hw_version` | Users who own scooters with a specific hardware version |
| `scooter_owner` | Owner of a specific scooter |

---

## Data Model

### Core Entities

#### Users
Primary user account table. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `email` | text | Unique, used for login |
| `user_level` | text | `admin`, `manager`, or `normal` (default) |
| `distributor_id` | uuid | FK to distributors (for staff) |
| `workshop_id` | uuid | FK to workshops (for staff) |
| `roles` | text[] | Array of role strings, default `['customer']` |
| `is_verified` | boolean | Email verification status |
| `is_active` | boolean | Account active status |
| `home_country` | text | ISO country code |
| `current_country` | text | ISO country code |
| `registration_country` | text | Country at time of registration |
| `detected_region` | text | Derived from registration_country or current_country |

#### Scooters
Static scooter identity and current firmware state.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `zyd_serial` | text | Unique ZYD serial number (BLE advertised name) |
| `serial_number` | varchar | Human-readable serial (e.g. PE-A1A-0001) |
| `distributor_id` | uuid | FK to distributors |
| `status` | text | `active`, `inactive`, `stolen`, etc. |
| `controller_hw_version` | varchar | Latest controller hardware version |
| `controller_sw_version` | varchar | Latest controller software version |
| `meter_hw_version` | varchar | Latest meter hardware version |
| `meter_sw_version` | varchar | Latest meter software version |
| `bms_hw_version` | varchar | Latest BMS hardware version |
| `bms_sw_version` | varchar | Latest BMS software version |
| `last_connected_at` | timestamptz | Last BLE connection timestamp |
| `pin_encrypted` | text | Encrypted PIN (pgp_sym_encrypt) |
| `mac_address` | varchar | BLE MAC address |

#### User-Scooter Link (`user_scooters`)
Junction table linking users to their scooters.

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | uuid | FK to users |
| `scooter_id` | uuid | FK to scooters |
| `zyd_serial` | text | Denormalized serial |
| `is_primary` | boolean | Primary scooter for user |
| `nickname` | text | User-assigned name |
| `initial_odometer_km` | numeric | Odometer at registration |

#### Scooter Telemetry (`scooter_telemetry`)
Time-series telemetry snapshots captured on each BLE connection.

| Field | Type | Description |
|-------|------|-------------|
| `scooter_id` | uuid | FK to scooters |
| `user_id` | uuid | FK to users (auto-resolved) |
| `scan_type` | varchar | `user_dashboard`, `distributor_scan`, `user_scan` |
| `voltage` | double | Battery voltage (V) |
| `current` | double | Battery current (A) |
| `battery_soc` | integer | State of charge (%) |
| `speed_kmh` | double | Speed at time of scan |
| `odometer_km` | integer | Total distance (km) |
| `motor_temp` | integer | Motor temperature (C) |
| `controller_temp` | integer | Controller temperature (C) |
| `fault_code` | integer | Active fault code (0 = none) |
| `scanned_at` | timestamptz | When the scan occurred |

#### Firmware Versions
Available firmware for OTA updates.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `version_label` | text | Version string (e.g. "2.1.0") |
| `file_path` | text | Path in Supabase Storage |
| `target_hw_version` | text | Compatible hardware version |
| `min_sw_version` | text | Minimum current software version for update |
| `is_active` | boolean | Whether this version is available |
| `access_level` | text | `distributor` or `public` |

#### Distributors
Regional distribution partners.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Distributor name |
| `countries` | text[] | Array of ISO country codes in territory |
| `is_active` | boolean | Active status |

#### Workshops
Service/repair centres, linked to a parent distributor.

| Field | Type | Description |
|-------|------|-------------|
| `id` | uuid | Primary key |
| `name` | text | Workshop name |
| `parent_distributor_id` | uuid | FK to distributors |
| `service_area_countries` | text[] | Countries served |

### Supporting Tables

| Table | Purpose |
|-------|---------|
| `firmware_uploads` | Tracks firmware update attempts and scan events |
| `firmware_hw_targets` | Maps firmware versions to multiple hardware targets |
| `user_sessions` | Active login sessions (30-day expiry) |
| `device_tokens` | FCM push notification tokens |
| `notification_templates` | Reusable notification templates with placeholders |
| `push_notifications` | Notification send history and delivery stats |
| `terms_conditions` | T&C document versions by region/language |
| `user_consent` | Audit trail of T&C acceptance events |
| `service_jobs` | Workshop service/repair job tracking |
| `activity_events` | App-level event tracking |
| `admin_audit_log` | Admin action audit trail |
| `user_audit_log` | User-facing audit trail |
| `email_change_requests` | Pending email change verifications |
| `pin_verification_attempts` | PIN brute-force rate limiting |
| `pin_recovery_tokens` | PIN reset tokens |
| `password_reset_tokens` | Password reset tokens |
| `scooter_models` | Scooter model definitions |
| `battery_variants` | Battery type definitions |
| `colour_options` | Colour options for serial generation |
| `block_codes` | Regional block codes for serial generation |
| `serial_sequences` | Auto-incrementing serial number sequences |
| `scooter_batteries` | Battery component history per scooter |
| `scooter_controllers` | Controller component history per scooter |
| `scooter_motors` | Motor component history per scooter |
| `scooter_frames` | Frame component history per scooter |
| `distributor_addresses` | Distributor physical addresses |
| `workshop_addresses` | Workshop physical addresses |

---

## Error Handling

All endpoints return JSON error responses:

```json
{
  "error": "Description of what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad request (missing/invalid parameters) |
| 401 | Authentication failed (missing/invalid/expired session token) |
| 403 | Forbidden (insufficient permissions or ownership check failed) |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

### Common Error Scenarios

| Error | Cause | Resolution |
|-------|-------|------------|
| `"Session token required"` | No session_token in request | Include session_token in body or X-Session-Token header |
| `"Authentication failed"` | Token expired or invalid | Re-login to get a new session token |
| `"You do not own this scooter"` | PIN operation on unowned scooter | User must be linked via user_scooters |
| `"Too many failed attempts"` | PIN rate limit (5 failures/15 min) | Wait 15 minutes |
| `"Invalid email or password"` | Wrong credentials | Check credentials |
| `"Email not verified"` | Login before email verification | Check email for verification link |

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| Admin API | 120 requests/minute per session |
| Password reset requests | 3 per hour per email |
| Email change requests | 1 per 5 minutes per user |
| PIN verification | 5 failed attempts per 15 minutes per scooter |

---

## Direct PostgREST Access

Read-only queries can be made directly against the Supabase REST API at `/rest/v1/{table}`. These use the anon key and are subject to Row Level Security (RLS) policies.

**Available for reads:**
- `scooters` — SELECT allowed for anon
- `scooter_telemetry` — SELECT allowed for anon
- `firmware_versions` — SELECT allowed for anon
- `firmware_uploads` — SELECT allowed for anon
- `user_scooters` — SELECT allowed for anon
- `distributors` — SELECT allowed for anon

**PostgREST query syntax examples:**
```
# Filter by equality
?column=eq.value

# Filter by multiple conditions
?status=eq.active&distributor_id=eq.{uuid}

# Select specific columns
?select=id,name,email

# Join related tables
?select=*,users(first_name,last_name)

# Order and paginate
?order=created_at.desc&limit=50&offset=0
```

**All write operations** (INSERT, UPDATE, DELETE) must go through Edge Functions, not direct PostgREST.
