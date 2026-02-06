#!/bin/bash

# Deploy all Supabase Edge Functions for authentication
# Usage: ./deploy-functions.sh

echo "🚀 Deploying Pure Electric Authentication Functions..."
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed"
    echo "Install it with: brew install supabase/tap/supabase"
    echo "Or visit: https://github.com/supabase/cli"
    exit 1
fi

echo "✓ Supabase CLI found"
echo ""

# Deploy each function
functions=("register" "login" "verify" "validate-session" "resend-verification")

for func in "${functions[@]}"; do
    echo "📦 Deploying $func..."
    if supabase functions deploy "$func"; then
        echo "✅ $func deployed successfully"
    else
        echo "❌ Failed to deploy $func"
        exit 1
    fi
    echo ""
done

echo "🎉 All functions deployed successfully!"
echo ""
echo "📍 Your functions are available at:"
echo "   https://your-project.supabase.co/functions/v1/register"
echo "   https://your-project.supabase.co/functions/v1/login"
echo "   https://your-project.supabase.co/functions/v1/verify"
echo "   https://your-project.supabase.co/functions/v1/validate-session"
echo "   https://your-project.supabase.co/functions/v1/resend-verification"
echo ""
echo "⚠️  Remember to:"
echo "   1. Update FROM_EMAIL in register/index.ts and resend-verification/index.ts"
echo "   2. Verify your sender email in SendGrid"
echo "   3. Update BASE_URL in Android AuthClient.java"
echo ""
echo "📖 For more info, see SERVERLESS_AUTH_SETUP.md"
