# TODO -- Pure Electric App Development

> **Instructions for Claude Code:** Read this file at the start of every session alongside `APP_DEVELOPMENT_SPEC.md`. Update this file as you work. Before a session ends or slows down, write a session handover entry.

---

## Current Phase

**Phase:** 1 -- Flutter Scaffold & Feature Parity
**Status:** Not started
**Spec reference:** Section 9.2

---

## In Progress

_Nothing currently in progress._

---

## Blocked / Needs Decision

_Nothing currently blocked._

---

## Completed

_No items completed yet._

---

## Known Issues

_No known issues._

---

## Next Up

### Phase 1 -- Flutter Scaffold & Feature Parity
- [ ] Create Flutter project with folder structure (spec section 1.3)
- [ ] Set up dependencies: flutter_riverpod, riverpod_annotation, riverpod_generator, go_router, dio, drift, freezed, json_serializable
- [ ] Configure build_runner for code generation
- [ ] Audit existing Java codebase -- list all model classes, Activities, API endpoints
- [ ] Convert Java models to Dart (freezed + json_serializable), one at a time:
  - [ ] _List each model here once audit is complete_
- [ ] Recreate API client layer (dio + interceptors)
- [ ] Migrate screens, one at a time:
  - [ ] _List each screen here once audit is complete_
- [ ] Implement platform channels for country detection (Android + iOS)
- [ ] Verify feature parity: Flutter app does everything the Java app does
- [ ] Test on Android
- [ ] Test on iOS

### Phase 2 -- Data Model Extensions
- [ ] Gap analysis: compare existing schema against spec section 2 (use Opus)
- [ ] Present gap analysis for review before generating code
- [ ] Add home_country and current_country to User
- [ ] Add manufacturer_admin role
- [ ] Add serial_number, firmware_version, status, country_of_registration to Scooter
- [ ] Create ServiceJob entity + API endpoints
- [ ] Create ActivityEvent entity + ingestion endpoint
- [ ] Add service_area_countries to Workshop
- [ ] Generate database migrations
- [ ] Update Dart models to match
- [ ] Run flutter analyze + tests
- [ ] Verify all entities from spec section 2 exist in DB and Dart layer

### Phase 3 -- Access Control & Territory Scoping
- [ ] Implement AuthProvider (role, territory, user ID)
- [ ] Implement TerritoryProvider (allowed countries derived from auth)
- [ ] Write territory scoping tests before implementing middleware
- [ ] Build API middleware with territory filters (spec section 4.2)
- [ ] Write integration tests:
  - [ ] Distributor A cannot see Distributor B's data
  - [ ] Workshop sees only active service jobs
  - [ ] Customer sees only own data
  - [ ] manufacturer_admin sees everything
- [ ] Set up go_router with role-based redirect guards
- [ ] Build role-switching navigation shell
- [ ] Manually test each role's navigation
- [ ] Opus review of all access control code

### Phase 4 -- New Feature Screens
- [ ] Build local event queue (drift + sync service)
- [ ] Implement ride tracking events
- [ ] Customer screens:
  - [ ] My Rides
  - [ ] Service Status
  - [ ] Alerts
  - [ ] Scooter Health view
- [ ] Workshop screens:
  - [ ] Service Queue (kanban)
  - [ ] Job Detail
  - [ ] Scooter Diagnostics
  - [ ] Parts Usage
  - [ ] Staff Workload
- [ ] Distributor screens:
  - [ ] Dashboard
  - [ ] Customer Search (territory-scoped)
  - [ ] Scooter Search (territory-scoped)
  - [ ] Fleet Analytics
  - [ ] Error Code Alerts
  - [ ] Firmware Status
  - [ ] Warranty Claims
- [ ] Manufacturer screens:
  - [ ] Global Dashboard
  - [ ] Fleet Analytics
  - [ ] User Analytics
  - [ ] Ride Analytics
  - [ ] Battery Health
  - [ ] Error Code Analysis
  - [ ] Firmware Rollout
  - [ ] Distributor Performance
  - [ ] Service & Warranty
  - [ ] Regulatory Compliance
  - [ ] Data Export
  - [ ] All admin pages
- [ ] Push notifications
- [ ] Opus review of all territory scoping on filtered screens

---

## Session Log

### Session 1 -- [DATE]
**Model used:** [Sonnet/Opus]
**Duration:** [approx]
**What was accomplished:**
- _Update this at the end of each session_

**Where we stopped:**
- _Exact file/task being worked on_

**Issues encountered:**
- _Any problems, workarounds, or decisions made_

**Next session should:**
- _Specific first action for the next session_

---

_Add new session entries above this line, most recent first._
