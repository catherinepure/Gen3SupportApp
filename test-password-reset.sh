#!/bin/bash
# Test password reset feature
set -e

echo "🧪 Testing Password Reset Feature"
echo "=================================="
echo ""

# Test 1: Request password reset
echo "Test 1: Requesting password reset for catherine.ives@pureelectric.com..."
curl -X POST https://hhpxmlrpdharhhzwjxuc.supabase.co/functions/v1/password-reset \
  -H "Content-Type: application/json" \
  -d '{
    "action": "request",
    "email": "catherine.ives@pureelectric.com"
  }' | jq '.'

echo ""
echo "✅ Test complete! Check Supabase logs for reset token."
echo ""
echo "To view logs:"
echo "  npx supabase functions logs password-reset --project-ref hhpxmlrpdharhhzwjxuc"
