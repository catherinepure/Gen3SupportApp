#!/usr/bin/env python3
"""
Apply migration by checking if it's needed, then provide manual instructions
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load environment
load_dotenv('admin-tool/.env')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
    sys.exit(1)

# Create client
supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

print("=" * 80)
print("Checking Migration Status")
print("=" * 80)

# Check if columns exist
try:
    result = supabase.table('distributors').select('activation_code_hash').limit(1).execute()
    print("✅ distributors.activation_code_hash exists")
    dist_exists = True
except Exception as e:
    print("❌ distributors.activation_code_hash not found")
    dist_exists = False

try:
    result = supabase.table('workshops').select('activation_code_hash').limit(1).execute()
    print("✅ workshops.activation_code_hash exists")
    work_exists = True
except Exception as e:
    print("❌ workshops.activation_code_hash not found")
    work_exists = False

if dist_exists and work_exists:
    print("\n✅ Migration already applied!")
    sys.exit(0)

print("\n⚠️  Migration must be applied via Supabase Dashboard:")
print("\nSee: DEPLOY_INSTRUCTIONS.txt for step-by-step guide")
print("\n" + "=" * 80)
