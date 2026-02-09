#!/bin/bash
# Deploy password reset UI changes
set -e

cd "$(dirname "$0")"

echo "🚀 Deploying Password Reset UI"
echo "==============================="
echo ""

# Load FTP credentials
if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^FTP_' | xargs)
fi

echo "📤 Uploading index.html..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/index.html" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/index.html"

echo "📤 Uploading auth.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/03-auth.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/03-auth.js"

echo "📤 Uploading app-init.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/app-init.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/app-init.js"

echo "📤 Uploading styles.css..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/css/styles.css" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/css/styles.css"

echo ""
echo "✅ Password Reset UI Deployed!"
