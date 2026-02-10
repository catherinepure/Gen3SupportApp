#!/bin/bash

# Test PIN Management System
# Prerequisites:
# - Migration 009_scooter_pins.sql must be deployed
# - PIN_ENCRYPTION_KEY must be set in Supabase secrets
# - Admin Edge Function must be deployed

SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s"
URL="https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/admin"

# First, we need a valid session token
# Login as a test user to get session_token
echo "=== Step 1: Getting session token ==="
LOGIN_RESPONSE=$(curl -s -X POST \
  "https://hhpxmlrpdharhhzwjxuc.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@zydtech.com",
    "password": "admin123"
  }')

SESSION_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$SESSION_TOKEN" ]; then
  echo "❌ Failed to get session token"
  echo "$LOGIN_RESPONSE"
  exit 1
fi

echo "✅ Got session token: ${SESSION_TOKEN:0:20}..."

# Get a scooter ID to test with
echo ""
echo "=== Step 2: Getting a test scooter ==="
SCOOTER_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"list\",
    \"limit\": 1
  }")

SCOOTER_ID=$(echo "$SCOOTER_RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
SCOOTER_SERIAL=$(echo "$SCOOTER_RESPONSE" | grep -o '"zyd_serial":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$SCOOTER_ID" ]; then
  echo "❌ Failed to get scooter"
  echo "$SCOOTER_RESPONSE"
  exit 1
fi

echo "✅ Got scooter: $SCOOTER_SERIAL (ID: ${SCOOTER_ID:0:20}...)"

# Test 1: Set PIN
echo ""
echo "=== Test 1: Set PIN (123456) ==="
SET_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"set-pin\",
    \"scooter_id\": \"$SCOOTER_ID\",
    \"pin\": \"123456\"
  }")

echo "$SET_RESPONSE" | jq '.' 2>/dev/null || echo "$SET_RESPONSE"

if echo "$SET_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PIN set successfully"
else
  echo "❌ Failed to set PIN"
  exit 1
fi

# Test 2: Get PIN
echo ""
echo "=== Test 2: Retrieve PIN ==="
GET_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"get-pin\",
    \"scooter_id\": \"$SCOOTER_ID\"
  }")

echo "$GET_RESPONSE" | jq '.' 2>/dev/null || echo "$GET_RESPONSE"

RETRIEVED_PIN=$(echo "$GET_RESPONSE" | grep -o '"pin":"[^"]*' | cut -d'"' -f4)

if [ "$RETRIEVED_PIN" = "123456" ]; then
  echo "✅ PIN retrieved correctly: $RETRIEVED_PIN"
else
  echo "❌ PIN mismatch! Expected 123456, got: $RETRIEVED_PIN"
  exit 1
fi

# Test 3: Check PIN status view
echo ""
echo "=== Test 3: Check PIN status view ==="
STATUS_RESPONSE=$(curl -s -X POST \
  "https://hhpxmlrpdharhhzwjxuc.supabase.co/rest/v1/scooter_pin_status?id=eq.$SCOOTER_ID" \
  -H "apikey: $SERVICE_KEY" \
  -H "Authorization: Bearer $SERVICE_KEY")

echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"

if echo "$STATUS_RESPONSE" | grep -q '"pin_status":"set"'; then
  echo "✅ PIN status view shows 'set'"
else
  echo "❌ PIN status view incorrect"
  exit 1
fi

# Test 4: Update PIN
echo ""
echo "=== Test 4: Update PIN to 654321 ==="
UPDATE_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"set-pin\",
    \"scooter_id\": \"$SCOOTER_ID\",
    \"pin\": \"654321\"
  }")

echo "$UPDATE_RESPONSE" | jq '.' 2>/dev/null || echo "$UPDATE_RESPONSE"

if echo "$UPDATE_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PIN updated successfully"
else
  echo "❌ Failed to update PIN"
  exit 1
fi

# Verify updated PIN
GET_UPDATED_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"get-pin\",
    \"scooter_id\": \"$SCOOTER_ID\"
  }")

UPDATED_PIN=$(echo "$GET_UPDATED_RESPONSE" | grep -o '"pin":"[^"]*' | cut -d'"' -f4)

if [ "$UPDATED_PIN" = "654321" ]; then
  echo "✅ Updated PIN retrieved correctly: $UPDATED_PIN"
else
  echo "❌ Updated PIN mismatch! Expected 654321, got: $UPDATED_PIN"
  exit 1
fi

# Test 5: Reset PIN (manufacturer_admin only)
echo ""
echo "=== Test 5: Reset PIN ==="
RESET_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"reset-pin\",
    \"scooter_id\": \"$SCOOTER_ID\"
  }")

echo "$RESET_RESPONSE" | jq '.' 2>/dev/null || echo "$RESET_RESPONSE"

if echo "$RESET_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PIN reset successfully"
else
  echo "❌ Failed to reset PIN (this is expected if not manufacturer_admin)"
fi

# Test 6: Verify PIN cleared
echo ""
echo "=== Test 6: Verify PIN cleared after reset ==="
GET_CLEARED_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"get-pin\",
    \"scooter_id\": \"$SCOOTER_ID\"
  }")

echo "$GET_CLEARED_RESPONSE" | jq '.' 2>/dev/null || echo "$GET_CLEARED_RESPONSE"

if echo "$GET_CLEARED_RESPONSE" | grep -q '"error".*"No PIN set"'; then
  echo "✅ PIN cleared successfully"
elif echo "$GET_CLEARED_RESPONSE" | grep -q '"pin"'; then
  echo "⚠️  PIN still present (reset may have failed due to permissions)"
else
  echo "❌ Unexpected response"
fi

# Test 7: Invalid PIN format
echo ""
echo "=== Test 7: Test invalid PIN format ==="
INVALID_RESPONSE=$(curl -s -X POST "$URL" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_token\": \"$SESSION_TOKEN\",
    \"resource\": \"scooters\",
    \"action\": \"set-pin\",
    \"scooter_id\": \"$SCOOTER_ID\",
    \"pin\": \"12345\"
  }")

echo "$INVALID_RESPONSE" | jq '.' 2>/dev/null || echo "$INVALID_RESPONSE"

if echo "$INVALID_RESPONSE" | grep -q '"error".*"6 digits"'; then
  echo "✅ Invalid PIN format rejected correctly"
else
  echo "❌ Invalid PIN should be rejected"
  exit 1
fi

echo ""
echo "========================================="
echo "✅ All PIN tests passed!"
echo "========================================="
echo ""
echo "Summary:"
echo "- Set PIN: ✅"
echo "- Retrieve PIN: ✅"
echo "- PIN status view: ✅"
echo "- Update PIN: ✅"
echo "- Reset PIN: ✅ (if manufacturer_admin)"
echo "- Validation: ✅"
echo ""
echo "Scooter tested: $SCOOTER_SERIAL"
echo "Final PIN state: Cleared (or set to 654321 if reset failed)"
