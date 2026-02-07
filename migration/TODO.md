# TODO -- Pure Electric App Development

> **Instructions for Claude Code:** Read this file at the start of every session alongside `APP_DEVELOPMENT_SPEC.md`. Update this file as you work. Before a session ends or slows down, write a session handover entry.

---

## Current Phase

**Phase:** Pre-1 -- Backend, Database Prep, Admin Tooling & Web Admin
**Status:** ✅ Web admin deployed and working at ives.org.uk/app2026. CORS fixes applied, admin user created. Ready for security hardening and feature enhancements.
**Spec reference:** Section 9.3 (Phase 2 DB work pulled forward)

---

## In Progress

- [x] Deploy Edge Functions with CORS fixes ✅ (deployed to Supabase)
- [x] Web admin testing and deployment ✅ (deployed to ives.org.uk/app2026)
- [x] Web admin functionality enhancements (can work on this WITHOUT admin rights - see tasks below)
  - [x] Users page enhanced with filters, deactivate button, linked scooters/sessions display
  - [ ] Users page UI bug fix: search fields disappearing after table loads (sticky positioning applied)

## Recently Completed

- [x] Web admin modular refactoring -- 26 files, ~3000 lines (was 4 files, 1379 lines)
- [x] Web admin deployment to ives.org.uk/app2026 -- WORKING
- [x] Fixed caching issues, Router scope issues, deployment bugs
- [x] Dashboard page working with stats cards
- [x] Users page fully functional (search, view, edit, export)
- [x] Users page enhanced: user level filter, active status filter, deactivate button
- [x] Users page detail modal: now shows linked scooters and recent sessions
- [x] Users page edit form: now includes roles, distributor_id, workshop_id fields
- [x] FTP deployment system: .ftp-credentials file + deploy.sh script for easy uploads
- [x] All 11 pages accessible with stub implementations
- [x] CORS fixes: All 12 Edge Functions updated to allow `apikey` header
- [x] Admin user created: `catherine.ives@pureelectric.com` with `manufacturer_admin` role
- [x] Web admin testing tools: `serve.sh` and `test-connection.html`
- [x] Apply `sql/004_spec_alignment_migration.sql` to Supabase -- DONE (fixed CREATE POLICY syntax error)
- [x] Admin CLI tool -- 81 commands across 12 groups (4082 lines)
- [x] Admin GUI -- 11 tabs, modular gui/ package (3700+ lines across 17 files)
- [x] Security fix: service_role key removed from Android app, switched to anon key
- [x] RLS hardening migration (`sql/005_rls_hardening.sql`) -- all tables now have RLS
- [x] Admin Edge Function (`supabase/functions/admin/`) -- 13 resources, 50+ actions (1066 lines)
- [x] Web admin SPA (`web-admin/`) -- static HTML/CSS/JS for shared hosting

---

## Blocked / Needs Admin Rights (Monday)

### High Priority (Security - Requires Supabase Dashboard Access)
- **Service_role key rotation** -- Old key was in build.gradle (removed). Rotate in Supabase dashboard, update admin-tool/.env
- **RLS migration** -- `sql/005_rls_hardening.sql` needs to be applied to Supabase (after key rotation)
- **SendGrid API key** -- Old key was exposed in repo. Needs rotation in SendGrid dashboard + set as env var
- **Admin password change** -- Current password `admin123` is temporary

### Medium Priority (Development - Requires Admin Rights)
- **Flutter/Homebrew/Supabase CLI installation** -- Phase 1 scaffold cannot start yet (Monday)

## Can Do NOW (No Admin Rights Required)

### Web Admin Enhancements (Local Development → Deploy to HostingUK)
**All these tasks can be done by editing local files and uploading to HostingUK:**

#### Quick Wins (High Impact, Low Effort)
- [ ] **Dashboard enhancements**: Add more stat cards (firmware versions, recent events count)
- [ ] **Dashboard charts**: Add simple CSS-based bar charts for scooters by country, users by role
- [x] **Users page filters**: Add role filter, country filter, verified status filter ✅ (user level + active status filters added)
- [ ] **Users page filters (remaining)**: Add country filter, role filter (individual)
- [ ] **Scooters page implementation**: Enhance from stub to full CRUD (like Users page)
- [ ] **Distributors page implementation**: Add detail modal, address list, staff list
- [ ] **Dark mode toggle**: Add theme switcher in sidebar footer
- [ ] **Loading states improvement**: Replace spinner with skeleton screens
- [ ] **Better error messages**: More specific error handling with retry buttons

#### Medium Tasks (Moderate Impact/Effort)
- [ ] **Service Jobs kanban board**: Visual workflow (booked → in-progress → complete)
- [ ] **Firmware version comparison**: Side-by-side diff view for versions
- [ ] **Telemetry charts**: Line charts for battery health over time (Chart.js or similar)
- [ ] **Export improvements**: Date range picker for filtered exports
- [ ] **Search improvements**: Global search in header that works across all entities
- [ ] **Keyboard shortcuts**: Add hotkeys for navigation (e.g., G+D for dashboard)
- [ ] **Breadcrumb navigation**: Show current location path
- [ ] **Recent activity feed**: Dashboard widget showing last 10 events

#### Advanced Tasks (High Impact, High Effort)
- [ ] **Map view for scooters**: Interactive map showing scooter locations (if location data available)
- [ ] **Real-time updates**: WebSocket connection for live dashboard updates
- [ ] **Bulk actions**: Select multiple items and perform actions (export, status change)
- [ ] **Advanced filtering UI**: Multi-select dropdowns, date ranges, numeric ranges
- [ ] **Mobile responsive layout**: Make web admin work on tablets/phones
- [ ] **PWA manifest**: Make web admin installable as app
- [ ] **Offline support**: Service worker for offline viewing of cached data

---

## Completed

- [x] **2026-02-06** Git repo initialised, pushed to github.com/catherinepure/Gen3SupportApp (private)
- [x] **2026-02-06** .gitignore created (Android, Python, Node, secrets, IDE files)
- [x] **2026-02-06** SendGrid API key removed from 9 files, replaced with env var references
- [x] **2026-02-06** Full database gap analysis: current schema vs spec section 2
- [x] **2026-02-06** Migration SQL generated: `sql/004_spec_alignment_migration.sql`
- [x] **2026-02-06** Complete Java codebase audit (below)

---

## Known Issues

1. **Telemetry saving broken** -- Logcat shows "Could not find the 'status' column of 'scooters'" when saving telemetry. Caused by an RLS policy or trigger referencing `scooters.status` which doesn't exist. Fixed by Part 1 of `004_spec_alignment_migration.sql`.
2. **Password hashing is SHA-256** -- Not production-grade. Should migrate to bcrypt/argon2. Low priority but flagged.
3. **Dual telemetry table confusion** -- `scooter_telemetry` has two different schemas in the SQL files (user-focused vs distributor-focused). The Java app uses the distributor-focused version. Needs cleanup.

---

## Java Codebase Audit (for Phase 1 migration)

### Models to port (11 classes)
- [ ] `FirmwareVersion.java` -- Firmware metadata from Supabase
- [ ] `VersionInfo.java` -- Parsed 0xB0 BLE packet (device version, 2 formats: 25-byte + 32-byte with SN)
- [ ] `BMSDataInfo.java` -- Parsed 0xA1 BLE packet (battery health metrics)
- [ ] `RunningDataInfo.java` -- Parsed 0xA0 BLE packet (real-time telemetry)
- [ ] `ConfigInfo.java` -- Parsed 0x01 BLE packet (scooter config/settings)
- [ ] `DistributorInfo.java` -- Distributor record from Supabase
- [ ] `UserInfo.java` -- User record from Supabase
- [ ] `TelemetryRecord.java` -- Telemetry/scan record from Supabase
- [ ] `UploadRecord.java` -- Firmware upload record from Supabase
- [ ] `ScooterRegistrationInfo.java` -- Scooter registration status (owner info)
- [ ] `UpdateHistoryAdapter.java` -- RecyclerView adapter (becomes Flutter widget)

### Services/Repositories to port (8 classes)
- [ ] `SupabaseBaseRepository.java` -- Abstract base (HTTP infrastructure) -> dio interceptors
- [ ] `SupabaseDistributorRepository.java` -- Distributor API operations
- [ ] `SupabaseScooterRepository.java` -- Scooter lookup/create/registration status
- [ ] `SupabaseFirmwareRepository.java` -- Firmware versions, download, upload records
- [ ] `SupabaseTelemetryRepository.java` -- Telemetry create/fetch
- [ ] `SupabaseUserRepository.java` -- User search/CRUD/audit log
- [ ] `AuthClient.java` -- Edge Function auth client (7 endpoints)
- [ ] `SessionManager.java` -- SharedPreferences session wrapper

### Activities/Screens to port (10 screens)
- [ ] `RegistrationChoiceActivity.java` -- Entry point (dual mode: registration vs user hub)
- [ ] `LoginActivity.java` -- Email/password login
- [ ] `RegisterActivity.java` -- User self-registration
- [ ] `RegisterDistributorActivity.java` -- Distributor registration
- [ ] `RegisterUserActivity.java` -- Distributor-initiated user registration
- [ ] `DistributorMenuActivity.java` -- Distributor navigation menu
- [ ] `FirmwareUpdaterActivity.java` -- State machine: activation->scan->connect->verify->download->upload
- [ ] `ScanScooterActivity.java` -- BLE scan and telemetry capture
- [ ] `ScooterDetailsActivity.java` -- Scooter info, telemetry history display
- [ ] `UserManagementActivity.java` + `UserDetailActivity.java` -- User search and detail

### BLE / Hardware layer (4 classes -- complex, needs Flutter BLE plugin)
- [ ] `BLEManager.java` -- BLE scan/connect/MTU/read/write (flutter_blue_plus)
- [ ] `ScooterConnectionService.java` -- High-level BLE orchestration (0xA0/0xA1/0xB0 requests)
- [ ] `FirmwareUploader.java` -- D0->D1->D2->D3 firmware upload protocol with CRC16
- [ ] `ProtocolUtils.java` -- CRC16 MODBUS, hex formatting

### Utilities (4 classes)
- [ ] `BLEListener.java` -- BLE callback interface
- [ ] `PacketRouter.java` -- BLE packet type routing
- [ ] `PermissionHelper.java` -- Runtime permission handling
- [ ] `VersionRequestHelper.java` -- 0xB0 packet request helper
- [ ] `ServiceFactory.java` -- Singleton factory -> Riverpod providers
- [ ] `UserListAdapter.java` -- RecyclerView adapter -> Flutter widget

### Layout XMLs (14 files) -> Flutter page widgets
- [ ] `activity_registration_choice.xml`
- [ ] `activity_login.xml`
- [ ] `activity_register.xml`
- [ ] `activity_register_distributor.xml`
- [ ] `activity_register_user.xml`
- [ ] `activity_distributor_menu.xml`
- [ ] `activity_firmware_updater.xml`
- [ ] `activity_scan_scooter.xml`
- [ ] `activity_scooter_details.xml`
- [ ] `activity_scooter_selection.xml`
- [ ] `activity_user_management.xml`
- [ ] `activity_user_detail.xml`
- [ ] `item_update_history.xml` (list item)
- [ ] `item_user.xml` (list item)

### API Endpoints (for dio client)

**Edge Functions (7):**
- POST `/register` -- User registration
- POST `/login` -- Authentication
- POST `/validate-session` -- Session validation
- POST `/resend-verification` -- Email verification resend
- POST `/logout` -- Session termination
- POST `/register-user` -- Distributor-initiated registration
- POST `/register-distributor` -- Distributor business registration

**Supabase REST (15+ routes):**
- GET/POST `/scooters` -- Lookup, create
- GET `/distributors` -- Validate activation code, get by ID
- GET `/firmware_versions` -- Latest/all for hardware version
- GET `/firmware_hw_targets` -- Multi-HW version lookup
- POST/PATCH `/firmware_uploads` -- Upload record lifecycle
- POST/GET `/scooter_telemetry` -- Telemetry create/history
- GET/PATCH `/users` -- Search, get, update
- GET `/user_scooters` -- Registration status, user's scooters
- POST/GET `/user_audit_log` -- Audit trail
- GET `/storage/v1/object/public/firmware/{path}` -- Binary download

---

## Next Up

### Pre-Phase 1 (this weekend, no Flutter needed)
- [x] Run `sql/004_spec_alignment_migration.sql` on Supabase
- [ ] Verify telemetry saving works after schema fix (on-device test)
- [x] Build new Supabase Edge Functions for new entities:
  - [x] Workshop CRUD (`supabase/functions/workshops/index.ts`)
  - [x] ServiceJob CRUD (`supabase/functions/service-jobs/index.ts`)
  - [x] ActivityEvent ingestion (`supabase/functions/activity-events/index.ts`)
- [x] Update admin tool to manage workshops and territory assignments
- [x] Update existing Edge Functions to return new schema fields (login, validate-session, register, register-user)
- [x] Admin CLI expanded to 81 commands: users, scooters, firmware, telemetry, logs, service-jobs, events, workshops, distributors, addresses, validation, setup
- [x] Admin GUI refactored into modular gui/ package with 11 tabs matching all CLI features
- [x] Security: service_role key removed from Android app build.gradle
- [x] RLS hardening migration written (`sql/005_rls_hardening.sql`)
- [x] Admin Edge Function built (`supabase/functions/admin/index.ts`) -- 13 resources, 50+ actions
- [x] Web admin SPA built (`web-admin/`) -- static site for shared hosting deployment
- [x] CORS fixes applied to all 12 Edge Functions
- [x] Admin user created (`catherine.ives@pureelectric.com`)
- [x] Web admin testing infrastructure (`serve.sh`, `test-connection.html`)
- [ ] Deploy Edge Functions with CORS fixes (blocked -- needs Supabase CLI Monday or manual dashboard)
- [ ] Test web admin login and basic functionality
- [ ] Apply `sql/005_rls_hardening.sql` to Supabase (after key rotation)
- [ ] Rotate service_role key in Supabase dashboard + update admin-tool/.env
- [ ] Rotate SendGrid API key
- [ ] Change admin password from `admin123`
- [ ] Deploy web-admin/ to HostingUK shared hosting

### Web Admin Enhancement Tasks (after basic functionality working)
**Goal:** Increase usefulness and functionality of each page in the web admin

#### Dashboard Page Enhancements
- [ ] Add real-time metric cards: Total Users, Active Scooters, Pending Service Jobs, Recent Events
- [ ] Add charts/graphs: User growth over time, scooter registrations by country, service job status breakdown
- [ ] Add quick actions: "Create User", "Register Scooter", "Create Service Job"
- [ ] Add recent activity feed: Last 10 events (logins, registrations, service updates)
- [ ] Add system health indicators: Edge Function status, database connection, storage usage

#### Users Page Enhancements
- [ ] Add advanced filters: by role, country, verified status, active status, distributor, workshop
- [ ] Add bulk actions: Export selected, bulk deactivate, bulk verify
- [ ] Add inline editing: Edit name, role, country without opening modal
- [ ] Add user activity timeline in detail modal: Recent logins, scooters owned, service jobs
- [ ] Add linked entities view: Show user's scooters, sessions, audit log in tabs
- [ ] Add password reset functionality
- [ ] Add user impersonation (for support)

#### Scooters Page Enhancements
- [ ] Add map view: Show scooter locations on interactive map (if location data available)
- [ ] Add advanced filters: by status, model, firmware version, country, owner, last seen date
- [ ] Add bulk actions: Export selected, bulk status change, bulk firmware update
- [ ] Add scooter health indicators: Battery health, error codes, last telemetry
- [ ] Add service history timeline in detail modal
- [ ] Add firmware update trigger from detail modal
- [ ] Add telemetry chart: Battery voltage, temperature over time
- [ ] Add ownership transfer workflow

#### Distributors Page Enhancements
- [ ] Add territory map: Visual representation of distributor coverage
- [ ] Add performance metrics per distributor: Scooters sold, active users, service jobs
- [ ] Add staff management inline: Add/remove staff without separate page
- [ ] Add address management: Multiple addresses with primary flag
- [ ] Add workshop assignment interface
- [ ] Add country coverage heatmap
- [ ] Add distributor comparison view: Side-by-side metrics

#### Workshops Page Enhancements
- [ ] Add service queue kanban board: Columns for booked/in-progress/awaiting-parts/ready/completed
- [ ] Add technician assignment interface
- [ ] Add parts inventory tracking
- [ ] Add service job creation form
- [ ] Add workshop performance metrics: Average turnaround time, jobs completed, parts used
- [ ] Add capacity planning: Jobs per technician, current workload
- [ ] Add linked distributor info and quick navigation

#### Service Jobs Page Enhancements
- [ ] Add kanban board view (alternative to table)
- [ ] Add timeline view: Service job lifecycle visualization
- [ ] Add technician assignment and reassignment
- [ ] Add parts used tracking with inventory impact
- [ ] Add customer communication log
- [ ] Add status transition workflow with validation
- [ ] Add estimated completion date calculator
- [ ] Add job priority flagging
- [ ] Add photo upload for diagnostics

#### Firmware Page Enhancements
- [ ] Add firmware version comparison: Diff between versions
- [ ] Add rollout planning: Target percentage of fleet, geographic rollout
- [ ] Add rollout monitoring: Success/failure rates, device compatibility
- [ ] Add rollback functionality
- [ ] Add changelog editor
- [ ] Add hardware target compatibility matrix
- [ ] Add binary file integrity verification (checksum display)
- [ ] Add deployment schedule planning

#### Telemetry Page Enhancements
- [ ] Add real-time telemetry stream (if WebSocket available)
- [ ] Add telemetry charts: Battery health distribution, temperature ranges, error frequency
- [ ] Add anomaly detection alerts: Battery degradation, unusual patterns
- [ ] Add geographic heatmap: Scooter usage by location
- [ ] Add time-series analysis: Usage patterns over time
- [ ] Add export with custom date ranges and filters
- [ ] Add health score calculator: Aggregate metric per scooter

#### Upload Logs Page Enhancements
- [ ] Add log viewer with syntax highlighting
- [ ] Add log filtering: by level (error/warning/info), by scooter, by date
- [ ] Add log search with regex support
- [ ] Add error pattern detection
- [ ] Add log aggregation: Common errors, frequency analysis
- [ ] Add download logs functionality
- [ ] Add log retention policy management

#### Events (Activity) Page Enhancements
- [ ] Add event timeline visualization
- [ ] Add event type filtering with checkboxes
- [ ] Add user journey reconstruction: All events for a specific user
- [ ] Add scooter lifecycle view: All events for a specific scooter
- [ ] Add audit trail export for compliance
- [ ] Add event correlation: Related events grouped together
- [ ] Add real-time event stream (WebSocket)
- [ ] Add event statistics: Most common events, event frequency charts

#### Validation Page Enhancements
- [ ] Add automated scheduled validation runs
- [ ] Add validation history: Past runs and results
- [ ] Add one-click fix actions: Cleanup orphaned records, expire sessions
- [ ] Add validation rule configuration
- [ ] Add data quality dashboard: Completeness, consistency metrics
- [ ] Add email alerts for validation failures
- [ ] Add custom validation rule builder

#### Settings Page (New)
- [ ] Add user preferences: Theme (light/dark), language, timezone
- [ ] Add notification preferences: Email alerts, in-app notifications
- [ ] Add API key management: View/regenerate API keys
- [ ] Add session management: View active sessions, force logout
- [ ] Add audit log export settings
- [ ] Add data retention policy configuration
- [ ] Add system configuration: Feature flags, maintenance mode

#### General UI/UX Enhancements
- [ ] Add keyboard shortcuts: Navigation, quick actions, search
- [ ] Add dark mode toggle
- [ ] Add responsive mobile layout (currently desktop-only)
- [ ] Add accessibility improvements: ARIA labels, keyboard navigation, screen reader support
- [ ] Add loading skeletons instead of spinners
- [ ] Add optimistic UI updates: Immediate feedback before server response
- [ ] Add undo functionality for destructive actions
- [ ] Add context menu (right-click) for quick actions
- [ ] Add drag-and-drop for file uploads
- [ ] Add multi-language support (i18n)
- [ ] Add help tooltips and onboarding tour
- [ ] Add notification system: Toast messages, alerts, in-app notifications
- [ ] Add global search: Search across all entities from header
- [ ] Add breadcrumb navigation
- [ ] Add favorites/bookmarks: Pin frequently accessed items

#### Performance & Technical Enhancements
- [ ] Add client-side caching: Reduce API calls, cache responses
- [ ] Add pagination virtualization: Render only visible rows for large lists
- [ ] Add lazy loading: Load images and data on scroll
- [ ] Add service worker: Offline support, background sync
- [ ] Add PWA manifest: Install as app on mobile/desktop
- [ ] Add request debouncing: Reduce API calls during typing
- [ ] Add error boundary: Graceful error handling and recovery
- [ ] Add request retry logic: Automatic retry for failed requests
- [ ] Add WebSocket support: Real-time updates without polling
- [ ] Add state persistence: Remember filters, sort order, page position

#### Security & Compliance Enhancements
- [ ] Add two-factor authentication setup
- [ ] Add session timeout warning
- [ ] Add activity audit log: Track all admin actions
- [ ] Add role-based UI hiding: Hide features not available to current role
- [ ] Add permission management UI
- [ ] Add GDPR compliance tools: Data export, data deletion, consent management
- [ ] Add rate limiting indicators: Show remaining API calls
- [ ] Add IP whitelist management
- [ ] Add password strength requirements display
- [ ] Add login history view: Recent logins, suspicious activity detection

### Phase 1 -- Flutter Scaffold & Feature Parity (Monday+)
- [ ] Create Flutter project with folder structure (spec section 1.3)
- [ ] Set up dependencies: flutter_riverpod, riverpod_annotation, riverpod_generator, go_router, dio, drift, freezed, json_serializable
- [ ] Configure build_runner for code generation
- [ ] Convert models to Dart (freezed + json_serializable) -- see audit list above
- [ ] Recreate API client layer (dio + interceptors)
- [ ] Migrate screens -- see audit list above
- [ ] Implement platform channels for country detection (Android + iOS)
- [ ] Verify feature parity
- [ ] Test on Android and iOS

### Phase 2 -- Data Model Extensions
- [x] Gap analysis complete
- [x] Migration SQL generated
- [ ] Apply migrations (blocked on DB access)
- [ ] Update Dart models to match new schema
- [ ] Run flutter analyze + tests
- [ ] Verify all entities from spec section 2 exist in DB and Dart layer

### Phase 3 -- Access Control & Territory Scoping
_(unchanged from spec)_

### Phase 4 -- New Feature Screens
_(unchanged from spec)_

---

## Session Log

### Session 7 -- 2026-02-07 (Continued Session)
**Model used:** Sonnet 4.5
**What was accomplished:**
- **Complete modular refactoring** of web admin:
  - Split monolithic 808-line `app.js` into 26 focused files
  - Created core modules: utils, state, API, auth, router (5 files)
  - Created reusable components: modal, table, form, filters (4 files)
  - Created 11 page modules: dashboard, users, scooters, distributors, workshops, service-jobs, firmware, telemetry, logs, events, validation
  - Total transformation: 4 files → 26 files, 1379 lines → ~3000 lines
- **Deployment to HostingUK** (ives.org.uk/app2026):
  - Fixed ServiceJobsPage typo (uppercase 'J')
  - Resolved aggressive browser caching (renamed main.js → app-init.js)
  - Fixed Router scope issue (`const Pages` → `window.Pages`)
  - Successfully deployed and verified working
- **Dashboard**: Fully functional with stats cards
- **Users page**: Fully implemented (search, list, detail, edit, export)
- **All other pages**: Basic stub implementations ready for enhancement
- Created `REFACTORING_COMPLETE.md` documentation
- Created progress document: `progress/2026-02-07_refactored-deployment-success.md`

**Where we stopped:**
- ✅ Web admin deployed and working at ives.org.uk/app2026
- ✅ Login/authentication working (session persists across refreshes)
- ✅ Dashboard showing stats
- ✅ Users page fully functional
- ✅ All 11 pages accessible
- 🔨 9 pages are stubs ready for enhancement (scooters, distributors, etc.)
- 📋 150+ enhancement tasks identified and prioritized
- 📋 Separated tasks into "needs admin rights" vs "can do now"

**Issues encountered:**
- Server caching was extremely aggressive (solution: renamed file entirely)
- Browser sessionStorage clears on browser close (by design for security)
- `window.Pages` scope issue prevented Router from accessing page registry

**Next session should:**
1. Pick enhancement tasks that don't require admin rights (see "Can Do NOW" section)
2. Suggested priorities:
   - Scooters page enhancement (full CRUD like Users)
   - Dashboard charts/widgets
   - Distributors page detail modal
   - Service Jobs kanban board
   - Dark mode toggle
3. Security tasks wait for Monday (requires Supabase dashboard access)
4. Flutter Phase 1 waits for Monday (requires admin rights to install Flutter)

### Session 6 -- 2026-02-07
**Model used:** Sonnet 4.5
**What was accomplished:**
- **CORS fixes** applied to all 12 Edge Functions:
  - Updated `Access-Control-Allow-Headers` to include `apikey` in addition to `Content-Type, Authorization`
  - Fixed login, logout, register, register-user, register-distributor, validate-session, verify, resend-verification, service-jobs, workshops, activity-events
  - Admin Edge Function already had correct CORS headers
  - Fixes need deployment via Supabase CLI or manual dashboard
- **Admin user created**:
  - Created `admin@pure.com` with password `admin123` and `manufacturer_admin` role
  - Updated email to `catherine.ives@pureelectric.com` per user request
  - Verified login works via curl: `{"success":true,"session_token":"...","user":{"email":"catherine.ives@pureelectric.com","role":"admin","roles":["manufacturer_admin"],...}}`
- **Web admin testing infrastructure**:
  - Created `web-admin/serve.sh` for easy local server launch
  - Created `web-admin/test-connection.html` diagnostic tool for testing endpoints
  - Diagnosed "Failed to fetch" issue: CORS preflight blocking `apikey` header
- **Documentation**:
  - Created `DEPLOY_EDGE_FUNCTIONS.md` with deployment guide (CLI + manual options)
  - Created detailed progress doc: `progress/2026-02-07_web-admin-cors-fixes.md`
  - Updated TODO with 150+ web admin enhancement tasks across all pages
- Committed and pushed as 74fdebc

**Where we stopped:**
- CORS fixes applied locally but NOT deployed to Supabase yet
- Web admin cannot be tested until Edge Functions redeployed
- Admin user exists and credentials verified
- Comprehensive enhancement roadmap created for web admin

**Issues encountered:**
- Web admin "Failed to fetch" due to CORS - diagnosed and fixed (pending deployment)
- Admin tool `user get` command has bug with UUID filtering - worked around with direct SQL

**Next session should:**
1. Deploy Edge Functions (manually via dashboard or wait for Monday CLI)
2. Test web admin login at http://localhost:8000
3. Verify all 11 pages load and basic CRUD works
4. Begin web admin enhancements (prioritize dashboard, users, scooters pages)
5. Apply RLS migration + rotate keys if time permits
6. Deploy to HostingUK once tested

### Session 5 -- 2026-02-07
**Model used:** Opus
**What was accomplished:**
- **Security fix**: Removed `SUPABASE_SERVICE_KEY` from Android app `build.gradle`
  - Switched `ServiceFactory.java` to use `SUPABASE_ANON_KEY` for all direct DB calls
  - Service_role key no longer shipped in APK (was a critical vulnerability)
- **RLS hardening migration** (`sql/005_rls_hardening.sql`):
  - Enabled RLS on 6 previously unprotected tables: users, user_sessions, user_scooters, scooter_telemetry, user_audit_log, password_reset_tokens
  - Added anon policies matching exactly what the Android app's repositories need
  - Ensured Edge Functions still work via service_role (server-side only)
- **Admin Edge Function** (`supabase/functions/admin/index.ts` — 1066 lines):
  - Single endpoint with 13 resources: users, scooters, distributors, workshops, firmware, service-jobs, telemetry, logs, events, addresses, sessions, validation, dashboard
  - 50+ actions covering all CLI/GUI features
  - Admin-only auth via existing session token system
  - Full territory scoping, status transitions, export support
- **Web admin SPA** (`web-admin/` — 4 files, 2805 lines):
  - `index.html` — Login screen + sidebar navigation + 11 pages
  - `css/styles.css` — Complete design system (cards, tables, badges, modals, toasts)
  - `js/api.js` — API client using anon key + session tokens
  - `js/app.js` — Full SPA with dashboard stats, paginated lists, detail modals, CSV export, validation checks
  - Pure vanilla JS — no build step, no framework dependencies
  - Deployable to any static hosting (HostingUK shared server)
- Committed and pushed as b806aea

**Where we stopped:**
- All code written and committed
- Pending deployment: RLS migration, key rotation, Edge Functions, web hosting

**Issues encountered:**
- None — all JS syntax verified, Android service_key references cleaned

**Next session should:**
1. Rotate service_role key in Supabase dashboard
2. Update admin-tool/.env with new key
3. Apply `sql/005_rls_hardening.sql` to Supabase
4. Install Supabase CLI + deploy all Edge Functions (including admin)
5. Upload web-admin/ to HostingUK
6. Test login + all pages on web admin
7. On-device test: verify Android app still works with anon key

### Session 4 -- 2026-02-07
**Model used:** Opus
**What was accomplished:**
- Expanded admin CLI (`admin-tool/admin.py`) to 81 commands across 12 groups (4082 lines):
  - Service-jobs: list, get, create, update, cancel, export
  - Activity events: list, types, stats, get, export
  - User enhancements: sessions, logout, force-verify, export, deactivate-inactive
  - Workshop enhancements: get detail, edit, reactivate
  - Distributor enhancements: get detail, add-address
  - Validation utilities: orphaned-scooters, expired-sessions, stale-jobs
  - Firmware: get, edit, reactivate
  - Scooter: link-user, unlink-user, set-primary, set-status, report-stolen, decommission, export
  - Telemetry: get, export, health-check
  - Logs: get, by-scooter, by-firmware, export
  - Address group: list, add, update, delete
- Refactored admin GUI (`admin_gui.py`) from monolithic 1665-line file into modular `gui/` package:
  - 17 files, 3700+ lines total
  - 11 tabs: Users, Scooters, Distributors, Workshops, Service Jobs, Firmware, Telemetry, Upload Logs, Events, Validation, Settings
  - Reusable components: DetailDialog, FormDialog, helpers (threading, CSV export, FK resolution)
  - Every CLI feature accessible through desktop GUI
  - NEW tabs: Users (search/edit/detail/export), Workshops, Service Jobs, Events, Validation
  - Enhanced: Scooters (search/status/link-user/export), Distributors (detail with addresses/staff), Firmware (detail/reactivate), Telemetry (health-check/export), Logs (detail/by-scooter/export)
- Discussed web admin tool options — deferred pending potential Azure database migration

**Where we stopped:**
- All admin tooling complete (CLI + GUI at feature parity)
- Ready for Edge Function deployment and Flutter Phase 1

**Issues encountered:**
- None — all code compiles and imports verified

**Next session should:**
1. Install Homebrew + Supabase CLI
2. Deploy all Edge Functions
3. On-device test: verify telemetry with scooters.status column
4. Rotate SendGrid API key
5. Start Phase 1 Flutter scaffold

### Session 3 -- 2026-02-07
**Model used:** Opus
**What was accomplished:**
- Added comprehensive user commands to admin CLI: search, list, get (detail with linked scooters), edit (all fields), scooters
- Enhanced scooter CLI commands: search, get (detail with owners + service jobs), edit, owner, list with filters
- Committed and pushed (cd162a0)

**Where we stopped:**
- User and scooter admin features implemented in CLI
- Discussion about web admin tool vs Python GUI — user decided to defer web dashboard

### Session 2 -- 2026-02-06 (continued)
**Model used:** Opus
**What was accomplished:**
- Applied `sql/004_spec_alignment_migration.sql` to Supabase (fixed CREATE POLICY IF NOT EXISTS syntax error)
- Built 3 new Edge Functions: workshops CRUD, service-jobs lifecycle, activity-events ingestion/query
- Updated 4 existing Edge Functions to return/accept new schema fields (roles[], home_country, current_country, workshop_id)
- Extended admin tool with workshop management + distributor territory commands
- Verified Android app still builds (`./gradlew assembleDebug` passes)
- Full Java codebase audit: 43 files, 14 layouts, 22+ endpoints catalogued
- Wrote progress doc: `progress/2026-02-06_2345_backend-prep-complete.md`

**Where we stopped:**
- All pre-Flutter backend work complete
- Edge Functions written but NOT deployed (no Supabase CLI)
- Changes committed but need final push

**Issues encountered:**
- `CREATE POLICY IF NOT EXISTS` not valid PostgreSQL -- wrapped in DO/EXCEPTION blocks
- No Supabase CLI or Homebrew (no admin rights until Monday)

**Next session should:**
1. Install Homebrew + Supabase CLI
2. Deploy all Edge Functions: `supabase functions deploy`
3. On-device test: verify telemetry saving works with `scooters.status` column
4. Rotate SendGrid API key
5. Start Phase 1 Flutter scaffold (if Flutter SDK available)

### Session 1 -- 2026-02-06
**Model used:** Opus
**What was accomplished:**
- Initialised git repo, created .gitignore, pushed to GitHub (private)
- Removed hardcoded SendGrid API key from 9 files across the codebase
- Read migration spec (APP_DEVELOPMENT_SPEC.md) and TODO.md
- Performed full database gap analysis (current schema vs spec section 2)
- Generated comprehensive migration SQL: `sql/004_spec_alignment_migration.sql`
  - Part 1: scooters.status (fixes telemetry blocker)
  - Part 2: scooters + firmware_version, country_of_registration, pin_hash, registration_date
  - Part 3: users + home_country, current_country, date_of_birth, roles[]
  - Part 4: distributors + countries[], phone, email
  - Part 5: addresses table (new)
  - Part 6: workshops table (new)
  - Part 7: service_jobs table (new)
  - Part 8: activity_events table (new)
  - Part 9: RLS policies for new tables
  - Part 10: resolve_distributor_for_country() helper function
- Complete Java codebase audit: 43 Java files, 14 layouts, 22+ API endpoints catalogued
- Updated this TODO.md with full audit results

**Where we stopped:**
- Migration SQL written but NOT yet applied to Supabase
- Need DB access to run the migration

**Issues encountered:**
- GitHub push protection caught SendGrid key in 9 files (fixed)
- No Homebrew/gh CLI available (no admin rights until Monday)
- Dual telemetry table schemas in SQL files need cleanup

**Next session should:**
1. Apply `sql/004_spec_alignment_migration.sql` to Supabase
2. Test on-device that telemetry saving works after `scooters.status` is added
3. Start building Edge Functions for Workshop, ServiceJob, ActivityEvent
4. Or if Flutter is available, start Phase 1 scaffold

---

_Add new session entries above this line, most recent first._
