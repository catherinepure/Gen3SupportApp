# Gen3 Firmware Updater API Documentation

## Overview

This API supports two types of users:
1. **Public Users** - No authentication required, access only public firmware matching their HW version
2. **Distributor Users** - Authenticate with activation code, access public + distributor firmware

## Base URL
```
https://your-project.supabase.co
```

## Authentication

### Public Access
No authentication required for public firmware queries. Use the anon key.

### Distributor Access
Distributors authenticate using their activation code to get a session token.

---

## Endpoints

### 1. Validate Activation Code

Validates a distributor activation code and returns distributor information.

**Endpoint:** `POST /rest/v1/rpc/validate_activation_code`

**Request:**
```json
{
  "p_activation_code": "PURE-ABCD-1234"
}
```

**Response (Success):**
```json
{
  "valid": true,
  "distributor_id": "550e8400-e29b-41d4-a716-446655440000",
  "distributor_name": "Acme Scooters",
  "is_active": true
}
```

**Response (Invalid/Inactive):**
```json
{
  "valid": false,
  "distributor_id": null,
  "distributor_name": null,
  "is_active": false
}
```

**SQL Function to Create:**
```sql
CREATE OR REPLACE FUNCTION validate_activation_code(p_activation_code TEXT)
RETURNS TABLE (
    valid BOOLEAN,
    distributor_id UUID,
    distributor_name TEXT,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (d.id IS NOT NULL AND d.is_active) AS valid,
        d.id AS distributor_id,
        d.name AS distributor_name,
        d.is_active
    FROM distributors d
    WHERE d.activation_code = p_activation_code;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, false;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 2. Verify ZYD Serial for Distributor

Checks if a ZYD serial belongs to a specific distributor.

**Endpoint:** `POST /rest/v1/rpc/verify_zyd_for_distributor`

**Request:**
```json
{
  "p_distributor_id": "550e8400-e29b-41d4-a716-446655440000",
  "p_zyd_serial": "ZYD12345"
}
```

**Response:**
```json
{
  "valid": true,
  "scooter_id": "660e8400-e29b-41d4-a716-446655440001",
  "model": "Gen3 Pro",
  "hw_version": "V1.0"
}
```

**SQL Function:**
```sql
CREATE OR REPLACE FUNCTION verify_zyd_for_distributor(
    p_distributor_id UUID,
    p_zyd_serial TEXT
)
RETURNS TABLE (
    valid BOOLEAN,
    scooter_id UUID,
    model TEXT,
    hw_version TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (s.id IS NOT NULL) AS valid,
        s.id AS scooter_id,
        s.model,
        s.hw_version
    FROM scooters s
    WHERE s.distributor_id = p_distributor_id
        AND s.zyd_serial = p_zyd_serial;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### 3. Query Available Firmware

Returns available firmware updates for a given hardware version and access level.

**Endpoint:** `POST /rest/v1/rpc/get_available_firmware`

**Request (Public User):**
```json
{
  "p_hw_version": "V1.0",
  "p_access_level": "public",
  "p_current_sw_version": "V2.1"
}
```

**Request (Distributor User):**
```json
{
  "p_hw_version": "V1.0",
  "p_access_level": "distributor",
  "p_current_sw_version": "V2.1"
}
```

**Response:**
```json
[
  {
    "firmware_id": "770e8400-e29b-41d4-a716-446655440002",
    "version_label": "V2.3",
    "file_path": "controller_v2_3.bin",
    "file_size_bytes": 245760,
    "release_notes": "Bug fixes and performance improvements",
    "min_sw_version": "V2.0",
    "access_level": "public",
    "created_at": "2025-01-15T10:30:00Z"
  }
]
```

**Note:** The function was already created in migration.sql

---

### 4. Get Signed Download URL

Gets a temporary signed URL to download firmware binary from storage.

**Endpoint:** `POST /storage/v1/object/sign/firmware-binaries/{file_path}`

**Request:**
```json
{
  "expiresIn": 3600
}
```

**Response:**
```json
{
  "signedURL": "https://your-project.supabase.co/storage/v1/object/sign/firmware-binaries/controller_v2_3.bin?token=..."
}
```

**Alternative (using Supabase client):**
```javascript
const { data, error } = await supabase
  .storage
  .from('firmware-binaries')
  .createSignedUrl('controller_v2_3.bin', 3600); // 1 hour expiry
```

---

### 5. Record Telemetry Snapshot

Records anonymous telemetry data from a scooter connection or firmware update.

**Endpoint:** `POST /rest/v1/rpc/record_telemetry`

**Request:**
```json
{
  "p_zyd_serial": "ZYD12345",
  "p_hw_version": "V1.0",
  "p_sw_version": "V2.3",
  "p_odometer_km": 1234.5,
  "p_battery_cycles": 42,
  "p_firmware_upload_id": null,
  "p_notes": "Pre-update snapshot"
}
```

**Response:**
```json
"880e8400-e29b-41d4-a716-446655440003"
```
(Returns the UUID of the created telemetry snapshot)

**Note:** This function was already created in migration.sql

---

### 6. Create Firmware Upload Log

Records the start of a firmware update attempt.

**Endpoint:** `POST /rest/v1/firmware_uploads`

**Request:**
```json
{
  "scooter_id": "660e8400-e29b-41d4-a716-446655440001",
  "firmware_version_id": "770e8400-e29b-41d4-a716-446655440002",
  "distributor_id": "550e8400-e29b-41d4-a716-446655440000",
  "old_sw_version": "V2.1",
  "status": "started"
}
```

**Response:**
```json
{
  "id": "990e8400-e29b-41d4-a716-446655440004",
  "scooter_id": "660e8400-e29b-41d4-a716-446655440001",
  "firmware_version_id": "770e8400-e29b-41d4-a716-446655440002",
  "distributor_id": "550e8400-e29b-41d4-a716-446655440000",
  "old_sw_version": "V2.1",
  "status": "started",
  "started_at": "2025-01-20T14:22:00Z",
  "completed_at": null,
  "error_message": null
}
```

---

### 7. Update Firmware Upload Status

Updates the status of an ongoing firmware upload (completed or failed).

**Endpoint:** `PATCH /rest/v1/firmware_uploads?id=eq.{upload_id}`

**Request (Success):**
```json
{
  "status": "completed",
  "completed_at": "2025-01-20T14:25:30Z"
}
```

**Request (Failure):**
```json
{
  "status": "failed",
  "completed_at": "2025-01-20T14:24:15Z",
  "error_message": "Connection lost during transfer"
}
```

**Response:**
Returns the updated record.

---

## Complete Workflow Examples

### Workflow 1: Public User Update

1. **App connects to scooter via Bluetooth**
   - Read HW version from controller
   - Read current SW version from controller
   - Read odometer and battery cycles (optional)

2. **Query available firmware**
   ```javascript
   const { data, error } = await supabase
     .rpc('get_available_firmware', {
       p_hw_version: 'V1.0',
       p_access_level: 'public',
       p_current_sw_version: 'V2.1'
     });
   ```

3. **If update available, get download URL**
   ```javascript
   const { data: signedUrl } = await supabase
     .storage
     .from('firmware-binaries')
     .createSignedUrl(firmware.file_path, 3600);
   ```

4. **Download firmware binary**

5. **Record pre-update telemetry (optional)**
   ```javascript
   await supabase.rpc('record_telemetry', {
     p_zyd_serial: 'ZYD12345',
     p_hw_version: 'V1.0',
     p_sw_version: 'V2.1',
     p_odometer_km: 1234.5,
     p_battery_cycles: 42,
     p_notes: 'Pre-update snapshot'
   });
   ```

6. **Flash firmware to controller**

7. **Record post-update telemetry**
   ```javascript
   await supabase.rpc('record_telemetry', {
     p_zyd_serial: 'ZYD12345',
     p_hw_version: 'V1.0',
     p_sw_version: 'V2.3',
     p_odometer_km: 1234.5,
     p_battery_cycles: 42,
     p_notes: 'Post-update snapshot'
   });
   ```

### Workflow 2: Distributor User Update

1. **User enters activation code**
   ```javascript
   const { data } = await supabase
     .rpc('validate_activation_code', {
       p_activation_code: 'PURE-ABCD-1234'
     });

   if (!data[0].valid) {
     // Show error
     return;
   }

   const distributorId = data[0].distributor_id;
   ```

2. **User enters or scans ZYD serial**

3. **Verify ZYD belongs to distributor**
   ```javascript
   const { data: scooterData } = await supabase
     .rpc('verify_zyd_for_distributor', {
       p_distributor_id: distributorId,
       p_zyd_serial: 'ZYD12345'
     });

   if (!scooterData[0].valid) {
     // Show error: scooter not found or doesn't belong to distributor
     return;
   }
   ```

4. **Connect to scooter, read versions**

5. **Query firmware with distributor access**
   ```javascript
   const { data: firmware } = await supabase
     .rpc('get_available_firmware', {
       p_hw_version: scooterData[0].hw_version || 'V1.0',
       p_access_level: 'distributor',
       p_current_sw_version: 'V2.1'
     });
   ```

6. **Create upload log entry**
   ```javascript
   const { data: uploadLog } = await supabase
     .from('firmware_uploads')
     .insert({
       scooter_id: scooterData[0].scooter_id,
       firmware_version_id: firmware[0].firmware_id,
       distributor_id: distributorId,
       old_sw_version: 'V2.1',
       status: 'started'
     })
     .select()
     .single();
   ```

7. **Get download URL and download**

8. **Record pre-update telemetry**
   ```javascript
   await supabase.rpc('record_telemetry', {
     p_zyd_serial: 'ZYD12345',
     p_hw_version: 'V1.0',
     p_sw_version: 'V2.1',
     p_odometer_km: 1234.5,
     p_battery_cycles: 42,
     p_firmware_upload_id: uploadLog.id
   });
   ```

9. **Flash firmware**

10. **Update upload log status**
    ```javascript
    await supabase
      .from('firmware_uploads')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', uploadLog.id);
    ```

11. **Record post-update telemetry**
    ```javascript
    await supabase.rpc('record_telemetry', {
      p_zyd_serial: 'ZYD12345',
      p_hw_version: 'V1.0',
      p_sw_version: 'V2.3',
      p_odometer_km: 1234.5,
      p_battery_cycles: 42,
      p_firmware_upload_id: uploadLog.id
    });
    ```

---

## Error Handling

### Common Error Codes

- `401 Unauthorized` - Missing or invalid API key
- `403 Forbidden` - RLS policy blocking access (e.g., trying to access distributor firmware without auth)
- `404 Not Found` - Resource doesn't exist
- `422 Unprocessable Entity` - Invalid parameters
- `500 Internal Server Error` - Database or server error

### Best Practices

1. **Always check if firmware array is empty** before attempting download
2. **Validate activation codes** before storing distributor session
3. **Handle network errors gracefully** - firmware downloads may be large
4. **Record telemetry even on failure** - helps diagnose issues
5. **Update upload status to "failed"** with error message if update fails
6. **Use exponential backoff** for retries on network errors

---

## Security Notes

1. **Public firmware queries** use the anon key - no authentication needed
2. **Distributor queries** should validate activation code first, then use distributor_id in subsequent calls
3. **Storage bucket** should have RLS enabled - use signed URLs for downloads
4. **Service role key** should NEVER be used in mobile app - only in admin tools
5. **Telemetry data** is write-only for apps (cannot read others' data)
6. **ZYD serials** in telemetry are not linked via foreign key for privacy

---

## Rate Limiting

Supabase has default rate limits:
- **Anonymous requests**: 100 requests per hour per IP
- **Authenticated requests**: Higher limits based on plan

For firmware downloads:
- Signed URLs expire after set time (recommend 1 hour)
- Downloads don't count against API rate limits

---

## Testing

### Test with cURL

**Validate activation code:**
```bash
curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/validate_activation_code' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_activation_code": "PURE-ABCD-1234"}'
```

**Query public firmware:**
```bash
curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/get_available_firmware' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_hw_version": "V1.0", "p_access_level": "public"}'
```

**Record telemetry:**
```bash
curl -X POST 'https://your-project.supabase.co/rest/v1/rpc/record_telemetry' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "p_zyd_serial": "ZYD12345",
    "p_hw_version": "V1.0",
    "p_sw_version": "V2.3",
    "p_odometer_km": 1234.5,
    "p_battery_cycles": 42
  }'
```
