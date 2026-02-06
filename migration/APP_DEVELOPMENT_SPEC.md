# App Development Spec -- Data Model, Navigation & Migration Strategy

> **Purpose:** This document defines the data model, entity relationships, activity tracking, data access scoping, app pages/navigation, state management approach, and migration strategy from native Android (Java) to Flutter. Use this to audit the current codebase, plan the migration, and guide implementation of missing features.

---

## 1. Architecture Decisions

### 1.1 Framework: Flutter (Dart)

The app will be built in Flutter to achieve consistent UI across Android and iOS from a single codebase. This is a migration from the existing native Android (Java) app.

Key reasons for this choice:
- Pixel-perfect UI consistency across platforms, important for four distinct role-based interfaces.
- Single codebase reduces divergence risk across platforms.
- Dart is strongly typed and familiar to Java developers.
- Good support for offline-first patterns (local event queuing, batch sync).
- Platform channels available for native hardware access (SIM/MCC, GPS, BLE).

### 1.2 State Management: Riverpod

Riverpod is the chosen state management approach for this project. **All code generation and screen implementation must use Riverpod consistently.**

Reasons for this choice:
- The role-and-territory scoping pattern is Riverpod's strength. Define a provider for the authenticated user's role and territory, and every downstream provider (scooter list, customer search, dashboard metrics) automatically inherits those filters.
- Handles async data patterns well -- loading states, error handling, caching, background sync.
- Less boilerplate than Bloc, which matters when generating dozens of role-specific screens.
- Clean dependency injection -- providers can depend on other providers without manual wiring.

**Riverpod conventions for this project:**

- Use `flutter_riverpod` (not the base `riverpod` package).
- Use code generation with `riverpod_annotation` and `riverpod_generator` for type safety and reduced boilerplate.
- Organise providers by feature/domain, not by type. E.g. `lib/features/auth/providers/` not `lib/providers/auth/`.
- Use `AsyncNotifierProvider` for any state that involves API calls or async operations.
- Use `NotifierProvider` for synchronous local state.
- Use `StreamProvider` for real-time data (e.g. event queue sync status).
- The auth provider is the root -- role, territory, and user ID flow from it into everything else.

**Core provider hierarchy:**

```
AuthProvider (user session, role, territory)
  |
  +-- UserProvider (current user profile, home_country, current_country)
  |
  +-- TerritoryProvider (allowed countries for current user's role)
  |     |
  |     +-- ScooterListProvider (filtered by territory)
  |     +-- CustomerSearchProvider (filtered by territory)
  |     +-- AnalyticsProvider (scoped to territory)
  |
  +-- EventQueueProvider (local activity event buffer, sync state)
  |
  +-- NavigationProvider (available routes based on role)
```

### 1.3 Project Structure

```
lib/
  app.dart                          # App entry point, router setup
  core/
    api/                            # API client, interceptors, territory middleware
    models/                         # Shared data models (User, Scooter, etc.)
    providers/                      # Core providers (auth, territory, navigation)
    services/                       # Background services (event queue, sync)
    utils/                          # Helpers, constants, extensions
    widgets/                        # Shared UI components
  features/
    auth/                           # Sign in, sign up, country detection
      pages/
      providers/
      widgets/
    customer/                       # Customer-facing screens
      pages/                        # My Scooters, Rides, Alerts, Profile
      providers/
      widgets/
    distributor/                    # Distributor-facing screens
      pages/                        # Dashboard, Search, Analytics, Staff
      providers/
      widgets/
    workshop/                       # Workshop-facing screens
      pages/                        # Service Queue, Diagnostics, Parts
      providers/
      widgets/
    manufacturer/                   # Pure Electric admin screens
      pages/                        # Global Dashboard, Fleet, Compliance
      providers/
      widgets/
    scooter/                        # Shared scooter features (used across roles)
      models/
      providers/
      widgets/
    activity/                       # Activity event tracking
      models/
      providers/
      services/                     # Local queue, batch sync
```

### 1.4 Routing

Use `go_router` with role-based redirect guards. The router configuration should:

- Define all routes for all roles.
- Use a redirect function that checks the current user's role and prevents access to pages outside their scope.
- Support deep linking (useful for push notification targets).
- Handle the unauthenticated state by redirecting to sign-in.

---

## 2. Core Entities

### 2.1 User (Individual Person)

Every person in the system is a User. A User's **role** determines what they can do.

**Roles** (a user may hold one or more):
- `customer` -- end user who owns/rides scooters
- `distributor_staff` -- employee or owner of a Distributor entity
- `workshop_staff` -- employee of a Workshop entity
- `manufacturer_admin` -- Pure Electric staff with global access

**Mandatory fields:**
| Field | Type | Notes |
|-------|------|-------|
| `email` | String (unique) | Primary identifier / login credential |
| `home_country` | String (ISO 3166-1) | **Derived via multi-signal detection** (see section 6). Stable -- determines distributor territory. |
| `current_country` | String (ISO 3166-1) | Updated each session. Used for regulatory compliance (speed limits etc.). |
| `role` | Enum[] | One or more of the roles above |

**Optional fields:**
| Field | Type | Notes |
|-------|------|-------|
| `first_name` | String | |
| `last_name` | String | |
| `date_of_birth` | Date | Preferred over storing age, which goes stale |
| `gender` | String / Enum | Define accepted values -- consider inclusive options |
| `preferred_scooter_type` | String / FK | Links to a scooter model/type catalogue if one exists |

### 2.2 Distributor (Organisation Entity)

A distributor is a business entity, not a person. It has staff members who are Users.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| `name` | String | Business/trading name |
| `addresses` | Address[] | One or more addresses (see Address sub-model) |
| `phone` | String | Primary contact number (include country code) |
| `email` | String | Organisation-level contact email |
| `countries` | String[] (ISO 3166-1) | Countries this distributor covers -- one or more |
| `staff_members` | User[] | One or more Users with `distributor_staff` role |
| `workshops` | Workshop[] | Zero or more associated Workshops |

### 2.3 Workshop (Organisation Entity)

A workshop **can exist independently** (no parent distributor) or be linked to a Distributor.

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| `name` | String | |
| `address` | Address | |
| `phone` | String | |
| `email` | String | |
| `parent_distributor` | FK (nullable) | Null if independent workshop |
| `staff_members` | User[] | One or more Users with `workshop_staff` role |
| `service_area_countries` | String[] | Countries/regions this workshop serves |

### 2.4 Scooter

A scooter belongs to a User (of any role).

**Fields:**
| Field | Type | Notes |
|-------|------|-------|
| `owner` | FK -> User | The user who owns/is assigned this scooter |
| `scooter_type` | String / FK | Model, variant etc. |
| `pin` | String (6 digits) | Stored securely (hashed). Exactly 6 numeric digits. |
| `serial_number` | String (unique) | Unique hardware identifier |
| `registration_date` | DateTime | When the scooter was added to the system |
| `firmware_version` | String | Current firmware -- needed for OTA and compliance |
| `status` | Enum | `active`, `in_service`, `stolen`, `decommissioned` |
| `country_of_registration` | String (ISO 3166-1) | Determines which distributor territory it falls under |

### 2.5 Address (Sub-model / Embedded)

Used by Distributors and Workshops.

| Field | Type |
|-------|------|
| `line_1` | String |
| `line_2` | String (nullable) |
| `city` | String |
| `region` | String (nullable) |
| `postcode` | String |
| `country` | String (ISO 3166-1) |

### 2.6 Service Job (New Entity)

Links a scooter to a workshop for a specific service visit.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `scooter_id` | FK -> Scooter | |
| `workshop_id` | FK -> Workshop | |
| `customer_id` | FK -> User | Owner at time of service |
| `technician_id` | FK -> User (nullable) | Assigned workshop_staff |
| `status` | Enum | `booked`, `in_progress`, `awaiting_parts`, `ready_for_collection`, `completed`, `cancelled` |
| `booked_date` | DateTime | |
| `started_date` | DateTime (nullable) | |
| `completed_date` | DateTime (nullable) | |
| `issue_description` | String | Customer-reported issue |
| `technician_notes` | String (nullable) | |
| `parts_used` | JSON | List of parts and quantities |
| `firmware_updated` | Boolean | Whether firmware was updated during service |
| `firmware_version_before` | String (nullable) | |
| `firmware_version_after` | String (nullable) | |

---

## 3. Activity Tracking

Activity tracking is the backbone of the analytics that Pure, distributors, and workshops each need. Every meaningful event should be captured as an immutable event record.

### 3.1 Activity Event (New Entity)

Each event is a single immutable row. Never update or delete these -- they form an audit trail.

| Field | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `timestamp` | DateTime (UTC) | When the event occurred |
| `event_type` | Enum | See event types below |
| `scooter_id` | FK -> Scooter (nullable) | Which scooter, if applicable |
| `user_id` | FK -> User | Who triggered or is associated with the event |
| `country` | String (ISO 3166-1) | Country where the event occurred (from device location) |
| `distributor_id` | FK -> Distributor (nullable) | Resolved from country at write time for fast querying |
| `workshop_id` | FK -> Workshop (nullable) | If event involves a workshop |
| `payload` | JSON | Event-specific data (see below) |
| `app_version` | String | App version that generated the event |
| `device_type` | String | Android/iOS/Web |

### 3.2 Event Types

**Scooter lifecycle:**
- `scooter_registered` -- Payload: serial number, scooter type, registration country.
- `scooter_transferred` -- Payload: previous owner ID, new owner ID, reason.
- `scooter_decommissioned` -- Payload: reason.
- `scooter_status_changed` -- Payload: old status, new status.
- `scooter_reported_stolen` -- Payload: last known location, date.

**Ride/usage activity:**
- `ride_started` -- Payload: start location (lat/lng), battery level.
- `ride_ended` -- Payload: end location, distance, duration, battery consumed, average speed, max speed.
- `pin_unlock` -- Payload: success/failure only.
- `pin_changed` -- Payload: none (never log PINs).

**Service and maintenance:**
- `service_booked` -- Payload: issue description, workshop ID.
- `service_started` -- Payload: workshop ID, technician user ID.
- `service_completed` -- Payload: parts replaced, firmware updated (y/n), cost, notes.
- `firmware_updated` -- Payload: old version, new version.
- `warranty_claim` -- Payload: claim type, description.

**User account:**
- `user_registered` -- Payload: country, role, signup source.
- `user_login` -- Payload: device type, app version, country.
- `user_profile_updated` -- Payload: fields changed (not values, for privacy).

**Battery and diagnostics:**
- `battery_report` -- Payload: voltage, cycle count, health %, temperature.
- `error_code` -- Payload: error code, severity, scooter state at time of error.
- `charging_session` -- Payload: start %, end %, duration, charger type.

### 3.3 Event Collection Strategy

- Queue events locally in SQLite (using `drift` package in Flutter) and sync when connectivity is available.
- Batch uploads every 5--10 minutes during active use, or on ride end.
- Include a `synced_at` timestamp so the server knows when data arrived versus when it was generated.
- Compress payloads for bandwidth-constrained markets.
- Use a Riverpod `StreamProvider` to expose sync status to the UI.

---

## 4. Data Access Scoping -- Who Sees What

Distributors and workshops must only see data for scooters and customers **within their territory**. The scoping chain is: country detection on the user/scooter determines territory, territory maps to distributor, distributor maps to workshops.

### 4.1 Access Hierarchy

```
Pure Electric (manufacturer_admin)
  -- Global access to ALL data across all countries
  -- Can see aggregated and individual records
  -- Can manage all distributors, workshops, users, scooters

Distributor (distributor_staff)
  -- Scoped to countries in their `countries` list
  -- Can search/view scooters where scooter.country_of_registration IN distributor.countries
  -- Can search/view customers where user.home_country IN distributor.countries
  -- Can view their own workshops and workshop activity
  -- Can see aggregated analytics for their territory only
  -- CANNOT see data from other distributors' territories

Workshop (workshop_staff)
  -- Can see scooters currently assigned to them for service
  -- Can see service history for scooters they are working on
  -- Can see customer contact details only for active service jobs
  -- If linked to a distributor, scoped to that distributor's territory
  -- If independent, scoped to their own service_area_countries
  -- CANNOT browse all customers or scooters freely

Customer (customer)
  -- Can see only their own scooters and activity
  -- Can see their own ride history and service records
  -- CANNOT see other users' data
```

### 4.2 Scoping Implementation

Every API query for scooters or customers must apply a territory filter at the **API/middleware layer**, not just in the UI.

```
# Pseudocode for distributor-scoped scooter search
GET /api/scooters?search=<query>

1. Authenticate user, get their role
2. If role == manufacturer_admin: no filter
3. If role == distributor_staff:
     distributor = get_distributor_for_user(user)
     allowed_countries = distributor.countries
     results = Scooter.filter(country_of_registration__in=allowed_countries)
4. If role == workshop_staff:
     workshop = get_workshop_for_user(user)
     if workshop.parent_distributor:
       allowed_countries = workshop.parent_distributor.countries
     else:
       allowed_countries = workshop.service_area_countries
     results = Scooter.filter(
       country_of_registration__in=allowed_countries,
       status='in_service',
       current_workshop=workshop
     )
5. If role == customer:
     results = Scooter.filter(owner=user)
```

**Flutter implementation:** The `TerritoryProvider` in Riverpod reads the user's role from `AuthProvider` and exposes `allowedCountries`. All API call providers include this as a parameter automatically. The API client interceptor should also attach territory scope to request headers as a defence-in-depth measure.

### 4.3 Data Visibility Rules

| Data point | Pure | Distributor | Workshop | Customer |
|------------|------|-------------|----------|----------|
| Individual ride data (routes, speed) | Yes | Aggregated only | No | Own rides only |
| Customer personal details | Yes | Within territory | Active service jobs only | Own profile |
| Scooter serial/status | Yes | Within territory | Assigned scooters | Own scooters |
| Battery diagnostics | Yes | Within territory | Assigned scooters | Own scooters (simplified) |
| Service history | Yes | Within territory | Own workshop records | Own scooters |
| Error codes/faults | Yes | Within territory | Assigned scooters | Simplified alerts |
| Sales/registration volumes | Yes (global) | Own territory | No | No |
| Firmware versions | Yes (global) | Within territory | Assigned scooters | Own scooters |
| Financial/warranty data | Yes | Own claims | Own claims | Own claims |

---

## 5. Analytics Dashboards

### 5.1 Pure Electric (Manufacturer) Dashboard

- **Global fleet overview:** total registered scooters by country, model, status. Map visualisation.
- **Registration trends:** new scooters per week/month, by country and model.
- **Active user metrics:** DAU/WAU/MAU by country. Retention curves. Signup-to-first-ride conversion.
- **Ride analytics (aggregated):** total rides, average distance/duration, rides per scooter per week.
- **Battery health fleet-wide:** distribution of health percentages. Batch-level early warning.
- **Error code analysis:** common faults, trending faults, correlation with firmware/model.
- **Firmware rollout:** percentage of fleet on each version, OTA success rates.
- **Service and warranty:** claim rates by model/country, time-to-repair, common parts.
- **Distributor performance:** comparative metrics across distributors.
- **Regulatory compliance:** scooters potentially non-compliant by country/firmware.
- **Data exports:** CSV/API for BI tools.

### 5.2 Distributor Dashboard

- **Territory fleet overview:** scooters in their countries, by model and status.
- **Customer search:** by email, name, serial -- **filtered to territory only**.
- **Scooter search:** by serial, status, model -- **filtered to territory only**.
- **Customer activity (aggregated):** active riders, rides per week, new registrations.
- **Service overview:** scooters in service, turnaround times, common issues.
- **Workshop performance:** compare workshops on turnaround, volume.
- **Warranty and returns:** territory claims and status.
- **Firmware status:** territory fleet version breakdown.
- **Error code alerts:** trending faults in territory.

### 5.3 Workshop Dashboard

- **Service queue:** kanban board -- booked, in progress, awaiting parts, ready for collection.
- **Scooter diagnostics:** battery health, error history, firmware, service history per scooter in care.
- **Customer contact:** owner details for active jobs only.
- **Service history (own workshop):** past jobs, parts, time taken.
- **Parts usage:** consumption tracking, reorder alerts.
- **Technician workload:** jobs per staff member.

### 5.4 Customer View

- **My rides:** date, distance, duration, battery used.
- **My scooter health:** battery indicator (good/fair/poor), last service, firmware status.
- **Service status:** progress tracking for active service jobs.
- **Alerts:** firmware updates, service reminders, battery warnings.

---

## 6. Country Detection -- Multi-Signal Approach

The user's country is the foundation for territory scoping. It determines which distributor "owns" the customer relationship.

**Signal sources (priority order):**
1. **SIM card** -- MCC from device SIM. Most reliable for home country.
2. **GPS / Location Services** -- reverse geocode. Most accurate for current location.
3. **Cell tower** -- MCC from network registration.
4. **Wi-Fi** -- IP geolocation. Least precise, always available.

**Implementation:**
- `home_country` = stable, determined primarily from SIM. Used for territory scoping.
- `current_country` = updated each session from GPS/cell. Used for regulatory compliance.
- Use confidence-weighted approach: SIM says UK + GPS says France = UK resident travelling.
- Flutter: use platform channels to access Android `TelephonyManager` and iOS equivalents. IP geolocation as web/fallback.
- Manual override available but auto-detection is the default.
- **Edge case:** permanent relocation needs a process to update `home_country` and reassign distributor territory.

---

## 7. Entity Relationships

```
User (1) ----< (many) Scooter
  A user can own one or more scooters.
  A scooter belongs to exactly one user.

User (1) ----< (many) ActivityEvent
  Every event is linked to the user who triggered it.

Scooter (1) ----< (many) ActivityEvent
  Scooter-related events link back to the scooter.

Scooter (1) ----< (many) ServiceJob
  A scooter can have multiple service visits over its lifetime.

Workshop (1) ----< (many) ServiceJob
  A workshop handles many service jobs.

Distributor (1) ----< (many) User [as distributor_staff]
  A distributor has one or more staff members.

Distributor (1) ----< (many) Country [territory]
  A distributor covers one or more countries.

Distributor (1) ----< (many) Workshop [optional]
  A distributor may have zero or more workshops.

Workshop (0..1) ----< (many) User [as workshop_staff]
  A workshop has one or more staff members.
  A workshop may have zero or one parent distributor.

Country -- links Users, Scooters, and Distributors:
  User.home_country IN Distributor.countries = that distributor's customer
  Scooter.country_of_registration IN Distributor.countries = that distributor's scooter
```

---

## 8. App Pages / Navigation

### 8.1 Authentication & Onboarding
| Page | Purpose | Data needed |
|------|---------|-------------|
| **Sign Up** | Create user account | Email (mandatory), optional name/DOB/gender |
| **Sign In** | Email-based auth | Email, password or magic link |
| **Country Detection** | Auto-detect on first launch | SIM, GPS, cell tower, Wi-Fi signals |
| **Role Selection / Assignment** | Set user context | Role enum -- or assigned by admin/distributor |

### 8.2 Customer Pages
| Page | Purpose | Links to |
|------|---------|---------|
| **My Scooters** (list) | View all owned scooters | Add Scooter, Scooter Detail |
| **Add Scooter** | Register a new scooter | Serial number entry, type selection, PIN setup |
| **Scooter Detail** | View/edit single scooter | PIN management, service history, health |
| **My Rides** | Ride history list | Ride detail (distance, duration, battery) |
| **Service Status** | Track active service jobs | Workshop contact, progress |
| **Alerts** | Firmware, battery, service reminders | Scooter detail |
| **My Profile** | View/edit personal info | Name, email, country, preferences |

### 8.3 Distributor Pages
| Page | Purpose | Links to |
|------|---------|---------|
| **Distributor Dashboard** | Territory overview with key metrics | All sub-pages |
| **Customer Search** | Search customers in territory | Customer detail (limited view) |
| **Scooter Search** | Search scooters in territory | Scooter detail |
| **Fleet Analytics** | Registration trends, active scooters, model mix | Drill-down by country/model |
| **Service Overview** | Workshop activity, turnaround times | Workshop detail |
| **Error Code Alerts** | Trending faults in territory | Affected scooter list |
| **Firmware Status** | Fleet firmware version breakdown | Scooters needing update |
| **Warranty Claims** | Claims in territory, status | Claim detail |
| **Staff Management** | Add/remove/view staff | User profiles |
| **Workshop Management** | View linked workshops | Workshop detail |
| **Distributor Profile** | Edit org details | Addresses, phone, email, countries |

### 8.4 Workshop Pages
| Page | Purpose | Links to |
|------|---------|---------|
| **Workshop Dashboard** | Service queue overview | All sub-pages |
| **Service Queue** | Active jobs board (kanban-style) | Job detail |
| **Job Detail** | Single service job with diagnostics | Scooter diagnostics, customer contact |
| **Scooter Diagnostics** | Battery, errors, firmware, history for scooter in service | Service history |
| **Parts Usage** | Track parts consumed | Reorder alerts |
| **Staff Workload** | Jobs per technician | Job assignment |
| **Workshop Profile** | Edit workshop details | Address, contact, linked distributor |

### 8.5 Pure Electric (Manufacturer) Pages
| Page | Purpose | Links to |
|------|---------|---------|
| **Global Dashboard** | Worldwide fleet and user overview, map view | All sub-pages |
| **Fleet Analytics** | Registrations, active scooters, model mix by country | Drill-down |
| **User Analytics** | DAU/WAU/MAU, retention, demographics | Segment by country |
| **Ride Analytics** | Aggregated ride data, trends | By country/model |
| **Battery Health** | Fleet-wide battery distribution, batch alerts | Drill to serial numbers |
| **Error Code Analysis** | Fault trends, correlation with firmware/model | Drill to affected scooters |
| **Firmware Rollout** | Version distribution, OTA success rates | By country/model |
| **Distributor Performance** | Comparative metrics across distributors | Distributor detail |
| **Service & Warranty** | Global service and claim metrics | By distributor/model |
| **Regulatory Compliance** | Scooters potentially non-compliant | By country/firmware |
| **Data Export** | CSV/API export for BI tools | Filtered by date/country/model |
| **Distributor Admin** | Create/manage distributors | Distributor detail |
| **Workshop Admin** | Create/manage all workshops | Workshop detail |
| **User Admin** | Global user management | User detail |
| **Scooter Admin** | Global scooter management | Scooter detail |

### 8.6 Admin / System Pages
| Page | Purpose | Notes |
|------|---------|-------|
| **Role & Permission Management** | Configure what each role can access | |
| **Territory Management** | Assign countries to distributors | Prevent overlaps |
| **Audit Log** | View all activity events (system-level) | Filterable |
| **System Health** | API performance, sync status, error rates | |

---

## 9. Migration Strategy -- Java Android to Flutter

### 9.1 Phasing Principle

**Migrate first, then build new features.** Do not add activity tracking, dashboards, or territory scoping to the Java app. Build all new functionality in Flutter from the start.

### 9.2 Phase 1 -- Flutter Scaffold & Feature Parity

**Goal:** Replicate the current Android app's functionality in Flutter.

**Tasks:**
1. Create Flutter project with the folder structure from section 1.3.
2. Set up Riverpod, go_router, dio (HTTP client), drift (local DB).
3. Convert existing Java model classes to Dart (freezed + json_serializable).
4. Recreate the API client layer -- same backend endpoints, new Dart client.
5. Migrate existing screens: auth, user profile, scooter registration, PIN management.
6. Implement platform channels for country detection (Android TelephonyManager, iOS equivalent).
7. Test on both Android and iOS.

**Claude Code approach:** Feed it the existing Java models and Activities one at a time. Ask it to produce the Dart equivalent using Riverpod + the project conventions from section 1.2. Review each output before moving on.

**Exit criteria:** The Flutter app can do everything the current Java app does, on both platforms.

### 9.3 Phase 2 -- Data Model Extensions

**Goal:** Extend the backend and models for the new entity structure.

**Tasks:**
1. Add `home_country` and `current_country` to User (migrate from single `country` field).
2. Add `manufacturer_admin` role.
3. Add new fields to Scooter: `serial_number`, `firmware_version`, `status`, `country_of_registration`.
4. Create ServiceJob entity and API endpoints.
5. Create ActivityEvent entity, event type enum, and ingestion API endpoint.
6. Add `service_area_countries` to Workshop.
7. Create database migrations for all schema changes.
8. Update Dart models to match.

**Claude Code approach:** Give it the current database schema alongside section 2 of this spec. Ask for a gap analysis first, then generate migrations and updated models.

**Exit criteria:** All entities from section 2 exist in both the database and the Dart model layer.

### 9.4 Phase 3 -- Access Control & Territory Scoping

**Goal:** Implement the role-based, territory-scoped access system.

**Tasks:**
1. Build the API middleware that applies territory filters (section 4.2).
2. Implement the Riverpod provider hierarchy from section 1.2 (AuthProvider -> TerritoryProvider -> downstream).
3. Set up go_router with role-based guards -- each role only sees their permitted routes.
4. Build the role-switching navigation shell (bottom nav or drawer changes based on role).
5. Write integration tests that verify a distributor cannot access another distributor's data.

**Claude Code approach:** Give it the access hierarchy from section 4.1 and the pseudocode from 4.2. Ask it to generate the middleware, providers, and router guards. Emphasise that territory filtering must be server-side.

**Exit criteria:** A distributor staff member logging in sees only their territory's data. A workshop sees only their active jobs. API returns 403 for out-of-scope requests.

### 9.5 Phase 4 -- New Feature Screens

**Goal:** Build the activity tracking, dashboards, and analytics.

**Tasks:**
1. Build the local event queue (drift database, background sync service).
2. Implement ride tracking events (start, end, battery, distance).
3. Build the customer screens: My Rides, Service Status, Alerts, Scooter Health.
4. Build the workshop screens: Service Queue (kanban), Job Detail, Scooter Diagnostics, Parts Usage.
5. Build the distributor screens: Dashboard, Customer Search, Scooter Search, Fleet Analytics, Error Alerts.
6. Build the Pure/manufacturer screens: Global Dashboard, all analytics views, Distributor Performance.
7. Implement push notifications for alerts (firmware, battery, service).

**Claude Code approach:** Work through each role's screens in order: customer first (simplest), then workshop, then distributor, then manufacturer. For each screen, provide the relevant section of this spec and ask Claude Code to generate the page, its providers, and any widgets. Review the territory scoping on every screen that shows filtered data.

**Exit criteria:** All pages from section 8 are implemented, territory scoping works correctly, activity events are being captured and synced.

---

## 10. Claude Code -- Model Strategy & Working Method

### 10.1 When to Use Sonnet vs Opus

Not all tasks need the same model. Use the right one for the job to balance speed, cost, and quality.

**Use Sonnet (default) for:**
- Converting Java model classes to Dart equivalents
- Scaffolding new screens, providers, and widgets following established patterns
- Generating CRUD API client code
- Writing repetitive or pattern-heavy code (e.g. the 15th screen that follows the same structure as the previous 14)
- Writing unit tests for individual providers or widgets
- Generating data serialisation (freezed, json_serializable)
- Producing boilerplate (route definitions, theme setup, dependency injection wiring)

Sonnet is faster and handles pattern replication well. For the bulk of this project -- probably 80--85% of the code generation -- Sonnet is the right choice.

**Switch to Opus for:**
- **Gap analysis** at the start of each phase -- comparing existing code/schema against this spec and reasoning about what to change, keep, or restructure.
- **Territory scoping middleware** (section 4.2) -- the access control logic has edge cases (independent workshops, multi-role users, home vs current country) where a mistake creates a security hole.
- **Provider hierarchy design** -- getting the dependency chain right between AuthProvider, TerritoryProvider, and downstream data providers. Subtle errors here cascade everywhere.
- **Integration points** where multiple systems interact -- event queue sync, platform channel bridge code, role-based router guards.
- **Code review passes** after Sonnet has generated a batch of screens or a complete feature area. Have Opus review for consistency, security issues, territory scoping correctness, and adherence to this spec.
- **Architectural decisions** that aren't covered in this spec -- when something unexpected comes up and a judgement call is needed.

**Practical pattern:** Sonnet generates, Opus plans and reviews. At the start of each phase, use Opus to plan the work and identify risks. Use Sonnet to execute. At the end of each phase, use Opus to review everything before moving on.

### 10.2 Incremental Working Method

Claude Code should work through this project incrementally, not in large batches. The principle is: **build a small piece, verify it works, fix what's broken, then move on.**

**General rules for Claude Code:**

1. **Work in small, testable units.** One model class, one provider, one screen at a time. Do not generate an entire feature area in a single pass.

2. **After generating code, immediately verify it.** Run `flutter analyze` to check for static errors. Run `flutter test` if tests exist. Attempt a build (`flutter build`) to catch compilation issues. Do not move to the next piece until the current piece compiles cleanly.

3. **Write tests alongside code, not after.** For each provider, write at least a basic test that verifies it instantiates and handles the happy path. For access control logic, write tests that verify both permitted and denied access.

4. **Stop and report when something is unclear or broken.** If a compilation error suggests a deeper architectural issue, or if the existing codebase contradicts this spec in a way that's not obvious to resolve, stop and ask rather than guessing.

5. **Commit logically.** Each commit should represent one working piece -- "Add User model with freezed serialisation", "Add AuthProvider with role and territory", "Add distributor scooter search with territory filter". Not "Add all models" or "Add Phase 3".

**Per-phase working rhythm:**

**Phase 1 (Migration):**
```
For each existing Java file:
  1. Read the Java source
  2. Generate the Dart equivalent
  3. Run flutter analyze
  4. Fix any issues
  5. If it's a screen, hot-reload and visually verify
  6. Run existing tests if applicable
  7. Commit
  8. Move to next file
```

**Phase 2 (Data Model Extensions):**
```
1. Read the current database schema
2. Produce a gap analysis against section 2 of this spec (use Opus)
3. Present the gap analysis for review before generating any code
4. For each new/modified entity:
   a. Generate the database migration
   b. Generate the Dart model (freezed)
   c. Generate the API endpoint (if backend is in scope)
   d. Run flutter analyze + tests
   e. Commit
```

**Phase 3 (Access Control):**
```
1. Implement AuthProvider and TerritoryProvider
2. Write tests that verify territory scoping logic
3. Run tests -- fix until green
4. Implement API middleware with territory filters
5. Write integration tests:
   - Distributor A cannot see Distributor B's scooters
   - Workshop can only see its active service jobs
   - Customer can only see own data
   - manufacturer_admin sees everything
6. Run tests -- fix until green (use Opus to review if tests are failing in unexpected ways)
7. Implement go_router guards
8. Manually test each role's navigation
9. Commit
```

**Phase 4 (New Features):**
```
For each role (customer, workshop, distributor, manufacturer):
  For each screen:
    1. Generate the page widget
    2. Generate its providers
    3. Generate any shared widgets it needs
    4. Run flutter analyze
    5. Hot-reload and visually verify layout
    6. Check territory scoping is applied (for distributor/workshop screens)
    7. Write basic widget tests
    8. Run all tests
    9. Commit
    10. Move to next screen
```

**When things go wrong:**

- If `flutter analyze` reports errors, fix them before generating more code. Do not accumulate errors.
- If a test fails, investigate and fix before moving on. A failing test in the access control layer is a potential security issue.
- If the existing codebase has patterns that conflict with this spec (e.g. a different state management approach already in use), stop and flag it. Do not silently mix approaches.
- If a generated screen doesn't look right on hot-reload, iterate on it before moving to the next screen. UI issues compound quickly.

**Progress tracking:**

After completing each phase, update the checklist in section 12 of this spec. Mark items as complete, note any deviations from the spec, and flag any items that were deferred. This provides a clear record of what's done and what's outstanding.

### 10.3 Session Continuity -- The TODO Document

Claude Code loses all context when a session ends. To maintain continuity across sessions, keep a `TODO.md` file in the project root alongside this spec. Claude Code should update it as it works, and read it at the start of every new session.

**At the start of every session, Claude Code should:**
1. Read this spec (`APP_DEVELOPMENT_SPEC.md`) for the rules and architecture.
2. Read `TODO.md` for current state -- what's done, what's in progress, what's next.
3. Resume from where the TODO says work stopped.

**During a session, Claude Code should update TODO.md:**
- After completing each task, mark it done with a timestamp.
- If something failed or was deferred, note why.
- Before ending a session (or when things start slowing down), write a "Session handover" entry summarising exactly where things stand, what was being worked on, any issues encountered, and what should happen next.

**The TODO document should contain:**

1. **Current phase and task** -- exactly where we are in the migration plan.
2. **Completed items** -- with dates, so you can see velocity and spot stalls.
3. **In progress** -- what was being actively worked on, including any partially generated files.
4. **Blocked / needs decision** -- things that need human input before Claude Code can proceed.
5. **Known issues** -- bugs, failing tests, things that compile but aren't right.
6. **Next up** -- the immediate next tasks in priority order.
7. **Session log** -- a brief entry per session recording what was accomplished and any context the next session needs.

**When starting a new session, prompt Claude Code with:**

```
Read APP_DEVELOPMENT_SPEC.md for project architecture and rules.
Read TODO.md for current progress and session state.
Continue from where the last session left off.
Follow the incremental working method in section 10.2.
Update TODO.md as you work.
```

This keeps sessions productive from the first message rather than spending 10 minutes re-establishing context.

---

## 11. Additional Considerations

| Item | Rationale |
|------|-----------|
| **Parts catalogue and stock** | Track what workshops use and need to reorder |
| **Push notification system** | Firmware updates, service reminders, battery alerts |
| **Customer satisfaction/feedback** | Post-service rating, feeds into distributor performance |
| **Scooter transfer flow** | Formal ownership transfer with audit trail |
| **Data retention policy** | How long ride data, personal data, and events are kept (GDPR) |
| **Anonymisation pipeline** | For aggregated analytics shared with distributors, strip PII |
| **Rate limiting on searches** | Prevent distributors from bulk-exporting customer data |
| **API key/token scoping** | Ensure API tokens carry role and territory scope |
| **Offline-first for workshops** | Workshops may have poor connectivity -- cache service queue locally |
| **Multi-language support** | UK, EU, US, AU markets -- at minimum English, consider German, French etc. |
| **BLE communication** | If scooters need direct app-to-hardware pairing/communication |
| **Accessibility** | Flutter's Semantics widgets for screen reader support |

---

## 12. Checklist for Claude Code Audit

### Data model
- [ ] All entities exist: User, Distributor, Workshop, Scooter, Address, ActivityEvent, ServiceJob
- [ ] User role system supports `customer`, `distributor_staff`, `workshop_staff`, `manufacturer_admin`
- [ ] User has `home_country` and `current_country` fields
- [ ] Scooter has `country_of_registration`, `serial_number`, `firmware_version`, `status`
- [ ] ActivityEvent table exists with event_type enum and JSON payload
- [ ] ServiceJob table exists with status workflow
- [ ] Distributor has `countries` array for territory definition
- [ ] Workshop has nullable `parent_distributor` (independent workshops supported)
- [ ] Workshop has `service_area_countries`

### State management
- [ ] Riverpod is used consistently across all features
- [ ] AuthProvider exists and exposes role, territory, user ID
- [ ] TerritoryProvider derives allowed countries from AuthProvider
- [ ] All API-calling providers include territory scope
- [ ] EventQueueProvider manages local event buffer and sync
- [ ] No mixed state management approaches (no Provider, Bloc, or setState for state)

### Access control
- [ ] API middleware enforces territory scoping on all search/list endpoints
- [ ] Distributor staff can only query scooters/users within their distributor's countries
- [ ] Workshop staff can only see scooters assigned to their workshop for active service
- [ ] Customers can only see their own data
- [ ] manufacturer_admin bypasses territory filters
- [ ] Territory filter is server-side, not just UI-side
- [ ] go_router guards prevent role from accessing unpermitted routes

### Activity tracking
- [ ] Events are written as immutable records (no update/delete)
- [ ] Ride events capture start/end location, distance, duration, battery delta
- [ ] Service events capture workshop, technician, parts, timestamps
- [ ] PIN events do NOT log actual PIN values
- [ ] Events include country, distributor_id (resolved at write time)
- [ ] Local drift database queues events for batch sync
- [ ] Sync service runs on background schedule and on ride end

### Analytics
- [ ] Pure dashboard shows global metrics with drill-down
- [ ] Distributor dashboard shows territory-scoped metrics only
- [ ] Workshop dashboard shows service queue and diagnostics only
- [ ] Customer view shows own rides, scooter health, service status
- [ ] Aggregation queries do not leak individual data to wrong roles

### Navigation
- [ ] All pages from section 8 have routes defined
- [ ] Role-based navigation shows only relevant pages per role
- [ ] Search pages enforce territory filtering in both UI and API
- [ ] Deep linking works for push notification targets

### Privacy and compliance
- [ ] Personal data handling considers GDPR (EU customers)
- [ ] Data retention policy is defined and enforced
- [ ] Customer ride data is not shared at individual level with distributors
- [ ] Anonymisation is applied to aggregated analytics

### Flutter-specific
- [ ] Project structure matches section 1.3
- [ ] freezed + json_serializable used for models
- [ ] drift used for local database
- [ ] dio used for HTTP with interceptors for auth and territory headers
- [ ] go_router used for navigation with redirect guards
- [ ] Platform channels implemented for country detection on both Android and iOS
- [ ] Accessibility semantics on all interactive widgets
