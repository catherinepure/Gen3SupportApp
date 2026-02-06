#!/bin/bash

# Complete Deployment Script for Pure Electric Registration System
# This script deploys database schema and all Edge Functions

set -e  # Exit on any error

echo "🚀 Pure Electric Registration System - Complete Deployment"
echo "============================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}❌ Supabase CLI is not installed${NC}"
    echo "Install it with: brew install supabase/tap/supabase"
    echo "Or visit: https://github.com/supabase/cli"
    exit 1
fi

echo -e "${GREEN}✓ Supabase CLI found${NC}"
echo ""

# Check if we're linked to a project
if [ ! -f ".supabase/config.toml" ]; then
    echo -e "${YELLOW}⚠️  Not linked to a Supabase project${NC}"
    echo "Please run: supabase link --project-ref your-project-ref"
    exit 1
fi

echo -e "${GREEN}✓ Linked to Supabase project${NC}"
echo ""

# Step 1: Database Schema
echo "📊 Step 1: Database Schema"
echo "──────────────────────────"
echo ""
echo "⚠️  IMPORTANT: You need to manually run the database schema in Supabase SQL Editor"
echo ""
echo "Steps:"
echo "  1. Go to your Supabase Dashboard"
echo "  2. Navigate to SQL Editor"
echo "  3. Open and execute: user_scooter_registration_schema.sql"
echo ""
read -p "Have you run the database schema? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  Please run the database schema first, then run this script again${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Database schema confirmed${NC}"
echo ""

# Step 2: Deploy Edge Functions
echo "☁️  Step 2: Deploying Edge Functions"
echo "────────────────────────────────────"
echo ""

FUNCTIONS=("register-user" "register-distributor" "login" "verify" "validate-session" "resend-verification")

for func in "${FUNCTIONS[@]}"; do
    if [ -d "supabase/functions/$func" ]; then
        echo "📦 Deploying $func..."
        if supabase functions deploy "$func" --no-verify-jwt; then
            echo -e "${GREEN}✅ $func deployed successfully${NC}"
        else
            echo -e "${RED}❌ Failed to deploy $func${NC}"
            exit 1
        fi
        echo ""
    else
        echo -e "${YELLOW}⚠️  Skipping $func (directory not found)${NC}"
        echo ""
    fi
done

# Step 3: Get Project URL
echo "🔗 Step 3: Configuration"
echo "────────────────────────"
echo ""

PROJECT_REF=$(grep 'project_id' .supabase/config.toml | cut -d'"' -f2)
PROJECT_URL="https://$PROJECT_REF.supabase.co"

echo "Your Supabase project URL:"
echo -e "${GREEN}$PROJECT_URL${NC}"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Update Android App (AuthClient.java line 21):"
echo "   private static final String BASE_URL = \"$PROJECT_URL/functions/v1\";"
echo ""
echo "2. Update SendGrid sender email in Edge Functions:"
echo "   - supabase/functions/register-user/index.ts (line 14)"
echo "   - supabase/functions/register-distributor/index.ts (line 8)"
echo "   - supabase/functions/resend-verification/index.ts (line 8)"
echo "   Current: FROM_EMAIL = \"noreply@pureelectric.com\""
echo ""
echo "3. Verify SendGrid sender email at:"
echo "   https://app.sendgrid.com/settings/sender_auth"
echo ""
echo "4. Update AndroidManifest.xml to set RegistrationChoiceActivity as launcher"
echo ""
echo "5. Test the deployment:"
echo "   curl -X POST $PROJECT_URL/functions/v1/register-user \\"
echo "     -H \"Content-Type: application/json\" \\"
echo "     -d '{\"email\":\"test@example.com\",\"password\":\"test123\",\"scooter_serial\":\"TEST-001\"}'"
echo ""

echo -e "${GREEN}🎉 Deployment Complete!${NC}"
echo ""
echo "📚 Documentation:"
echo "   - NEW_REGISTRATION_SYSTEM.md - System overview"
echo "   - COMPLETE_IMPLEMENTATION_SUMMARY.md - Full details"
echo ""
