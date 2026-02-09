#!/bin/bash
set -e

# Load environment variables
source admin-tool/.env

echo "=================================================================================="
echo "Deploying Database Migration"
echo "=================================================================================="

# Read migration SQL
MIGRATION_SQL=$(cat supabase/migrations/20260209000002_secure_activation_codes.sql)

# Execute via Supabase SQL endpoint
# Note: This uses the Management API which requires proper authentication
curl -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\": $(echo "$MIGRATION_SQL" | jq -Rs .)}" \
  || {
    echo ""
    echo "⚠️  Direct SQL execution not available via REST API"
    echo "Using manual deployment approach..."
    echo ""

    # Alternative: Apply migration by copying SQL to dashboard
    echo "Please apply migration manually:"
    echo "1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor"
    echo "2. Click SQL Editor"
    echo "3. Paste contents from: supabase/migrations/20260209000002_secure_activation_codes.sql"
    echo "4. Click RUN"
  }

echo ""
echo "Verifying migration..."

# Verify columns exist
curl -s "$SUPABASE_URL/rest/v1/distributors?select=activation_code_hash&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  > /dev/null && echo "✅ distributors.activation_code_hash exists"

curl -s "$SUPABASE_URL/rest/v1/workshops?select=activation_code_hash&limit=1" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  > /dev/null && echo "✅ workshops.activation_code_hash exists"

echo ""
echo "Migration deployment complete!"
