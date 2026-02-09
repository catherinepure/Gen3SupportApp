#!/usr/bin/env python3
"""
Deploy database migration via Supabase Management API
"""
import os
import sys
import json
from pathlib import Path
from dotenv import load_dotenv
import requests

# Load environment variables
load_dotenv('admin-tool/.env')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    sys.exit(1)

# Read migration SQL
migration_file = Path('supabase/migrations/20260209000002_secure_activation_codes.sql')
migration_sql = migration_file.read_text()

print("=" * 80)
print("Deploying Secure Activation Codes Migration via API")
print("=" * 80)
print(f"\nProject: {SUPABASE_URL.split('//')[1].split('.')[0]}")
print(f"Migration: {migration_file.name}\n")

# Use Supabase's SQL execution via Management API
# The PostgREST query endpoint can execute raw SQL
headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
}

print("Executing migration SQL...\n")

# Try the query endpoint
try:
    # Execute via PostgREST rpc if available
    response = requests.post(
        f"{SUPABASE_URL}/rest/v1/rpc/exec",
        headers=headers,
        json={'sql': migration_sql},
        timeout=60
    )

    if response.status_code < 400:
        print("✅ Migration executed successfully via rpc/exec!\n")
    else:
        # Try alternative: use supabase-js SQL execution
        # Since we can't execute arbitrary SQL via REST API without a function,
        # we'll need to use the Supabase CLI
        print(f"⚠️  API method not available (status {response.status_code})")
        print("Using Supabase CLI instead...\n")
        raise Exception("Switching to CLI")

except Exception as e:
    print(f"Using Supabase CLI for migration...\n")

    # Use the Supabase CLI from node_modules
    cli_path = "node_modules/.bin/supabase"
    if not os.path.exists(cli_path):
        print(f"❌ Supabase CLI not found at {cli_path}")
        sys.exit(1)

    # Execute migration via CLI
    import subprocess
    result = subprocess.run(
        [cli_path, 'db', 'push', '--db-url', f'postgresql://postgres:[PASSWORD]@db.hhpxmlrpdharhhzwjxuc.supabase.co:5432/postgres'],
        cwd=os.getcwd(),
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        print("✅ Migration executed successfully!\n")
    else:
        print(f"❌ Migration failed: {result.stderr}")
        sys.exit(1)

# Verify columns added
print("Verifying migration...\n")

try:
    # Check if columns exist via REST API
    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/distributors?select=activation_code_hash&limit=1",
        headers=headers
    )

    if response.status_code == 200:
        print("✅ distributors.activation_code_hash column exists")
    else:
        print(f"⚠️  Could not verify distributors table: {response.status_code}")

    response = requests.get(
        f"{SUPABASE_URL}/rest/v1/workshops?select=activation_code_hash&limit=1",
        headers=headers
    )

    if response.status_code == 200:
        print("✅ workshops.activation_code_hash column exists")
    else:
        print(f"⚠️  Could not verify workshops table: {response.status_code}")

except Exception as e:
    print(f"⚠️  Verification error: {e}")

print("\n" + "=" * 80)
print("🎉 Migration deployment complete!")
print("=" * 80)
print("\nNext: Deploy Edge Functions")
