# Web Admin vs Spec Analysis — 2026-02-09

## Executive Summary

The web admin is a **partially implemented manufacturer_admin tool** with excellent architecture but only ~30% of spec requirements completed. Users page is 95% complete; all other pages are 10-25% stubs.

## Current State

**Deployed:** ives.org.uk/app2026
**Architecture:** Vanilla JS SPA, 26 modular files, clean separation of concerns
**Authentication:** Working session-based auth via Supabase Edge Functions
**Overall Spec Coverage:** **30% of Section 8.5 requirements**

## Page-by-Page Status

| Page | Spec Completeness | Status | Critical Issues |
|------|-------------------|--------|-----------------|
| Dashboard | 30% | Stub | 4 stat cards only; missing all analytics/charts |
| **Users** | **95%** | **Fully Functional** | Missing: create action, sort, bulk ops |
| Scooters | 25% | Stub | List only; no filters, search, or proper detail |
| Distributors | 20% | Stub | Raw JSON detail modal; missing all management |
| Workshops | 15% | Stub | Shows ID only; missing all fields |
| Service Jobs | 10% | **BROKEN** | **Syntax error:** `result.service-jobs` (line 9) |
| Firmware | 15% | Stub | ID only; needs version management |
| Telemetry | 15% | Stub | ID only; needs charts/analysis |
| Logs | 15% | Stub | ID only; needs log viewer |
| Events | 15% | Stub | ID only; needs timeline/filtering |
| Validation | 15% | Stub | ID only; needs validation tools |

## Spec Requirements (Section 8.5) vs Implementation

### ✅ Implemented (30%)
- Basic dashboard with stat cards
- Full user CRUD with 6 filters (search, user_level, active status, country, distributor, role)
- User detail with linked scooters & sessions
- Edit users (all fields including roles[], distributor_id, workshop_id)
- Pagination (50/page with controls)
- CSV export (users, all pages)
- Session management & authentication

### ❌ Missing Core Features (70%)

**Analytics & Dashboards (0%):**
- Global fleet overview by country/model/status with map
- Registration trends (scooters/week by country/model)
- Active user metrics (DAU/WAU/MAU, retention curves)
- Ride analytics (aggregated: total rides, avg distance/duration)
- Battery health fleet-wide distribution
- Error code analysis & trending
- Firmware rollout monitoring (% fleet per version, OTA success rates)
- Service & warranty metrics by distributor/model
- Distributor performance comparison
- Regulatory compliance dashboard

**Territory Scoping (0%):**
- Role-based data filtering (Section 4.1)
- Distributor staff should only see territory data (Section 4.2)
- Workshop staff should only see assigned scooters
- Territory provider integration (Section 1.2)

**Search & Filtering:**
- Scooters: No search, filters, or proper detail
- Service Jobs: No kanban board, status workflow
- Firmware: No version comparison, rollout planning
- Telemetry: No charts, anomaly detection
- Events: No timeline, type filtering

**Management UIs:**
- Create user (backend missing `create` action)
- Distributor admin (territory map, staff mgmt, performance metrics)
- Workshop admin (service queue, parts tracking, technician workload)
- Firmware admin (rollout planning, changelog editor, compatibility matrix)

## Critical Issues

### 🔴 P0 — Immediate Fixes

1. **Service Jobs Syntax Error** (service-jobs.js:9)
   ```javascript
   // ❌ BROKEN:
   currentData = result.service-jobs || result.data || [];

   // ✓ FIX:
   currentData = result['service-jobs'] || result.data || [];
   ```

2. **Workshops Missing Fields**
   - Currently shows only `id`
   - Should show: name, address, phone, email, parent_distributor, service_area_countries, staff_count

### 🟠 P1 — Core Functionality Gaps

3. **Territory Scoping Not Implemented** (Spec Section 4)
   - No role-based filtering at API level
   - All pages show global data regardless of user role
   - Violates spec: "Distributor staff scoped to countries in their countries list"

4. **Server-Side Filters Missing** (Users page)
   - Backend doesn't support `home_country` or `current_country` filter params
   - Backend doesn't support `roles[]` filter param
   - Workaround: Client-side filtering with `_client` prefix

5. **Create User Action Missing**
   - No `create` action in admin Edge Function `handleUsers`
   - Could wire up existing `/register-user` Edge Function

### 🟡 P2 — Feature Enhancements

6. **Dashboard Needs Analytics**
   - Add charts: user growth, scooters by country, firmware distribution
   - Add quick actions: Create User, Register Scooter, Create Service Job
   - Add recent activity feed

7. **Scooters Page Enhancement**
   - Add search by serial/status/model/owner
   - Add filters (status, model, firmware version, country)
   - Add proper detail modal with owner, service history, battery health
   - Add bulk actions

8. **Distributors Page Enhancement**
   - Proper detail modal (not raw JSON)
   - Territory map visualization
   - Performance metrics (scooters sold, active users, service jobs)
   - Staff management interface

## Architecture Strengths

✅ **Excellent Modular Design:**
- Core modules: Utils, State, API, Auth, Router (5 files)
- Reusable components: Modal, Table, Form, Filters (4 files)
- Page modules: 11 separate files, clear separation
- Entry point: app-init.js with global Pages registry

✅ **Clean API Integration:**
- Single endpoint: `/functions/v1/admin`
- Consistent format: `{ session_token, resource, action, ...params }`
- Error handling with toast notifications

✅ **Reusable UI Components:**
- TableComponent (pagination, sorting, actions, formatting)
- ModalComponent (detail view, form submission)
- FormComponent (multi-field with type-specific inputs)
- Utility formatters (date, status badge, role badge)

## Data Access Pattern (Example: Users)

```
User clicks Users → Router.navigate('users')
  ↓
UsersPage.onNavigate() → load()
  ↓
API.call('users', 'list', { limit: 50, offset: 0 })
  ↓
Edge Function /admin (resource: users, action: list)
  ↓
Returns { users: [...], total: 234 }
  ↓
Client-side filters applied (_clientCountry, _clientRole)
  ↓
TableComponent.render() with pagination + actions
  ↓
User clicks row → showUserDetail()
  ↓
API.call('users', 'get', { id })
  ↓
Returns { user, scooters, sessions }
  ↓
ModalComponent shows formatted detail
```

## Spec Requirements Breakdown

### Section 8.5: Pure Electric (Manufacturer) Pages

| Required Page | Status | Gap |
|---------------|--------|-----|
| Global Dashboard | 30% | Missing analytics, charts, map view |
| Fleet Analytics | 0% | Not implemented |
| User Analytics | 0% | Not implemented |
| Ride Analytics | 0% | Not implemented |
| Battery Health | 0% | Not implemented |
| Error Code Analysis | 0% | Not implemented |
| Firmware Rollout | 0% | Not implemented |
| Distributor Performance | 0% | Not implemented |
| Service & Warranty | 0% | Not implemented |
| Regulatory Compliance | 0% | Not implemented |
| Data Export | 20% | CSV exists but no date range filtering |
| Distributor Admin | 20% | List only, no detail/create/edit |
| Workshop Admin | 15% | List only, no management UI |
| User Admin | 95% | ✅ Nearly complete (missing create) |
| Scooter Admin | 25% | List only, no filters/search/detail |

### Section 4: Data Access Scoping

| Requirement | Status | Notes |
|-------------|--------|-------|
| Pure Electric sees all data | ✅ Yes | Currently implemented (no filtering) |
| Distributor staff scoped to territory | ❌ No | Not implemented |
| Workshop staff scoped to assigned scooters | ❌ No | Not implemented |
| Customer sees only own data | ❌ N/A | Web admin is manufacturer_admin only |
| API-level territory filters | ❌ No | Missing middleware (Section 4.2) |
| TerritoryProvider in client | ❌ N/A | Flutter concept, not applicable to web admin |

### Section 3: Activity Tracking

| Requirement | Status | Notes |
|-------------|--------|-------|
| ActivityEvent entity | ✅ Backend | Table exists (migration 004) |
| 18+ event types | ✅ Backend | Defined in spec 3.2 |
| Events page in admin | ⚠️ 15% | Shows ID only, needs timeline/filtering |
| Event ingestion API | ✅ Backend | Edge Function exists |

## Recommendations

### Phase 1: Fix Critical Issues (1-2 hours)
1. Fix Service Jobs syntax error
2. Enhance Workshops page with proper fields
3. Add missing fields to other stub pages (distributors, firmware, etc.)

### Phase 2: Core Functionality (1 week)
1. Implement territory scoping at API middleware level (Section 4.2)
2. Add server-side filters for users (home_country, current_country, roles)
3. Add "Create User" action (wire up `/register-user` or add to admin endpoint)
4. Enhance Scooters page to match Users page (search, filters, detail)
5. Enhance Distributors page (proper detail modal, staff list, addresses)

### Phase 3: Analytics & Dashboards (2 weeks)
1. Dashboard enhancements:
   - User growth chart (line graph by week/month)
   - Scooters by country (bar chart)
   - Firmware version distribution (pie chart)
   - Recent activity feed (last 10 events)
2. Fleet Analytics page with drill-down by country/model
3. Firmware Rollout tracking (% fleet per version, OTA success rates)
4. Battery Health dashboard (distribution, batch alerts)
5. Error Code Analysis (trending faults, correlation)

### Phase 4: Advanced Features (2 weeks)
1. Service Jobs kanban board (booked → in-progress → complete)
2. Real-time updates via WebSocket
3. Map visualizations (scooter locations, distributor territories)
4. Bulk operations (select multiple, bulk status change)
5. Advanced filtering UI (date ranges, multi-select)
6. Mobile responsive layout

## Testing Checklist

### Authentication & Permissions
- [ ] Login with manufacturer_admin role succeeds
- [ ] Login with non-admin role is rejected
- [ ] Session persists across page refreshes
- [ ] Logout clears session and redirects to login

### Users Page
- [ ] Search by email works
- [ ] All 6 filters work correctly (level, active, country, distributor, role)
- [ ] Pagination works (50 per page, page controls)
- [ ] Detail modal shows full user info + scooters + sessions
- [ ] Edit form updates all fields correctly
- [ ] Deactivate/Reactivate actions work
- [ ] CSV export includes filtered results

### Other Pages (After Enhancements)
- [ ] Scooters: Search, filters, detail modal work
- [ ] Distributors: Detail modal shows formatted info (not JSON)
- [ ] Workshops: All fields displayed correctly
- [ ] Service Jobs: No syntax error, list displays correctly
- [ ] Firmware: Version management UI functional
- [ ] Events: Timeline view with filtering works

### Territory Scoping (After Implementation)
- [ ] Manufacturer admin sees all data
- [ ] Distributor staff sees only territory data
- [ ] Workshop staff sees only assigned scooters
- [ ] API returns 403 for out-of-scope requests

## Conclusion

**Current State:** Well-architected foundation with 30% functionality implemented.

**Strengths:**
- Excellent modular design
- Users page fully functional (95%)
- Clean API integration
- Reusable components

**Critical Gaps:**
- 10 out of 11 pages are stubs
- Territory scoping not implemented (security concern)
- No analytics or dashboards
- Service Jobs has syntax error

**Next Steps:**
1. Fix immediate bugs (P0)
2. Implement territory scoping (P1)
3. Enhance core pages (P1)
4. Add analytics (P2)
5. Build advanced features (P3)

**Estimated Effort:**
- P0 (fixes): 2 hours
- P1 (core): 1 week
- P2 (analytics): 2 weeks
- P3 (advanced): 2 weeks
- **Total: ~5 weeks to 100% spec coverage**
