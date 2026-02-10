#!/bin/bash

# Load environment variables
source .env

echo "Deploying PIN migration to Supabase..."

# Read the SQL file
SQL_CONTENT=$(cat sql/009_scooter_pins_DEPLOY.sql)

# Use Supabase Management API to execute SQL
# Note: We'll use supabase CLI db push with migration file approach

# First, let's create a proper migration file
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_FILE="supabase/migrations/${TIMESTAMP}_scooter_pins.sql"

echo "Creating migration file: $MIGRATION_FILE"
mkdir -p supabase/migrations
cp sql/009_scooter_pins_DEPLOY.sql "$MIGRATION_FILE"

echo "Migration file created. Now pushing to Supabase..."
supabase db push --project-ref hhpxmlrpdharhhzwjxuc

echo "Done!"
