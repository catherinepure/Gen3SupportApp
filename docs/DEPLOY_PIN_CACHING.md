# PIN Caching & Recovery - Deployment Guide

**Quick deployment steps for the PIN caching and recovery feature**

---

## 🚀 Quick Deployment (5 minutes)

### Step 1: Deploy Edge Function Update (2 min)
```bash
cd /Users/catherineives/AndroidStudioProjects/Gen3FirmwareUpdater
supabase functions deploy user-pin --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
```

Expected output:
```
Deploying function user-pin (project: hhpxmlrpdharhhzwjxuc)
✓ Deployed successfully
```

### Step 2: Upload PIN Recovery Page (1 min)
```bash
# Upload to web server
scp web-admin/pin-recovery.html user@ives.org.uk:/var/www/app2026/

# Or manually upload via FTP/hosting panel
# URL will be: https://ives.org.uk/app2026/pin-recovery.html
```

### Step 3: Build Android App (2 min)
```bash
# Build release APK
./gradlew assembleRelease

# APK location:
# app/build/outputs/apk/release/app-release.apk
```

---

## ✅ Verification Steps

### Test 1: PIN Caching
1. Install updated app on device
2. Login as normal user
3. Connect to scooter via Bluetooth
4. Toggle lock switch → PIN dialog appears
5. Enter PIN → Lock activates
6. Toggle unlock → **NO PIN DIALOG** (auto-verified!)
7. ✅ Success: PIN cached and working

### Test 2: Cache Persistence
1. Close app completely
2. Reopen app and login
3. Connect to same scooter
4. Toggle lock → **NO PIN DIALOG** (cache persisted)
5. ✅ Success: Cache survives app restart

### Test 3: Forgot PIN Recovery
1. In PIN entry dialog, click **"Forgot PIN?"**
2. Browser opens: https://ives.org.uk/app2026/pin-recovery.html
3. Enter email + password
4. ✅ Success: Shows list of scooters with PIN status

### Test 4: Logout Clears Cache
1. Lock scooter (uses cached PIN)
2. Logout from app
3. Login again
4. Connect to scooter
5. Toggle lock → **PIN DIALOG APPEARS** (cache cleared)
6. ✅ Success: Logout security working

---

## 🔧 Troubleshooting

### Issue: PIN caching not working
**Symptoms:** Dialog appears every time

**Check:**
```bash
# View Android logs
adb logcat | grep PinCache

# Look for:
# "PIN cached for scooter: <uuid>"
# "Using cached PIN for auto-verification"
```

**Common Causes:**
- App doesn't have storage permissions
- Keystore key generation failed
- ServiceFactory not initialized

**Fix:**
```java
// Verify in MainActivity or Application.onCreate():
ServiceFactory.init(this);
```

---

### Issue: Forgot PIN button not working
**Symptoms:** Nothing happens when clicked

**Check:**
- Browser app installed on device?
- URL in PinEntryDialog correct?
- Web page uploaded to correct location?

**Test URL directly:**
https://ives.org.uk/app2026/pin-recovery.html

---

### Issue: Edge Function returns 401
**Symptoms:** "Authentication failed" on recovery page

**Check:**
```sql
-- Verify user exists and is active
SELECT id, email, is_active
FROM users
WHERE email = 'test@example.com';
```

**Check Edge Function logs:**
```bash
supabase functions logs user-pin --project-ref hhpxmlrpdharhhzwjxuc
```

---

## 📊 Monitoring

### Check Cache Usage
```java
// In Android app, add debug logging:
PinCacheManager cache = ServiceFactory.getPinCacheManager();
Log.d("DEBUG", "Has cached PIN: " + cache.hasCachedPin(scooterId));
Log.d("DEBUG", "Days remaining: " + cache.getDaysRemaining(scooterId));
```

### Check Edge Function Usage
```bash
# View function invocations
supabase functions logs user-pin --project-ref hhpxmlrpdharhhzwjxuc --tail

# Look for:
# - "recover-pin" actions
# - "verify-pin" actions with cached PINs
```

---

## 🔄 Rollback Plan

If issues arise, rollback is simple:

### Rollback Android App
1. Revert to previous APK version
2. Users will see PIN dialog every time (old behavior)

### Rollback Edge Function
```bash
# Redeploy previous version
git checkout HEAD~1 supabase/functions/user-pin/index.ts
supabase functions deploy user-pin --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt
```

### Remove Recovery Page
```bash
# Just delete the file
ssh user@ives.org.uk "rm /var/www/app2026/pin-recovery.html"
```

---

## 📈 Success Metrics

After deployment, track:

1. **PIN Cache Hit Rate**
   - Target: >80% of lock operations use cached PIN
   - Measure: Count "Using cached PIN" vs "PIN entry dialog shown"

2. **User Support Requests**
   - Target: 50% reduction in "forgot PIN" support tickets
   - Measure: Support ticket volume before/after

3. **Lock/Unlock Speed**
   - Target: <1 second for cached operations
   - Measure: Time from toggle switch to lock command sent

4. **Recovery Page Usage**
   - Track: Page views, successful recoveries
   - Analytics: Add Google Analytics to pin-recovery.html

---

## 🎯 Next Steps After Deployment

1. **Monitor for 1 week**
   - Watch Edge Function logs
   - Check user feedback
   - Verify cache is working

2. **Gather metrics**
   - Cache hit rate
   - Recovery page usage
   - User satisfaction

3. **Iterate if needed**
   - Adjust cache duration (7 days → configurable?)
   - Add email sending to recovery flow
   - Add biometric unlock option

---

## 📞 Support

**If users report issues:**

1. Ask them to reproduce with logs enabled
2. Check `adb logcat | grep -E "(PinCache|PinEntry)"`
3. Verify Edge Function logs for errors
4. Check Keystore availability on device
5. Ensure device has Android 6.0+ (API 23+)

**Common user questions:**

**Q: Why does PIN dialog still appear sometimes?**
A: Cache expires after 7 days for security. Re-enter to refresh.

**Q: Will my PIN be stored insecurely?**
A: No! PIN is encrypted with hardware-backed Android Keystore.

**Q: What happens if I logout?**
A: All cached PINs are cleared for security. You'll re-enter on next login.

**Q: Can I disable PIN caching?**
A: Not currently, but it's optional (just enter PIN when prompted).

---

## ✅ Pre-Deployment Checklist

- [ ] Edge Function deployed and tested
- [ ] Recovery page uploaded and accessible
- [ ] Android APK built and signed
- [ ] Tested on physical device (not just emulator)
- [ ] Verified cache persistence across app restarts
- [ ] Verified cache cleared on logout
- [ ] Tested recovery page with real credentials
- [ ] Edge Function logs monitored (no errors)
- [ ] Rollback plan ready if needed
- [ ] Support team notified of new feature

---

**Ready to deploy!** 🚀
