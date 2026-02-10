# Deploy PIN Migration (009_scooter_pins.sql)

**Migration:** `009_scooter_pins.sql`
**Purpose:** Add encrypted PIN storage for scooters

## Option 1: Via Supabase Dashboard (RECOMMENDED)

1. Go to https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/sql/new
2. Copy the entire contents of `sql/009_scooter_pins.sql`
3. Paste into the SQL editor
4. Click "Run" to execute

## Option 2: Via Local PostgreSQL Client

If you have `psql` installed:

```bash
PGPASSWORD='jcjlb12rEl$eg00d' psql \
  "postgresql://postgres.hhpxmlrpdharhhzwjxuc@aws-0-eu-west-2.pooler.supabase.com:5432/postgres" \
  < sql/009_scooter_pins.sql
```

## What This Migration Does

1. **Enables pgcrypto extension** - Required for encryption
2. **Adds 3 columns to scooters table:**
   - `pin_encrypted` TEXT - Stores encrypted 6-digit PIN
   - `pin_set_at` TIMESTAMPTZ - When PIN was set
   - `pin_set_by_user_id` UUID - Who set the PIN

3. **Creates 3 database functions:**
   - `set_scooter_pin()` - Encrypts and stores PIN
   - `get_scooter_pin()` - Decrypts and returns PIN
   - `clear_scooter_pin()` - Removes PIN

4. **Creates admin view:**
   - `scooter_pin_status` - Shows PIN status without exposing encrypted values

5. **Adds index:** `idx_scooters_pin_set_at` for performance

## Security Features

- ✅ PINs stored encrypted using pgcrypto (AES-256)
- ✅ Only Edge Functions can encrypt/decrypt (service_role)
- ✅ Web admin sees "PIN Set: Yes/No" but NOT the actual PIN
- ✅ Audit trail (who set it, when)
- ✅ Owner/manufacturer admin only access control

## Environment Variable Required

The `.env` file has been updated with:

```
PIN_ENCRYPTION_KEY=teV35CqVYIiqUOp1GknShv9JTtdySnfYuA0+R7NPBhk=
```

This key must be set in Supabase Edge Function environment variables:

1. Go to https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/settings/functions
2. Add secret: `PIN_ENCRYPTION_KEY` = `teV35CqVYIiqUOp1GknShv9JTtdySnfYuA0+R7NPBhk=`

## Verification

After deployment, run these queries to verify:

```sql
-- Check columns added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'scooters'
  AND column_name IN ('pin_encrypted', 'pin_set_at', 'pin_set_by_user_id');

-- Check functions created
SELECT routine_name
FROM information_schema.routines
WHERE routine_name IN ('set_scooter_pin', 'get_scooter_pin', 'clear_scooter_pin');

-- Check view created
SELECT * FROM scooter_pin_status LIMIT 5;
```

Expected results:
- 3 new columns on scooters table
- 3 new functions
- scooter_pin_status view returns data

## Next Steps

After migration is deployed:
1. Update Edge Function (admin/index.ts) with PIN management endpoints
2. Add PIN management UI to web admin scooters page
3. Add PIN set/view/reset functionality to Flutter app
