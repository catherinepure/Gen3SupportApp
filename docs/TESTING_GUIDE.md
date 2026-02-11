# Android App Testing Guide
**Date:** 2026-02-10
**Purpose:** Step-by-step guide to test authentication updates

---

## Prerequisites

- Android Studio installed
- Android device or emulator connected
- Test accounts created in database with different roles

---

## Test Accounts Needed

Create these test accounts via web-admin before testing:

1. **Admin Account**
   - Email: `test-admin@example.com`
   - user_level: `admin`
   - Has distributor_id: Optional

2. **Manager Account**
   - Email: `test-manager@example.com`
   - user_level: `manager`
   - Has distributor_id: Yes (required)

3. **Normal User Account**
   - Email: `test-user@example.com`
   - user_level: `normal`
   - Has distributor_id: No

---

## Building the App

### Option 1: Android Studio (Recommended)
1. Open Android Studio
2. Open project: `/Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater`
3. Wait for Gradle sync to complete
4. Click "Build" → "Build Bundle(s) / APK(s)" → "Build APK(s)"
5. Click "Run" (green play button) to install on device/emulator

### Option 2: Command Line
```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater

# Build debug APK
./gradlew assembleDebug

# Install on connected device
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Launch app
adb shell am start -n com.pure.gen3firmwareupdater/.RegistrationChoiceActivity
```

---

## Test Suite

### TEST 1: Admin Login ✓

**Purpose:** Verify admin role works correctly

**Steps:**
1. Launch app
2. Click "Login" (bottom of screen)
3. Enter admin credentials:
   - Email: `test-admin@example.com`
   - Password: `[your-password]`
4. Click "Login"

**Expected Results:**
- ✅ Login successful toast message
- ✅ Navigates to **DistributorMenuActivity** (menu with multiple options)
- ✅ Can access all distributor features

**Debug if Failed:**
- Check Logcat for errors: `adb logcat | grep -i "auth\|login\|session"`
- Verify user exists in database with `user_level='admin'`
- Check SessionManager.isDistributor() returns true

---

### TEST 2: Manager Login ✓

**Purpose:** Verify manager role works correctly

**Steps:**
1. Logout (if logged in)
2. Click "Login"
3. Enter manager credentials:
   - Email: `test-manager@example.com`
   - Password: `[your-password]`
4. Click "Login"

**Expected Results:**
- ✅ Login successful
- ✅ Navigates to **DistributorMenuActivity**
- ✅ Can access distributor features
- ✅ Territory-scoped (only sees own territory's data)

**Debug if Failed:**
- Verify user has `user_level='manager'` in database
- Verify user has `distributor_id` set (not null)
- Check SessionManager logs

---

### TEST 3: Normal User Login ✓

**Purpose:** Verify normal users cannot access distributor features

**Steps:**
1. Logout
2. Click "Login"
3. Enter normal user credentials:
   - Email: `test-user@example.com`
   - Password: `[your-password]`
4. Click "Login"

**Expected Results:**
- ✅ Login successful
- ✅ Does NOT navigate to DistributorMenuActivity
- ✅ Shows appropriate screen for end users (or stays at login)
- ✅ SessionManager.isDistributor() returns false

**Debug if Failed:**
- Verify user has `user_level='normal'` in database
- Verify user has `distributor_id=null`
- Check RegistrationChoiceActivity logic

---

### TEST 4: View User Profile (Role Display) ✓

**Purpose:** Verify role names display correctly

**Steps:**
1. Login as admin or manager
2. Navigate to "User Management"
3. Search for a user (any user)
4. Click on the user to view details

**Expected Results:**
- ✅ User's role displays correctly:
  - If `user_level='admin'` → Shows "Admin"
  - If `user_level='manager'` → Shows "Manager"
  - If `user_level='normal'` → Shows "Normal"

**Debug if Failed:**
- Check UserInfo.getUserLevelDisplay() method
- Verify user data loaded correctly
- Check TextView displaying role

---

### TEST 5: Edit User Role ✓

**Purpose:** Verify role dropdown shows correct options

**Steps:**
1. Login as admin
2. Navigate to "User Management"
3. Select a user with `user_level='normal'`
4. Click "Edit" button
5. Observe the "User Level" dropdown

**Expected Results:**
- ✅ Dropdown shows three options: "Normal", "Manager", "Admin"
- ✅ Current selection matches user's role
- ✅ Can select different role

**Steps to Test Saving:**
6. Change role from "Normal" to "Manager"
7. Click "Save"
8. Reload user details

**Expected Results:**
- ✅ Save successful toast
- ✅ User role updated in database
- ✅ Displays "Manager" when viewing user again
- ✅ Audit trail shows role change

**Debug if Failed:**
- Check UserDetailActivity.USER_LEVELS array
- Verify spinner selection logic
- Check saveChanges() method
- Verify database update query

---

### TEST 6: Distributor Registration Screen ✓

**Purpose:** Verify activation code removal

**Steps:**
1. Logout
2. From RegistrationChoiceActivity, click "Register as Distributor/Staff"

**Expected Results:**
- ✅ Shows informational screen (not a form)
- ✅ Message: "Staff accounts are now created by your administrator"
- ✅ Instructions about contacting admin
- ✅ "Back to Login" button works
- ✅ NO activation code input field

**Debug if Failed:**
- Check RegisterDistributorActivity.java
- Check activity_register_distributor.xml layout

---

### TEST 7: Session Persistence ✓

**Purpose:** Verify session persists across app restarts

**Steps:**
1. Login as admin or manager
2. Close app (swipe away from recent apps)
3. Reopen app

**Expected Results:**
- ✅ Stays logged in
- ✅ Returns to DistributorMenuActivity
- ✅ SessionManager.isLoggedIn() returns true
- ✅ SessionManager.getUserRole() returns correct role

**Debug if Failed:**
- Check SharedPreferences storage
- Verify session token not expired
- Check RegistrationChoiceActivity onCreate logic

---

### TEST 8: Logout Flow ✓

**Purpose:** Verify logout clears session correctly

**Steps:**
1. Login as any user
2. Navigate to settings/profile (if available) or use logout button
3. Click "Logout"

**Expected Results:**
- ✅ Session cleared
- ✅ Returns to RegistrationChoiceActivity or LoginActivity
- ✅ SessionManager.isLoggedIn() returns false
- ✅ Cannot access protected screens

**Debug if Failed:**
- Check SessionManager.clearSession()
- Verify SharedPreferences cleared
- Check logout button handler

---

## Edge Case Tests

### TEST 9: Legacy Role Compatibility ✓

**Purpose:** Verify backward compatibility with old role values

**Setup:** Manually modify database (or use old account)
- Set user's `user_level='distributor'` (old value)

**Steps:**
1. Login with this user
2. Observe behavior

**Expected Results:**
- ✅ Login works
- ✅ Navigates to DistributorMenuActivity
- ✅ SessionManager recognizes as distributor (legacy check)

**Note:** This tests the backward compatibility code in SessionManager

---

### TEST 10: Null/Empty Role Handling ✓

**Purpose:** Verify app doesn't crash with missing role

**Setup:** Create user with `user_level=null` (or empty string)

**Steps:**
1. View this user in User Management
2. Click to view details

**Expected Results:**
- ✅ App doesn't crash
- ✅ Shows role as "Unknown"
- ✅ Can edit and assign proper role

---

## Debugging Tools

### View Logs
```bash
# Filter for authentication logs
adb logcat | grep -E "SessionManager|AuthClient|Login"

# Filter for errors
adb logcat *:E

# Clear logs and start fresh
adb logcat -c
adb logcat | grep -i "gen3"
```

### Check Shared Preferences
```bash
# Pull SharedPreferences file
adb root
adb pull /data/data/com.pure.gen3firmwareupdater/shared_prefs/FirmwareUpdaterPrefs.xml

# View contents
cat FirmwareUpdaterPrefs.xml
```

### Inspect Database Values
Use web-admin or Supabase dashboard to verify:
```sql
SELECT id, email, user_level, distributor_id, is_active, is_verified
FROM users
WHERE email LIKE 'test-%';
```

### Force Stop App
```bash
adb shell am force-stop com.pure.gen3firmwareupdater
```

### Uninstall and Reinstall
```bash
adb uninstall com.pure.gen3firmwareupdater
adb install app/build/outputs/apk/debug/app-debug.apk
```

---

## Common Issues and Fixes

### Issue: "Login Failed" with no error message
**Cause:** Network error or invalid credentials
**Fix:**
- Check internet connection
- Verify Supabase URL in build.gradle
- Check user exists in database with correct password

### Issue: Login succeeds but navigates to wrong screen
**Cause:** SessionManager.isDistributor() logic issue
**Fix:**
- Check user has correct `user_level` value
- Verify `distributor_id` is set for admin/manager
- Review SessionManager.isDistributor() logic

### Issue: Role displays as "Unknown" or empty
**Cause:** UserInfo.getUserLevelDisplay() issue or null role
**Fix:**
- Verify user has `user_level` set in database
- Check UserInfo.getUserLevelDisplay() handles null
- Ensure edge function returns `role` field

### Issue: Role dropdown shows old values
**Cause:** UserDetailActivity not updated
**Fix:**
- Verify USER_LEVELS array: `{"normal", "manager", "admin"}`
- Rebuild app (clean build)
- Force stop app and relaunch

### Issue: Can't edit user role (dropdown disabled)
**Cause:** Edit mode not enabled
**Fix:**
- Click "Edit" button first
- Check if user is logged in as admin/manager
- Verify permissions

---

## Success Criteria

All tests should pass with these results:

✅ **Authentication**
- Admin login → DistributorMenuActivity
- Manager login → DistributorMenuActivity
- Normal user login → Appropriate screen (not distributor menu)

✅ **Role Display**
- Admin shows "Admin"
- Manager shows "Manager"
- Normal shows "Normal"

✅ **Role Editing**
- Dropdown shows: Normal, Manager, Admin
- Can change and save roles
- Database updates correctly

✅ **UI/UX**
- No activation code input fields
- Informational screen for distributor registration
- Correct messaging about admin-assigned roles

✅ **Compatibility**
- Works with new role values (admin/manager/normal)
- Backward compatible with old values (distributor)
- Session persistence works
- Logout works

---

## Reporting Issues

If you encounter issues, provide:

1. **Test number** that failed (e.g., "TEST 2: Manager Login")
2. **Steps** to reproduce
3. **Expected** result
4. **Actual** result
5. **Logs** from Logcat (if available)
6. **Database state** (user_level, distributor_id values)

Example:
```
TEST 2 Failed: Manager Login
Steps: Logged in with test-manager@example.com
Expected: Navigate to DistributorMenuActivity
Actual: Stayed at LoginActivity
Logs: SessionManager.isDistributor() returned false
Database: user_level='manager', distributor_id='123e4567-e89b-12d3-a456-426614174000'
```

---

## Next Steps After Testing

If all tests pass:
1. ✅ Commit changes to git
2. ✅ Move to PIN management implementation
3. ✅ Deploy to production

If tests fail:
1. ❌ Report issues using format above
2. ❌ Debug with help
3. ❌ Fix and retest
