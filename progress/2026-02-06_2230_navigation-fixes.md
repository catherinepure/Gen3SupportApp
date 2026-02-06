# Gen3FirmwareUpdater Navigation & Startup Fixes
**Date:** 2026-02-06 22:30
**Status:** Navigation fixes complete - Build passes

---

## Problem

After the refactoring session, the app was unusable on-device due to navigation issues:

1. **App resumed mid-flow instead of starting fresh** — Android restored the last activity from the task stack (e.g. FirmwareUpdaterActivity trying to connect to a scooter that wasn't there)
2. **Logged-in regular users routed to wrong screen** — `RegistrationChoiceActivity` sent all non-distributor logged-in users to `FirmwareUpdaterActivity`, which shows an activation code prompt (distributor-only feature) with no way out
3. **No logout option on FirmwareUpdaterActivity** — dead-end screen with no escape
4. **`isDistributor()` too strict** — only matched exact string `"distributor"`, failed if role came back differently from backend or if only `distributor_id` was set

Root cause confirmed via logcat: account `colin.ives@icloud.com` was stored with `role='user'` and `distributorId=null`, so it hit the non-distributor path and landed on the activation code dead end.

## What Was Fixed

### 1. AndroidManifest.xml
- Added `android:clearTaskOnLaunch="true"` to the launcher activity so Android always starts fresh from `RegistrationChoiceActivity` when returning to the app

### 2. SessionManager.java (`services/`)
- `isDistributor()` now does case-insensitive role check AND falls back to checking if `distributor_id` is present
- Prevents misrouting when backend returns unexpected role strings

### 3. RegistrationChoiceActivity.java — Complete rewrite of routing logic
- **Distributors**: auto-redirect to `DistributorMenuActivity` (unchanged)
- **Logged-in regular users**: now see a **user hub** instead of registration options:
  - "Welcome, [email]" message
  - "Scan for Scooter" card — launches `ScanScooterActivity` in user mode
  - Logout button — clears session and shows registration/login screen
- **Not logged in**: sees the original registration choice cards + login link
- Layout restructured into two visibility-toggled groups: `layoutNotLoggedIn` and `layoutUserHub`

### 4. activity_registration_choice.xml — Layout restructured
- `layoutNotLoggedIn` group: registration cards (Scooter Owner / Distributor) + login link
- `layoutUserHub` group: welcome text, scan scooter card, logout button
- Only one group visible at a time based on login state

### 5. FirmwareUpdaterActivity.java — Added logout escape
- New `btnLogout` button in activation code group (visible when logged in)
- `logout()` method: disconnects BLE, clears session, navigates to `RegistrationChoiceActivity`
- Prevents dead-end state

### 6. activity_firmware_updater.xml
- Added logout `MaterialButton` below the Activate button (visibility=gone by default, shown when logged in)

### 7. ScanScooterActivity.java — Supports regular users
- New `userMode` flag via intent extra `"user_mode"`
- When `userMode=true`, `distributorId` is allowed to be null (no longer exits)
- Telemetry records tagged with `"user_scan"` instead of `"distributor_scan"` in user mode

---

## Files Changed
```
AndroidManifest.xml                          — clearTaskOnLaunch
services/SessionManager.java                 — isDistributor() fallback logic
RegistrationChoiceActivity.java              — dual-mode home screen (registration vs user hub)
activity_registration_choice.xml             — layoutNotLoggedIn + layoutUserHub groups
FirmwareUpdaterActivity.java                 — logout button + logout() method
activity_firmware_updater.xml                — btnLogout in activation group
ScanScooterActivity.java                     — userMode support, nullable distributorId
```

## Build Status
- `./gradlew assembleDebug` passes successfully

## Database/API Changes
- **NONE** — purely UI/navigation changes

## What's Next
- **On-device testing** of the fixed flows:
  1. Fresh app launch → registration choice screen (not logged in)
  2. Login as distributor → auto-redirect to DistributorMenuActivity
  3. Login as regular user → user hub with scan scooter + logout
  4. Scan scooter in user mode → BLE scan without distributor ID
  5. Logout from user hub → back to registration/login screen
  6. Logout from FirmwareUpdaterActivity → back to registration/login screen
  7. Distributor full flow: menu → scan → connect → telemetry → details
  8. Firmware update flow: activate → scan → connect → verify → download → upload
- **ScanScooterActivity downstream** — verify that telemetry record creation works with null `distributorId` (the `createTelemetryRecord` call may need the Supabase column to accept null)
- **ScooterDetailsActivity** — check if it also needs `userMode` adaptation for regular users viewing scooter details after scan
