#!/bin/bash
# Deploy password reset feature
set -e

cd "$(dirname "$0")"

echo "🚀 Deploying Password Reset Feature"
echo "===================================="
echo ""

# Deploy Edge Function
echo "📤 Deploying password-reset Edge Function..."
export PATH="/opt/homebrew/opt/node@20/bin:$PATH"
source .env
npx supabase functions deploy password-reset

echo ""
echo "📤 Deploying web admin files..."

# Load FTP credentials
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^FTP_' | xargs)
fi

# Deploy updated files
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/index.html" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/index.html"

curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/03-auth.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/03-auth.js"

curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/app-init.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/app-init.js"

curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/css/styles.css" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/css/styles.css"

echo ""
echo "✅ Password Reset Feature Deployed!"
echo ""
echo "Features:"
echo "  - 'Forgot password?' link on login page"
echo "  - Email-based password reset flow"
echo "  - Secure one-time tokens (1 hour expiry)"
echo "  - Password validation (min 8 characters)"
echo ""
echo "Next steps:"
echo "  1. Visit https://ives.org.uk/app2026"
echo "  2. Click 'Forgot password?' link"
echo "  3. Check server logs for reset email (console.log)"
echo "  4. Integrate with email service for production"
