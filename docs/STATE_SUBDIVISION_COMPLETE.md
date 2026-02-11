# State/Province Subdivision Support - Implementation Complete

**Date**: 2026-02-10
**Status**: ✅ Deployed and Ready for Testing

## What Was Implemented

Added support for state/province-level Terms & Conditions for countries like US and Australia that have regional legal variations.

## Database Changes (Migration 20260210140000)

✅ **Deployed successfully**

### Tables Updated:
1. **terms_conditions** - Added `state_code TEXT` column
2. **user_consent** - Added `state_code TEXT` column
3. **users** - Added `detected_state TEXT` column

### Function Updated:
- **get_latest_terms()** - Now supports state-level fallback logic:
  1. Try state-specific version (if state provided)
  2. Fall back to country-level (no state)
  3. Fall back to English if language not found

## Edge Function Changes

✅ **Deployed to production**

Updated `/upload` endpoint to accept and store `state_code` parameter.

## Web Admin Changes

✅ **Deployed to ives.org.uk/app2026**

### Upload Form Updates:
- Added optional "State/Province" field
- Accepts ISO 3166-2 subdivision codes (CA, NSW, QLD, etc.)
- Storage path now includes state: `{region}/{state?}/terms-{version}-{language}.html`

## How It Works

### Uploading State-Specific T&C:
1. Go to Terms Management page
2. Click "Upload New Version"
3. Fill in version, language, region
4. **NEW**: Enter state code (e.g., CA, NSW) or leave blank for country-level
5. Upload HTML file

### Fallback Logic:
When the app requests T&C for a user in California (US/CA/en):
1. First checks for US/CA/en version
2. If not found, checks for US/en (country-level)
3. If not found, checks for US/en (English fallback)

### ISO 3166-2 Subdivision Codes:

**US States:**
- CA (California)
- TX (Texas)
- NY (New York)
- FL (Florida)
- IL (Illinois)
- etc.

**Australian States/Territories:**
- NSW (New South Wales)
- VIC (Victoria)
- QLD (Queensland)
- WA (Western Australia)
- SA (South Australia)
- TAS (Tasmania)
- ACT (Australian Capital Territory)
- NT (Northern Territory)

## Testing Checklist

- [ ] Upload country-level T&C (no state code)
- [ ] Upload state-specific T&C (with state code like CA or NSW)
- [ ] Verify storage path includes state directory
- [ ] Test Android app retrieves correct version based on user location
- [ ] Verify fallback logic works correctly

## Files Modified

- `supabase/migrations/20260210140000_add_state_subdivision.sql` - Database schema
- `supabase/functions/terms/index.ts` - Edge Function
- `web-admin/js/pages/terms-management-simple.js` - Upload form

## Deployment Commands Used

```bash
# Database migration
SUPABASE_ACCESS_TOKEN=<token> supabase db push

# Edge Function
SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy terms --project-ref hhpxmlrpdharhhzwjxuc --no-verify-jwt

# Web admin (FTP)
curl -T web-admin/js/pages/terms-management-simple.js ftp://217.194.210.33/httpdocs/app2026/js/pages/terms-management.js --user susieive:<password>
```

## Next Steps

1. Test uploading a California-specific T&C
2. Test uploading an NSW-specific T&C
3. Verify Android app correctly detects user state
4. Update TermsManager.java to pass state_code to /latest endpoint
5. Test fallback logic with various state/country/language combinations
