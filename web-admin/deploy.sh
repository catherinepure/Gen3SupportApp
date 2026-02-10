#!/bin/bash
# Web Admin Deployment Script
# Uploads web admin files to HostingUK FTP server

# Load credentials
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CREDS_FILE="$SCRIPT_DIR/../.ftp-credentials"

if [ ! -f "$CREDS_FILE" ]; then
    echo "Error: .ftp-credentials file not found"
    exit 1
fi

source "$CREDS_FILE"

WEB_ADMIN_DIR="$SCRIPT_DIR"

# Function to upload a file
upload_file() {
    local local_file="$1"
    local remote_path="$2"

    if [ ! -f "$local_file" ]; then
        echo "❌ File not found: $local_file"
        return 1
    fi

    echo "📤 Uploading: $local_file → $remote_path"
    curl -T "$local_file" "ftp://$FTP_HOST$FTP_PATH$remote_path" --user "$FTP_USER:$FTP_PASS" -s

    if [ $? -eq 0 ]; then
        echo "✅ Uploaded successfully"
    else
        echo "❌ Upload failed"
        return 1
    fi
}

# Main deployment
echo "🚀 Deploying Web Admin to ives.org.uk/app2026"
echo "================================================"

# Check what to deploy
if [ "$1" == "all" ]; then
    echo "📦 Deploying ALL files..."

    # HTML
    upload_file "$WEB_ADMIN_DIR/index.html" "/index.html"

    # CSS
    upload_file "$WEB_ADMIN_DIR/css/styles.css" "/css/styles.css"

    # JS Core
    upload_file "$WEB_ADMIN_DIR/js/00-utils.js" "/js/00-utils.js"
    upload_file "$WEB_ADMIN_DIR/js/01-state.js" "/js/01-state.js"
    upload_file "$WEB_ADMIN_DIR/js/02-api.js" "/js/02-api.js"
    upload_file "$WEB_ADMIN_DIR/js/03-auth.js" "/js/03-auth.js"
    upload_file "$WEB_ADMIN_DIR/js/04-router.js" "/js/04-router.js"
    upload_file "$WEB_ADMIN_DIR/js/app-init.js" "/js/app-init.js"

    # JS Components
    upload_file "$WEB_ADMIN_DIR/js/components/modal.js" "/js/components/modal.js"
    upload_file "$WEB_ADMIN_DIR/js/components/table.js" "/js/components/table.js"
    upload_file "$WEB_ADMIN_DIR/js/components/form.js" "/js/components/form.js"
    upload_file "$WEB_ADMIN_DIR/js/components/filters.js" "/js/components/filters.js"
    upload_file "$WEB_ADMIN_DIR/js/components/breadcrumbs.js" "/js/components/breadcrumbs.js"
    upload_file "$WEB_ADMIN_DIR/js/components/detail-modal.js" "/js/components/detail-modal.js"
    upload_file "$WEB_ADMIN_DIR/js/components/refresh-controller.js" "/js/components/refresh-controller.js"
    upload_file "$WEB_ADMIN_DIR/js/components/reference-data.js" "/js/components/reference-data.js"

    # JS Pages
    upload_file "$WEB_ADMIN_DIR/js/pages/dashboard.js" "/js/pages/dashboard.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/users.js" "/js/pages/users.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/scooters.js" "/js/pages/scooters.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/distributors.js" "/js/pages/distributors.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/workshops.js" "/js/pages/workshops.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/service-jobs.js" "/js/pages/service-jobs.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/firmware.js" "/js/pages/firmware.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/telemetry.js" "/js/pages/telemetry.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/logs.js" "/js/pages/logs.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/events.js" "/js/pages/events.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/validation.js" "/js/pages/validation.js"
    upload_file "$WEB_ADMIN_DIR/js/pages/settings.js" "/js/pages/settings.js"

elif [ -n "$1" ]; then
    # Deploy specific file
    if [ -f "$WEB_ADMIN_DIR/$1" ]; then
        upload_file "$WEB_ADMIN_DIR/$1" "/$1"
    else
        echo "❌ File not found: $1"
        echo ""
        echo "Usage:"
        echo "  ./deploy.sh all              # Deploy all files"
        echo "  ./deploy.sh index.html       # Deploy specific file"
        echo "  ./deploy.sh js/pages/users.js  # Deploy with path"
        exit 1
    fi
else
    echo "Usage:"
    echo "  ./deploy.sh all                    # Deploy all files"
    echo "  ./deploy.sh index.html             # Deploy specific file"
    echo "  ./deploy.sh js/pages/users.js      # Deploy with path"
    exit 1
fi

echo ""
echo "✨ Deployment complete!"
echo "🌐 View at: https://ives.org.uk/app2026"
