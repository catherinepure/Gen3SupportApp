#!/usr/bin/env python3
"""
Deploy database migration directly via Supabase REST API
"""
import os
import sys
import requests
from pathlib import Path
from dotenv import load_dotenv

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

# Extract the database URL from SUPABASE_URL
# Format: https://PROJECT_REF.supabase.co
project_ref = SUPABASE_URL.split('//')[1].split('.')[0]

print("=" * 80)
print("Deploying Secure Activation Codes Migration")
print("=" * 80)
print(f"\nProject: {project_ref}")
print(f"Migration: {migration_file.name}\n")

# Use Supabase's database API endpoint
db_url = f"{SUPABASE_URL}/rest/v1/rpc/exec"

headers = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
}

# Split into statements and execute
statements = []
current = []

for line in migration_sql.split('\n'):
    if line.strip() and not line.strip().startswith('--'):
        current.append(line)
        if ';' in line:
            statements.append('\n'.join(current))
            current = []

print(f"Executing {len(statements)} SQL statements...\n")

# Try using the SQL query endpoint if available
# Alternative: Use psycopg2 or asyncpg directly
import psycopg2
from urllib.parse import urlparse

# Build connection string
# Supabase connection format: postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres
password = os.getenv('SUPABASE_DB_PASSWORD') or input("Enter Supabase database password: ")
conn_string = f"postgresql://postgres:{password}@db.{project_ref}.supabase.co:5432/postgres"

try:
    print("Connecting to database...")
    conn = psycopg2.connect(conn_string)
    conn.autocommit = True
    cursor = conn.cursor()

    print("✅ Connected!\n")
    print("Executing migration...\n")

    # Execute the full migration
    cursor.execute(migration_sql)

    print("✅ Migration executed successfully!\n")

    # Verify
    print("Verifying columns added...")
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'distributors'
        AND column_name LIKE 'activation_code%'
        ORDER BY column_name
    """)

    cols = cursor.fetchall()
    print(f"\n✅ Found {len(cols)} activation_code columns in distributors table:")
    for col in cols:
        print(f"   - {col[0]}")

    cursor.close()
    conn.close()

    print("\n" + "=" * 80)
    print("🎉 Migration deployed successfully!")
    print("=" * 80)
    print("\nNext steps:")
    print("1. Deploy Edge Functions (see DEPLOY_INSTRUCTIONS.txt)")
    print("2. Upload web admin files")
    print("3. Test the implementation")

except psycopg2.Error as e:
    print(f"\n❌ Database error: {e}")
    print("\nTrying alternative method via Supabase API...")
    print("Please use the manual deployment method in DEPLOY_INSTRUCTIONS.txt")
    sys.exit(1)
except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nPlease use the manual deployment method in DEPLOY_INSTRUCTIONS.txt")
    sys.exit(1)
