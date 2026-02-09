#!/bin/bash
# Deploy secure activation codes implementation

set -e  # Exit on error

echo "============================================"
echo "Deploying Secure Activation Codes"
echo "============================================"
echo ""

# Check if we're in the right directory
if [ ! -f "supabase/migrations/20260209000002_secure_activation_codes.sql" ]; then
    echo "Error: Migration file not found. Are you in the project root?"
    exit 1
fi

echo "Step 1: Applying database migration..."
echo "----------------------------------------"

# Option 1: Try npx supabase (will download if not installed)
if command -v npx &> /dev/null; then
    echo "Using npx supabase..."
    npx supabase db push
else
    echo "npx not found. Please apply migration manually:"
    echo "1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor"
    echo "2. Click 'SQL Editor'"
    echo "3. Copy contents of: supabase/migrations/20260209000002_secure_activation_codes.sql"
    echo "4. Paste and run"
    echo ""
    read -p "Press Enter after applying migration manually..."
fi

echo ""
echo "Step 2: Deploying Edge Functions..."
echo "----------------------------------------"

if command -v npx &> /dev/null; then
    echo "Deploying admin function..."
    npx supabase functions deploy admin

    echo "Deploying register-distributor function..."
    npx supabase functions deploy register-distributor

    echo "Deploying register-workshop function..."
    npx supabase functions deploy register-workshop
else
    echo "Please deploy Edge Functions manually:"
    echo "1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/functions"
    echo "2. Deploy each function: admin, register-distributor, register-workshop"
fi

echo ""
echo "============================================"
echo "✅ Deployment Complete!"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Upload web-admin to hosting (ives.org.uk/app2026)"
echo "2. Test the implementation (see DEPLOYMENT.md)"
echo "3. Regenerate codes for all existing distributors/workshops"
echo ""
echo "See DEPLOYMENT.md for detailed testing instructions."
