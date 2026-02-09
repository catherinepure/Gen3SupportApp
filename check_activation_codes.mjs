// Verify activation codes were applied to workshops
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwNTQsImV4cCI6MjA4NTc4NDA1NH0.w_9rkrz6Mw12asETIAk7jenY-yjVVxrLeWz642k3PVM'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

console.log('🔍 Checking activation codes...\n')

// Login as admin first
const loginResponse = await fetch(`${supabaseUrl}/functions/v1/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey
  },
  body: JSON.stringify({
    email: 'admin@pure.com',
    password: 'password123'
  })
})

const loginData = await loginResponse.json()
const sessionToken = loginData.session_token

// Get distributors
console.log('📋 Checking Distributors:')
const distResponse = await fetch(`${supabaseUrl}/functions/v1/admin`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey
  },
  body: JSON.stringify({
    session_token: sessionToken,
    resource: 'distributors',
    action: 'list',
    limit: 10
  })
})

const distData = await distResponse.json()
const distributors = distData.distributors || []

distributors.forEach(d => {
  console.log(`  • ${d.name}: ${d.activation_code || '❌ NO CODE'}`)
})

// Get workshops
console.log('\n🔧 Checking Workshops:')
const workshopResponse = await fetch(`${supabaseUrl}/functions/v1/admin`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': supabaseAnonKey
  },
  body: JSON.stringify({
    session_token: sessionToken,
    resource: 'workshops',
    action: 'list',
    limit: 10
  })
})

const workshopData = await workshopResponse.json()
const workshops = workshopData.workshops || []

workshops.forEach(w => {
  console.log(`  • ${w.name}: ${w.activation_code || '❌ NO CODE'}`)
})

console.log('\n✅ Verification complete!')
