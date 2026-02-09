#!/bin/bash
# Sync all web-admin files to ensure live site matches git

cd "$(dirname "$0")"

echo "🔄 Syncing ALL web-admin files to ives.org.uk/app2026"
echo "======================================================"
echo ""

# Use the deploy script to upload everything
./web-admin/deploy.sh all

echo ""
echo "✅ Full sync complete!"
echo "🌐 https://ives.org.uk/app2026"
