#!/usr/bin/env python3
"""
Apply the secure activation codes migration to Supabase
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
    print("Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in admin-tool/.env")
    sys.exit(1)

# Read migration SQL
migration_file = Path('supabase/migrations/20260209000002_secure_activation_codes.sql')
if not migration_file.exists():
    print(f"Error: Migration file not found: {migration_file}")
    sys.exit(1)

migration_sql = migration_file.read_text()

# Create Supabase client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("Applying migration: 20260209000002_secure_activation_codes.sql")
print("=" * 80)

try:
    # Execute migration SQL
    # Note: Supabase Python client doesn't have direct SQL execution
    # We'll need to use the REST API or PostgreSQL connection
    print("\nMigration SQL ready to apply:")
    print(migration_sql)
    print("\n" + "=" * 80)
    print("\n⚠️  Please apply this migration manually via Supabase Dashboard:")
    print("1. Go to: https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/editor")
    print("2. Click 'SQL Editor'")
    print("3. Copy the SQL from above")
    print("4. Paste and run it")
    print("\nOr use the Supabase CLI:")
    print("  supabase db push")

except Exception as e:
    print(f"\nError: {e}")
    sys.exit(1)
