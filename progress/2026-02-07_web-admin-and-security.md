# Progress: Web Admin Dashboard & Security Hardening
**Date:** 2026-02-07
**Session:** 5
**Commit:** b806aea

## Summary

Four major deliverables in this session:

### 1. Security Fix — Service Role Key Removed from Android App

The `SUPABASE_SERVICE_KEY` was embedded in `app/build.gradle` and compiled into every APK. This key bypasses all Row Level Security and gives full database access. Anyone decompiling the APK could extract it.

**Changes:**
- `app/build.gradle` — Removed `SUPABASE_SERVICE_KEY` buildConfigField entirely
- `ServiceFactory.java` — Switched both initialisation points from `SUPABASE_SERVICE_KEY` to `SUPABASE_ANON_KEY`
- Verified no remaining references to service key in `app/src/`

### 2. RLS Hardening Migration — `sql/005_rls_hardening.sql`

Comprehensive Row Level Security policies so the anon key works correctly for the mobile app.

**Tables now protected (newly):**
- `users` — SELECT active, UPDATE active
- `user_sessions` — No anon access (Edge Functions only)
- `user_scooters` — SELECT all
- `scooter_telemetry` — SELECT all, INSERT
- `user_audit_log` — SELECT all, INSERT
- `password_reset_tokens` — No anon access (Edge Functions only)

**Previously protected (unchanged):**
- distributors, scooters, firmware_versions, firmware_hw_targets, firmware_uploads, telemetry_snapshots, workshops, service_jobs, activity_events, addresses

### 3. Admin Edge Function — `supabase/functions/admin/index.ts`

Single endpoint serving all admin operations. 1066 lines.

**Resources (13):**

| Resource | Actions | Notes |
|----------|---------|-------|
| users | list, get, update, deactivate, export, search | Includes linked scooters + sessions in detail |
| scooters | list, get, create, update, link-user, unlink-user, export | Detail includes owners, telemetry, jobs |
| distributors | list, get, create, update, export | Detail includes addresses, workshops, staff/scooter counts |
| workshops | list, get, create, update, export | Detail includes addresses, staff, active job count |
| firmware | list, get, create, update, deactivate, reactivate, export | Detail includes HW targets + upload stats |
| service-jobs | list, get, create, update, cancel, export | Full status transition validation |
| telemetry | list, get, health-check, export | Health check flags battery/cycles/stale data |
| logs | list, get, export | Firmware upload logs |
| events | list, get, stats, export | Activity event audit trail |
| addresses | list, get, create, update, delete | Polymorphic for distributors/workshops |
| sessions | list, cleanup | Session management |
| validation | orphaned-scooters, expired-sessions, stale-jobs, run-all | Data integrity checks |
| dashboard | stats | Summary counts for dashboard page |

**Auth:** Requires valid session token + `manufacturer_admin` role or `user_level = 'admin'`.

### 4. Web Admin SPA — `web-admin/`

Static site deployable to any shared hosting. No build step. No framework.

**Files:**
- `index.html` — Login + sidebar + 11 pages + modal + toast system
- `css/styles.css` — 475 lines, responsive design, dark sidebar, card-based layout
- `js/api.js` — 147 lines, session management via sessionStorage, anon key auth
- `js/app.js` — 808 lines, complete SPA with:
  - Dashboard with 8 stat cards
  - Paginated data tables for all entities
  - Search and filter toolbars
  - Click-through detail modals with related data
  - CSV export for all list pages
  - Validation checks with session cleanup
  - Toast notifications
  - Login/logout flow

**Deployment:** Upload entire `web-admin/` folder to HostingUK. No server-side code needed.

## Deployment Checklist

Before the web admin is live, these steps are needed (in order):

1. [ ] **Rotate service_role key** — Supabase dashboard > Settings > API > Regenerate service_role key
2. [ ] **Update admin-tool/.env** — Paste new service_role key
3. [ ] **Apply RLS migration** — Run `sql/005_rls_hardening.sql` in Supabase SQL Editor
4. [ ] **Install Supabase CLI** — `brew install supabase/tap/supabase`
5. [ ] **Deploy Edge Functions** — `supabase functions deploy admin` (and all others)
6. [ ] **Upload web-admin/** — FTP/SCP to HostingUK shared server
7. [ ] **Test Android app** — Verify all features work with anon key + RLS policies
8. [ ] **Test web admin** — Login as admin, check all 11 pages
9. [ ] **Rotate SendGrid API key** — Separate task, not blocking

## Architecture

```
                    ┌────────────────┐
                    │  Web Admin SPA │  (HostingUK shared hosting)
                    │  Static HTML/JS│
                    └───────┬────────┘
                            │ HTTPS (anon key + session_token)
                            ▼
                    ┌────────────────┐
                    │  Admin Edge Fn │  (Supabase Edge Functions)
                    │  /admin        │  Uses service_role key (server-side)
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │   Supabase DB  │  (PostgreSQL + RLS)
                    │   + Storage    │
                    └───────▲────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
     ┌────────┴───┐  ┌─────┴─────┐  ┌────┴────────┐
     │ Android App│  │ Edge Fns  │  │ Admin Tool  │
     │ (anon key) │  │ login etc │  │ (svc_role)  │
     │ Direct REST│  │ (svc_role)│  │ Python CLI  │
     └────────────┘  └───────────┘  └─────────────┘
```

## File Inventory

| File | Lines | Description |
|------|-------|-------------|
| `sql/005_rls_hardening.sql` | 200 | RLS policies for all tables |
| `supabase/functions/admin/index.ts` | 1066 | Admin API Edge Function |
| `web-admin/index.html` | 109 | SPA HTML structure |
| `web-admin/css/styles.css` | 475 | Complete stylesheet |
| `web-admin/js/api.js` | 147 | API client module |
| `web-admin/js/app.js` | 808 | Application logic |
| **Total new code** | **2805** | |

## Git

- Commit: `b806aea`
- All files pushed to `github.com/catherinepure/Gen3SupportApp`
