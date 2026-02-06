#!/bin/bash

# Deploy Only Edge Functions
# Use this if you've already run the database schema

echo "☁️  Deploying Edge Functions..."
echo ""

# Check Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not installed"
    echo "Install: brew install supabase/tap/supabase"
    exit 1
fi

# Deploy all functions
supabase functions deploy register-user --no-verify-jwt && \
supabase functions deploy register-distributor --no-verify-jwt && \
supabase functions deploy login --no-verify-jwt && \
supabase functions deploy verify --no-verify-jwt && \
supabase functions deploy validate-session --no-verify-jwt && \
supabase functions deploy resend-verification --no-verify-jwt

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ All functions deployed successfully!"
    echo ""
    echo "Your functions are now live at:"
    echo "  https://your-project.supabase.co/functions/v1/"
    echo ""
else
    echo ""
    echo "❌ Deployment failed"
    exit 1
fi
