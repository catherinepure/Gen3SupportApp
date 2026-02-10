# Database Schema Reference - Gen3 Firmware Updater

**Generated:** 2026-02-10
**Database:** Supabase PostgreSQL (hhpxmlrpdharhhzwjxuc)
**Status:** Production-ready with RLS policies, indexes, and audit logging

---

## Overview

The database consists of 15 tables organized into logical groups:

**Core User & Authentication:**
- `users` - User accounts with role-based access control
- `password_reset_tokens` - Secure password reset mechanism
- `password_reset_attempts` - Rate limiting tracking

**Scooter Management:**
- `scooters` - Scooter inventory and tracking
- `scooter_telemetry` - Diagnostic data from scooters
- `firmware_versions` - Available firmware releases
- `firmware_uploads` - Firmware update history

**Service Operations:**
- `service_jobs` - Workshop service bookings
- `activity_events` - System activity logging

**Territory Management:**
- `distributors` - Regional distributors
- `workshops` - Service workshop locations

**Reference Data (Serial Number System):**
- `scooter_models` - Model definitions (e.g., Gen 3)
- `battery_variants` - Battery specifications (36V/10Ah, etc.)
- `scooter_colours` - Available color options
- `manufacturing_blocks` - Zone codes for manufacturing regions

**Audit & Security:**
- `admin_audit_log` - Complete audit trail of admin actions

---

## Table Details

### users

**Purpose:** User accounts with role-based territory access

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| email | TEXT | NO | - | Unique email address |
| password_hash | TEXT | NO | - | bcrypt hashed password |
| first_name | TEXT | YES | - | User's first name |
| last_name | TEXT | YES | - | User's last name |
| roles | TEXT[] | YES | '{}'::text[] | Role array (e.g., manufacturer_admin) |
| distributor_id | UUID | YES | - | FK to distributors |
| workshop_id | UUID | YES | - | FK to workshops |
| user_level | TEXT | YES | 'normal' | normal/manager/admin |
| home_country | TEXT | YES | - | Home country code |
| current_country | TEXT | YES | - | Current location |
| is_active | BOOLEAN | YES | true | Account active status |
| created_at | TIMESTAMPTZ | YES | now() | Account creation timestamp |
| updated_at | TIMESTAMPTZ | YES | now() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `email`
- `idx_users_distributor` on `distributor_id`
- `idx_users_workshop` on `workshop_id`
- `idx_users_country_active` on `home_country, is_active` (composite)

**RLS Policies:**
- `anon_update_users` - Users can only update their own non-privileged fields
- Prevents privilege escalation (roles, distributor_id, workshop_id, user_level)

---

### scooters

**Purpose:** Scooter inventory with serial numbers and status tracking

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| zyd_serial | TEXT | YES | - | ZYD serial number (unique) |
| imei | TEXT | YES | - | IMEI number (unique) |
| iot_device_id | TEXT | YES | - | IoT device identifier |
| owner_id | UUID | YES | - | FK to users (current owner) |
| model_id | UUID | YES | - | FK to scooter_models |
| variant_id | UUID | YES | - | FK to battery_variants |
| colour_id | UUID | YES | - | FK to scooter_colours |
| block_id | UUID | YES | - | FK to manufacturing_blocks |
| status | TEXT | YES | 'active' | active/in_service/stolen/decommissioned |
| country_of_registration | TEXT | YES | - | Registration country |
| registered_at | TIMESTAMPTZ | YES | - | Registration timestamp |
| decommissioned_at | TIMESTAMPTZ | YES | - | Decommission timestamp |
| notes | TEXT | YES | - | Additional notes |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | now() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `zyd_serial`
- UNIQUE on `imei`
- `idx_scooters_owner` on `owner_id`
- `idx_scooters_country_status` on `country_of_registration, status` (composite)

---

### scooter_telemetry

**Purpose:** Diagnostic data collected from scooters

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| scooter_id | UUID | YES | - | FK to scooters |
| user_id | UUID | YES | - | FK to users (who scanned) |
| firmware_version | TEXT | YES | - | Current firmware version |
| battery_voltage | NUMERIC | YES | - | Battery voltage (V) |
| battery_percentage | INTEGER | YES | - | Battery percentage (0-100) |
| total_mileage_km | NUMERIC | YES | - | Total distance (km) |
| error_codes | TEXT[] | YES | - | Array of error codes |
| raw_data | JSONB | YES | - | Full diagnostic data |
| scanned_at | TIMESTAMPTZ | YES | now() | When data was collected |
| created_at | TIMESTAMPTZ | YES | now() | Record creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_scooter_telemetry_scooter` on `scooter_id`
- `idx_scooter_telemetry_user` on `user_id`
- `idx_scooter_telemetry_scooter_scanned` on `scooter_id, scanned_at DESC` (composite)
- `idx_scooter_telemetry_user_scanned` on `user_id, scanned_at DESC` (composite)

---

### firmware_versions

**Purpose:** Available firmware releases for distribution

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| version | TEXT | NO | - | Version string (unique) |
| release_date | DATE | YES | - | Release date |
| file_url | TEXT | YES | - | Download URL |
| file_size_bytes | BIGINT | YES | - | File size in bytes |
| checksum_sha256 | TEXT | YES | - | SHA-256 checksum |
| release_notes | TEXT | YES | - | Release notes |
| is_active | BOOLEAN | YES | true | Available for distribution |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `version`

---

### firmware_uploads

**Purpose:** Track firmware update operations on scooters

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| scooter_id | UUID | YES | - | FK to scooters |
| user_id | UUID | YES | - | FK to users (who performed update) |
| firmware_version_id | UUID | YES | - | FK to firmware_versions |
| previous_version | TEXT | YES | - | Version before update |
| new_version | TEXT | YES | - | Version after update |
| status | TEXT | YES | 'pending' | pending/in_progress/completed/failed |
| error_message | TEXT | YES | - | Error details if failed |
| started_at | TIMESTAMPTZ | YES | now() | Update start time |
| completed_at | TIMESTAMPTZ | YES | - | Update completion time |
| created_at | TIMESTAMPTZ | YES | now() | Record creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_firmware_uploads_scooter` on `scooter_id`
- `idx_firmware_uploads_user` on `user_id`
- `idx_firmware_uploads_started` on `started_at DESC`

---

### service_jobs

**Purpose:** Workshop service bookings and maintenance tracking

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| scooter_id | UUID | YES | - | FK to scooters |
| workshop_id | UUID | YES | - | FK to workshops |
| booked_by_user_id | UUID | YES | - | FK to users (who booked) |
| status | TEXT | YES | 'pending' | pending/confirmed/in_progress/completed/cancelled |
| service_type | TEXT | YES | - | Type of service needed |
| description | TEXT | YES | - | Service description |
| booked_date | DATE | YES | - | Scheduled service date |
| completed_date | DATE | YES | - | Actual completion date |
| cost | NUMERIC | YES | - | Service cost |
| notes | TEXT | YES | - | Additional notes |
| created_at | TIMESTAMPTZ | YES | now() | Booking creation timestamp |
| updated_at | TIMESTAMPTZ | YES | now() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_service_jobs_scooter` on `scooter_id`
- `idx_service_jobs_workshop` on `workshop_id`
- `idx_service_jobs_status_workshop` on `status, workshop_id, booked_date DESC` (composite)
- `idx_service_jobs_booked_status` on `booked_date DESC, status` (composite)

---

### distributors

**Purpose:** Regional distributor organizations

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| name | TEXT | NO | - | Distributor name |
| country | TEXT | YES | - | Operating country |
| region | TEXT | YES | - | Region/territory |
| contact_email | TEXT | YES | - | Contact email |
| contact_phone | TEXT | YES | - | Contact phone |
| address | TEXT | YES | - | Physical address |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | now() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`

---

### workshops

**Purpose:** Service workshop locations under distributors

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| name | TEXT | NO | - | Workshop name |
| parent_distributor_id | UUID | YES | - | FK to distributors |
| country | TEXT | YES | - | Workshop country |
| city | TEXT | YES | - | Workshop city |
| address | TEXT | YES | - | Physical address |
| contact_email | TEXT | YES | - | Contact email |
| contact_phone | TEXT | YES | - | Contact phone |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |
| updated_at | TIMESTAMPTZ | YES | now() | Last update timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_workshops_distributor` on `parent_distributor_id`

---

### activity_events

**Purpose:** System-wide activity logging for audit trail

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| user_id | UUID | YES | - | FK to users (who performed action) |
| event_type | TEXT | NO | - | Type of event |
| resource_type | TEXT | YES | - | What was affected (scooters, users, etc.) |
| resource_id | UUID | YES | - | ID of affected resource |
| description | TEXT | YES | - | Human-readable description |
| country | TEXT | YES | - | Where event occurred |
| metadata | JSONB | YES | - | Additional event data |
| timestamp | TIMESTAMPTZ | YES | now() | When event occurred |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_activity_events_user` on `user_id`
- `idx_activity_events_timestamp` on `timestamp DESC`
- `idx_activity_events_type_country` on `event_type, country, timestamp DESC` (composite)

---

### password_reset_tokens

**Purpose:** Secure password reset mechanism with one-time tokens

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| user_id | UUID | NO | - | FK to users |
| token | UUID | NO | gen_random_uuid() | Crypto-random token |
| expires_at | TIMESTAMPTZ | NO | - | Token expiration (1 hour) |
| used | BOOLEAN | YES | false | Whether token has been used |
| created_at | TIMESTAMPTZ | YES | now() | Token creation timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- UNIQUE on `token`
- `idx_password_reset_tokens_user` on `user_id`

**Security:** Tokens expire after 1 hour and are one-time use only

---

### password_reset_attempts

**Purpose:** Rate limiting for password reset requests

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| email | TEXT | NO | - | Email that requested reset |
| ip_address | TEXT | YES | - | IP address of requester |
| created_at | TIMESTAMPTZ | YES | now() | Request timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_password_reset_attempts_email_time` on `email, created_at DESC`

**Rate Limit:** Max 3 requests per email per hour (enforced in Edge Function)

**RLS Policy:** Service role only (users cannot query or manipulate)

---

### admin_audit_log

**Purpose:** Complete audit trail of all administrative actions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| admin_id | UUID | YES | - | FK to users (admin who performed action) |
| admin_email | TEXT | NO | - | Admin email for reference |
| action | TEXT | NO | - | create/update/delete/deactivate |
| resource | TEXT | NO | - | Resource type (users, scooters, etc.) |
| resource_id | UUID | YES | - | ID of affected resource |
| changes | JSONB | YES | - | Field changes: {"field": {"old": "val", "new": "val"}} |
| ip_address | TEXT | YES | - | IP address of admin |
| created_at | TIMESTAMPTZ | YES | now() | Action timestamp |

**Indexes:**
- PRIMARY KEY on `id`
- `idx_admin_audit_log_admin` on `admin_id, created_at DESC`
- `idx_admin_audit_log_resource` on `resource, resource_id, created_at DESC`
- `idx_admin_audit_log_action` on `action, created_at DESC`
- `idx_admin_audit_log_created` on `created_at DESC`

**RLS Policies:**
- `service_role_full_access_audit_log` - Service role can INSERT
- `admins_read_audit_log` - Admins/managers can SELECT only (immutable)

---

## Reference Data Tables (Serial Number System)

### scooter_models

**Purpose:** Define scooter model types

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| code | TEXT | NO | - | 1-digit code (unique) |
| name | TEXT | NO | - | Model name (e.g., "Gen 3") |
| description | TEXT | YES | - | Model description |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |

**Seed Data:** Gen 1, Gen 2, Gen 3

---

### battery_variants

**Purpose:** Define battery specifications

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| code | TEXT | NO | - | 1-digit code (unique) |
| name | TEXT | NO | - | Variant name |
| voltage | INTEGER | YES | - | Voltage (V) |
| capacity_ah | NUMERIC | YES | - | Capacity (Ah) |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |

**Seed Data:** 36V/10Ah, 48V/10Ah, 48V/13Ah, 48V/15Ah, 48V/20Ah, 60V/20Ah

---

### scooter_colours

**Purpose:** Define available color options

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| code | TEXT | NO | - | 1-digit code (unique) |
| name | TEXT | NO | - | Color name |
| hex_colour | TEXT | YES | - | Hex color code |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |

**Seed Data:** Black, White, Red, Blue, Green, Yellow, Silver, Orange, Purple

---

### manufacturing_blocks

**Purpose:** Zone codes for manufacturing regions

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | UUID | NO | gen_random_uuid() | Primary key |
| code | TEXT | NO | - | 2-digit code (unique) |
| name | TEXT | NO | - | Block/region name |
| regions | TEXT[] | YES | - | Array of country codes |
| is_active | BOOLEAN | YES | true | Active status |
| created_at | TIMESTAMPTZ | YES | now() | Creation timestamp |

**Seed Data:** UK/Ireland, Europe, North America, Asia-Pacific, Middle East/Africa, Latin America

---

## Security Features

### Row Level Security (RLS)

All tables have RLS enabled with policies enforcing:

1. **User Self-Service:** Users can only access their own data
2. **Territory Filtering:** Users see only data within their distributor/workshop
3. **Role-Based Access:** Manufacturer admins have full access
4. **Privilege Escalation Prevention:** Users cannot modify their own roles/territories
5. **Audit Immutability:** Only service_role can write audit logs, users can only read

### Rate Limiting

- Password reset: Max 3 requests per email per hour
- Tracked in `password_reset_attempts` table
- IP addresses logged for monitoring

### Audit Logging

- All admin create/update/deactivate actions logged automatically
- JSONB changes field captures before/after values
- Immutable (users cannot delete logs)
- Read-only access for admins/managers

---

## Performance Optimizations

### Composite Indexes (Added 2026-02-10)

8 composite indexes for common filter combinations:
- Users: country + active status
- Service jobs: status + workshop + date
- Activity events: type + country + time
- Telemetry: scooter/user + scan time
- Firmware uploads: start time
- Scooters: country + status

**Expected Performance:** 40-60% faster on filtered queries

---

## Database Migrations

Migrations applied in order:

1. `001_initial_schema.sql` - Core tables
2. `002_add_timestamps.sql` - Add created_at/updated_at
3. `003_add_serial_fields.sql` - Add serial number fields
4. `004_password_reset.sql` - Password reset system
5. `005_serial_number_system.sql` - Reference data tables
6. `006_fix_rls_user_escalation.sql` - Fix privilege escalation + rate limiting
7. `007_performance_indexes.sql` - Composite indexes
8. `008_admin_audit_log.sql` - Audit logging system

---

## Edge Functions

Two serverless functions deployed:

### admin (supabase/functions/admin/index.ts)

**Purpose:** Admin API for web dashboard
**Endpoints:** users, scooters, distributors, workshops, service-jobs, firmware, telemetry, logs, events, dashboard, settings
**Security:** JWT authentication, role validation, territory filtering, audit logging

### password-reset (supabase/functions/password-reset/index.ts)

**Purpose:** Secure password reset flow
**Actions:** request (send email), verify (check token), reset (update password)
**Security:** Rate limiting (3/hour), bcrypt hashing, one-time tokens, SendGrid email

---

## Seed Data Summary

**Production database seeded with realistic test data:**

- 82 users (10 admins, 20 managers, 52 normal users)
- 32 scooters (various models, statuses, owners)
- 3 distributors (UK, Europe, Asia-Pacific)
- 4 workshops (London, Paris, Tokyo, Sydney)
- 6 service jobs (various statuses)
- 29 telemetry records
- 100+ activity events
- Complete reference data (models, variants, colours, blocks)

---

**Last Updated:** 2026-02-10 (Session 16)
**Schema Version:** Production v1.0
**Next Review:** After Phase 1 Flutter app development
