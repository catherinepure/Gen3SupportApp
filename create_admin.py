#!/usr/bin/env python3
"""
Quick script to create a manufacturer_admin user
"""
import hashlib
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('admin-tool/.env')

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY')

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in admin-tool/.env")
    exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# Admin credentials
email = "admin@pure.com"
password = "admin123"  # Change this after first login!

# Hash password (SHA-256, matching the login function)
password_hash = hashlib.sha256(password.encode()).hexdigest()

print(f"Creating admin user: {email}")
print(f"Password: {password}")
print(f"Hash: {password_hash[:20]}...")

try:
    # Check if user already exists
    existing = sb.table('users').select('id, email').eq('email', email).execute()

    if existing.data:
        print(f"\n✗ User {email} already exists!")
        user_id = existing.data[0]['id']

        # Update to admin
        print(f"Updating user to manufacturer_admin role...")
        sb.table('users').update({
            'user_level': 'admin',
            'roles': ['manufacturer_admin'],
            'is_verified': True,
            'is_active': True
        }).eq('id', user_id).execute()

        print(f"✓ Updated {email} to manufacturer_admin")
    else:
        # Create new admin user
        result = sb.table('users').insert({
            'email': email,
            'password_hash': password_hash,
            'user_level': 'admin',
            'roles': ['manufacturer_admin'],
            'first_name': 'Pure',
            'last_name': 'Admin',
            'is_verified': True,
            'is_active': True,
            'home_country': 'GB',
            'current_country': 'GB'
        }).execute()

        print(f"✓ Created admin user: {email}")
        print(f"  Password: {password}")
        print(f"  Role: manufacturer_admin")
        print(f"\nIMPORTANT: Change the password after first login!")

except Exception as e:
    print(f"✗ Error: {e}")
    exit(1)
