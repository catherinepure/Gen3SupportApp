#!/bin/bash
set -e

export PATH="/opt/homebrew/opt/node@20/bin:$PATH"

echo "================================================================================"
echo "Deploying Secure Activation Codes with Node 20"
echo "================================================================================"
echo ""
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
echo ""

# Step 1: Login to Supabase (one-time, opens browser)
echo "STEP 1: Authenticate with Supabase"
echo "-----------------------------------"
echo "This will open your browser to login to Supabase..."
echo ""
npx -y supabase@latest login

echo ""
echo "✅ Authenticated!"
echo ""

# Step 2: Link project (one-time)
echo "STEP 2: Link to Supabase project"
echo "---------------------------------"
echo "Project ref: hhpxmlrpdharhhzwjxuc"
echo ""
npx supabase link --project-ref hhpxmlrpdharhhzwjxuc

echo ""
echo "✅ Project linked!"
echo ""

# Step 3: Deploy database migration
echo "STEP 3: Deploy database migration"
echo "----------------------------------"
mkdir -p supabase/migrations
git show 74ab185:supabase/migrations/20260209000002_secure_activation_codes.sql > supabase/migrations/20260209000002_secure_activation_codes.sql
echo "Migration file created"
echo ""
npx supabase db push

echo ""
echo "✅ Database migration deployed!"
echo ""

# Step 4: Deploy Edge Functions
echo "STEP 4: Deploy Edge Functions"
echo "------------------------------"

# Extract functions from git
mkdir -p supabase/functions/admin
mkdir -p supabase/functions/register-distributor
mkdir -p supabase/functions/register-workshop

git show 74ab185:supabase/functions/admin/index.ts > supabase/functions/admin/index.ts
git show 74ab185:supabase/functions/register-distributor/index.ts > supabase/functions/register-distributor/index.ts
git show 74ab185:supabase/functions/register-workshop/index.ts > supabase/functions/register-workshop/index.ts

echo "Deploying admin..."
npx supabase functions deploy admin --project-ref hhpxmlrpdharhhzwjxuc

echo "Deploying register-distributor..."
npx supabase functions deploy register-distributor --project-ref hhpxmlrpdharhhzwjxuc

echo "Deploying register-workshop..."
npx supabase functions deploy register-workshop --project-ref hhpxmlrpdharhhzwjxuc

echo ""
echo "✅ All Edge Functions deployed!"
echo ""

# Step 5: Web admin files
echo "STEP 5: Upload web admin files"
echo "-------------------------------"
echo "Upload these files to ives.org.uk/app2026:"
echo "  - web-admin/index.html"
echo "  - web-admin/js/pages/distributors.js"
echo "  - web-admin/js/pages/workshops.js"
echo ""

echo "================================================================================"
echo "🎉 Deployment Complete!"
echo "================================================================================"
echo ""
echo "Next: Upload web admin files to your hosting"
echo ""
