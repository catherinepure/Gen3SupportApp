#!/bin/bash
# Deploy DetailModal updates for Users and Scooters pages
set -e

# Navigate to project root
cd "$(dirname "$0")"

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

echo "🚀 Deploying DetailModal updates to ${FTP_HOST}..."
echo ""

# Deploy index.html (updated cache version)
echo "📤 Uploading index.html..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/index.html" \
     "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${FTP_PATH}/index.html"
echo "✅ Done"
echo ""

# Deploy users.js (refactored with DetailModal)
echo "📤 Uploading users.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/pages/users.js" \
     "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${FTP_PATH}/js/pages/users.js"
echo "✅ Done"
echo ""

# Deploy scooters.js (refactored with DetailModal)
echo "📤 Uploading scooters.js..."
curl -4 --ftp-pasv --ftp-create-dirs --connect-timeout 10 --retry 2 \
     -T "web-admin/js/pages/scooters.js" \
     "ftp://${FTP_USER}:${FTP_PASS}@${FTP_HOST}${FTP_PATH}/js/pages/scooters.js"
echo "✅ Done"
echo ""

echo "✅ Deployment complete!"
echo ""
echo "Changes deployed:"
echo "- Users page detail view → DetailModal (cleaner, more maintainable)"
echo "- Scooters page detail view → DetailModal (consistent formatting)"
echo "- Cache version bumped to v=20260209-10"
echo ""
echo "Database migrations deployed:"
echo "- ✅ Fixed polymorphic addresses (split into distributor_addresses + workshop_addresses)"
echo "- ✅ Added scooter_id FK to telemetry_snapshots"
echo "- ✅ Added status transition validation triggers"
echo "- ✅ Added component serial tracking (batteries, motors, frames, controllers)"
echo ""
echo "Next steps:"
echo "1. Visit https://ives.org.uk/app2026"
echo "2. Hard refresh (Cmd+Shift+R) to clear cache"
echo "3. Test Users page → click row → verify new layout"
echo "4. Test Scooters page → click row → verify new layout"
