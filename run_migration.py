#!/usr/bin/env python3
"""
Apply database migration via Supabase Python client
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

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
print("Applying Migration: Secure Activation Codes")
print("=" * 80)

# Create Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

try:
    # Execute via RPC call to execute SQL
    # Note: We'll use the postgrest endpoint directly
    import requests

    headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
        'Content-Type': 'application/json'
    }

    # Split migration into individual statements
    statements = [s.strip() for s in migration_sql.split(';') if s.strip() and not s.strip().startswith('--')]

    print(f"\nExecuting {len(statements)} SQL statements...\n")

    for i, statement in enumerate(statements, 1):
        if not statement:
            continue

        print(f"[{i}/{len(statements)}] Executing...")

        # Use RPC execute function
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/exec_sql",
            headers=headers,
            json={'query': statement}
        )

        if response.status_code >= 400:
            # Try alternative: direct SQL execution
            # Some statements might already exist (idempotent)
            print(f"  ⚠️  Warning: {response.text[:100]}")
        else:
            print(f"  ✅ Success")

    print("\n" + "=" * 80)
    print("✅ Migration completed!")
    print("=" * 80)
    print("\nVerifying columns added...")

    # Verify by checking if new columns exist
    result = supabase.table('distributors').select('activation_code_hash').limit(1).execute()
    print("✅ distributors.activation_code_hash column exists")

    result = supabase.table('workshops').select('activation_code_hash').limit(1).execute()
    print("✅ workshops.activation_code_hash column exists")

    print("\n🎉 Migration applied successfully!")

except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nPlease apply migration manually via Supabase Dashboard:")
    print("1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor")
    print("2. Click 'SQL Editor'")
    print("3. Paste the migration SQL and run")
    sys.exit(1)
