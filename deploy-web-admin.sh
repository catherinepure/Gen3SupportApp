#!/bin/bash
# Deploy web admin files via FTP
# Usage: ./deploy-web-admin.sh

set -e

# Load credentials from .env file
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^FTP_' | xargs)
else
    echo "❌ Error: .env file not found"
    exit 1
fi

FTP_HOST="${FTP_HOST}"
FTP_USER="${FTP_USER}"
FTP_PASS="${FTP_PASSWORD}"

echo "🚀 Deploying web admin files to ${FTP_HOST}..."

# Deploy index.html
echo "Uploading index.html..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/index.html" \
     "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${FTP_PATH}/index.html"

# Deploy workshops.js
echo "Uploading workshops.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/pages/workshops.js" \
     "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${FTP_PATH}/js/pages/workshops.js"

echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Visit https://ives.org.uk/app2026"
echo "2. Hard refresh (Cmd+Shift+R) to clear cache"
echo "3. Test: Workshops → click row → View Service Jobs → click job → Edit"
