# Session: Users Page Bug Fixes — Search Fields & Login Init
**Date**: 2026-02-07 (Session 2)
**Status**: Fixed

## Issues Fixed

### 1. Fresh Login Path Missing Initialization
**Symptom**: After first login, dashboard showed no stats and no pages worked. Required Cmd+Shift+R to function.

**Root Cause**: Two code paths into the app:
- **Path A (session restore)**: `app-init.js` calls `Auth.init()` → `Router.init()` → all `page.init()` → `Router.navigate('dashboard')`. Works correctly.
- **Path B (fresh login)**: `app-init.js` calls `Auth.init()` → returns null → only `setupLoginForm()`. User logs in → `handleLogin()` calls `Router.navigate('dashboard')` but **Router.init() and page.init() were never called**.

**Fix** (`03-auth.js`): Added `Router.init()` and page module initialization to `handleLogin()`.
**Fix** (`04-router.js`): Added `initialized` guard to prevent duplicate event listener binding.

### 2. CSS Global width:100% Breaking Toolbar Inputs
**Symptom**: Search input and filter dropdowns in page headers were affected by the global `input { width: 100% }` rule.

**Root Cause**: Global `input, select, textarea { width: 100% }` was intended for form contexts (login, modals) but applied to all inputs including toolbar search/filter fields.

**Fix** (`styles.css`):
- Removed `width: 100%` from global input rule
- Scoped it to `.form-group` and `.modal-body` contexts only
- Added `width: auto` to `.search-input` and `.filter-select`
- Removed broken band-aid CSS that used `display: flex !important` on inputs

### 3. Page Header Layout Pushing Search Fields Off-Screen
**Symptom**: Search fields only visible when browser window maximised. At normal sizes they were pushed off the right edge.

**Root Cause**: `.page-header` used `flex-direction: row` with `justify-content: space-between` — title on left, actions on right. At narrower widths, `flex-wrap: wrap` dropped the `.page-actions` to a second line, but the combined width exceeded the viewport and the sticky header didn't account for it.

**Fix** (`styles.css`): Changed `.page-header` to `flex-direction: column` — title stacks on top, search/filter bar below. Actions always have full width available regardless of window size.

### 4. FTP Deploy Script Password Quoting
**Symptom**: `deploy.sh` failed silently — `curl` upload returned error.

**Root Cause**: Password contains `$` character (`$eg00d`). When `.ftp-credentials` is sourced by bash, `$eg00d` is interpreted as a variable expansion, corrupting the password.

**Fix** (`.ftp-credentials`): Wrapped password value in single quotes to prevent variable expansion.

## Files Modified
- `web-admin/css/styles.css` — CSS fixes (global width, header layout, removed band-aid rules)
- `web-admin/js/03-auth.js` — Added Router/page init to login path
- `web-admin/js/04-router.js` — Added idempotent init guard
- `web-admin/js/pages/users.js` — Debug code added then removed (net zero change)
- `.ftp-credentials` — Fixed password quoting

## Debugging Approach
1. Code review identified the init gap (two code paths)
2. Added DOM state debug logging after table render
3. Console output confirmed elements were present, visible, correctly sized
4. Added red debug border to `.page-header` — revealed it was there but off-screen at normal window widths
5. Identified `flex-direction: row` + `justify-content: space-between` as the layout cause
