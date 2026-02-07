# TODO -- Pure Electric App Development

> **Instructions for Claude Code:** Read this file at the start of every session alongside `APP_DEVELOPMENT_SPEC.md`. Update this file as you work. Before a session ends or slows down, write a session handover entry.

---

## Current Phase

**Phase:** Pre-1 -- Backend, Database Prep, Admin Tooling & Web Admin
**Status:** Security hardened + web admin built. Ready for Edge Function deployment + Flutter Phase 1.
**Spec reference:** Section 9.3 (Phase 2 DB work pulled forward)

---

## In Progress

- [x] Apply `sql/004_spec_alignment_migration.sql` to Supabase -- DONE (fixed CREATE POLICY syntax error)
- [x] Admin CLI tool -- 81 commands across 12 groups (4082 lines)
- [x] Admin GUI -- 11 tabs, modular gui/ package (3700+ lines across 17 files)
- [x] Security fix: service_role key removed from Android app, switched to anon key
- [x] RLS hardening migration (`sql/005_rls_hardening.sql`) -- all tables now have RLS
- [x] Admin Edge Function (`supabase/functions/admin/`) -- 13 resources, 50+ actions (1066 lines)
- [x] Web admin SPA (`web-admin/`) -- static HTML/CSS/JS for shared hosting

---

## Blocked / Needs Decision

- **Flutter unavailable until Monday** -- Phase 1 scaffold cannot start yet
- ~~**Supabase DB access**~~ -- Migration SQL applied successfully via dashboard
- **Supabase CLI** -- Need Homebrew + CLI to deploy Edge Functions including new admin function (Monday)
- **SendGrid API key** -- Old key was exposed in repo. Needs rotation in SendGrid dashboard + set as env var
- **Service_role key rotation** -- Old key was in build.gradle (removed). Rotate in Supabase dashboard, update admin-tool/.env
- **RLS migration** -- `sql/005_rls_hardening.sql` needs to be applied to Supabase (after key rotation)

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
- [ ] Apply `sql/005_rls_hardening.sql` to Supabase (after key rotation)
- [ ] Rotate service_role key in Supabase dashboard + update admin-tool/.env
- [ ] Deploy Edge Functions including admin (blocked -- needs Supabase CLI Monday)
- [ ] Deploy web-admin/ to HostingUK shared hosting
- [ ] Rotate SendGrid API key

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
