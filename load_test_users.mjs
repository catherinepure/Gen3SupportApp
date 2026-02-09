// Load territory test users into Supabase database
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s'

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🚀 Loading territory test users into database...\n')

// Helper to execute SQL via Supabase RPC
async function executeSql(sql) {
  // Use Supabase REST API to execute raw SQL
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ query: sql })
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`SQL execution failed: ${response.status} ${text}`)
  }

  return response
}

// Load users one by one using direct inserts
async function loadUsers() {
  try {
    // 1. Manufacturer Admin
    console.log('1. Creating manufacturer admin (admin@pure.com)...')
    const { error: e1 } = await supabase.from('users').upsert({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'admin@pure.com',
      password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
      first_name: 'Admin',
      last_name: 'Pure',
      user_level: 'admin',
      roles: ['manufacturer_admin'],
      home_country: 'GB',
      current_country: 'GB',
      is_verified: true,
      is_active: true,
      created_at: new Date(Date.now() - 500 * 86400000).toISOString(),
      last_login: new Date(Date.now() - 3600000).toISOString()
    }, { onConflict: 'email' })

    if (e1) {
      console.error('   ❌ Error:', e1.message)
    } else {
      console.log('   ✅ Created')
    }

    // 2. Distributor Staff - UK
    console.log('2. Creating distributor staff UK (dist-uk@pure.com)...')
    const { error: e2 } = await supabase.from('users').upsert({
      id: '22222222-2222-2222-2222-222222222222',
      email: 'dist-uk@pure.com',
      password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
      first_name: 'Emma',
      last_name: 'Davies',
      user_level: 'distributor',
      roles: ['distributor_staff'],
      distributor_id: 'd1000000-0000-0000-0000-000000000001',
      home_country: 'GB',
      current_country: 'GB',
      is_verified: true,
      is_active: true,
      created_at: new Date(Date.now() - 400 * 86400000).toISOString(),
      last_login: new Date(Date.now() - 7200000).toISOString()
    }, { onConflict: 'email' })

    if (e2) {
      console.error('   ❌ Error:', e2.message)
    } else {
      console.log('   ✅ Created')
    }

    // 3. Distributor Staff - US
    console.log('3. Creating distributor staff US (dist-us@pure.com)...')
    const { error: e3 } = await supabase.from('users').upsert({
      id: '33333333-3333-3333-3333-333333333333',
      email: 'dist-us@pure.com',
      password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
      first_name: 'Sarah',
      last_name: 'Johnson',
      user_level: 'distributor',
      roles: ['distributor_staff'],
      distributor_id: 'd1000000-0000-0000-0000-000000000002',
      home_country: 'US',
      current_country: 'US',
      is_verified: true,
      is_active: true,
      created_at: new Date(Date.now() - 350 * 86400000).toISOString(),
      last_login: new Date(Date.now() - 10800000).toISOString()
    }, { onConflict: 'email' })

    if (e3) {
      console.error('   ❌ Error:', e3.message)
    } else {
      console.log('   ✅ Created')
    }

    // 4. Workshop Staff - London (linked to UK distributor)
    console.log('4. Creating workshop staff London (workshop-london@pure.com)...')
    const { error: e4 } = await supabase.from('users').upsert({
      id: '44444444-4444-4444-4444-444444444444',
      email: 'workshop-london@pure.com',
      password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
      first_name: 'George',
      last_name: 'Evans',
      user_level: 'maintenance',
      roles: ['workshop_staff'],
      workshop_id: 'ee100000-0000-0000-0000-000000000001',
      home_country: 'GB',
      current_country: 'GB',
      is_verified: true,
      is_active: true,
      created_at: new Date(Date.now() - 300 * 86400000).toISOString(),
      last_login: new Date(Date.now() - 14400000).toISOString()
    }, { onConflict: 'email' })

    if (e4) {
      console.error('   ❌ Error:', e4.message)
    } else {
      console.log('   ✅ Created')
    }

    // 5. Create independent workshop first
    console.log('5. Creating independent workshop NYC...')
    const { error: we } = await supabase.from('workshops').upsert({
      id: 'ee100000-0000-0000-0000-000000000099',
      name: 'Independent Scooter Shop NYC',
      phone: '+1 555-0299',
      email: 'shop@indyscooter-nyc.example.com',
      parent_distributor_id: null,
      service_area_countries: ['US'],
      is_active: true,
      created_at: new Date(Date.now() - 200 * 86400000).toISOString()
    }, { onConflict: 'id' })

    if (we) {
      console.error('   ❌ Error:', we.message)
    } else {
      console.log('   ✅ Created')
    }

    // 6. Workshop Staff - Independent NYC
    console.log('6. Creating workshop staff independent (workshop-indie@pure.com)...')
    const { error: e5 } = await supabase.from('users').upsert({
      id: '55555555-5555-5555-5555-555555555555',
      email: 'workshop-indie@pure.com',
      password_hash: 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f',
      first_name: 'Mike',
      last_name: 'Rodriguez',
      user_level: 'maintenance',
      roles: ['workshop_staff'],
      workshop_id: 'ee100000-0000-0000-0000-000000000099',
      home_country: 'US',
      current_country: 'US',
      is_verified: true,
      is_active: true,
      created_at: new Date(Date.now() - 250 * 86400000).toISOString(),
      last_login: new Date(Date.now() - 18000000).toISOString()
    }, { onConflict: 'email' })

    if (e5) {
      console.error('   ❌ Error:', e5.message)
    } else {
      console.log('   ✅ Created')
    }

    console.log('\n✅ All territory test users loaded successfully!')
    console.log('\nTest accounts (password: password123):')
    console.log('  1. admin@pure.com - manufacturer_admin (global access)')
    console.log('  2. dist-uk@pure.com - distributor_staff (GB/IE territory)')
    console.log('  3. dist-us@pure.com - distributor_staff (US territory)')
    console.log('  4. workshop-london@pure.com - workshop_staff (linked to UK)')
    console.log('  5. workshop-indie@pure.com - workshop_staff (independent US)')

  } catch (error) {
    console.error('\n❌ Failed to load users:', error.message)
    throw error
  }
}

loadUsers()
