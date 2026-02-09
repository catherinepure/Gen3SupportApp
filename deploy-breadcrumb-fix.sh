#!/bin/bash
# Deploy breadcrumb fixes for Users and Scooters pages
set -e

cd "$(dirname "$0")"

if [ -f .env ]; then
    export $(grep -v '^#' .env | grep -E '^FTP_' | xargs)
else
    echo "❌ Error: .env file not found"
    exit 1
fi

echo "🚀 Deploying breadcrumb fixes..."

echo "📤 Uploading users.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/pages/users.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/pages/users.js"

echo "📤 Uploading scooters.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/pages/scooters.js" \
     "ftp://${FTP_USER}:${FTP_PASSWORD}@${FTP_HOST}${FTP_PATH}/js/pages/scooters.js"

echo "✅ Breadcrumbs deployed!"
