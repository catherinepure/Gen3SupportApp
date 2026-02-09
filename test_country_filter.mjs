// Test country filter for users endpoint
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMDgwNTQsImV4cCI6MjA4NTc4NDA1NH0.2ynyxaEFpGDr8c1U0pETk8M82LWHI-NJHY03x8a_6v4'

async function testCountryFilter() {
  console.log('Testing country filter...\n')

  // Step 1: Login as manufacturer admin
  console.log('1. Logging in as admin@pure.com...')
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

  if (!loginData.success) {
    console.error('❌ Login failed:', loginData.error)
    return
  }

  const sessionToken = loginData.session_token
  console.log('✅ Logged in successfully')
  console.log(`   Session token: ${sessionToken.substring(0, 20)}...\n`)

  // Step 2: Test users list WITHOUT country filter
  console.log('2. Fetching ALL users (no country filter)...')
  const allUsersResponse = await fetch(`${supabaseUrl}/functions/v1/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      resource: 'users',
      action: 'list',
      limit: 100,
      offset: 0
    })
  })

  const allUsersData = await allUsersResponse.json()
  const allUsers = allUsersData.users || []
  console.log(`✅ Found ${allUsers.length} total users`)

  // Count by country
  const countryCounts = {}
  allUsers.forEach(u => {
    const country = u.home_country || 'NULL'
    countryCounts[country] = (countryCounts[country] || 0) + 1
  })

  console.log('   Users by country:')
  Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
    console.log(`     ${country}: ${count}`)
  })
  console.log()

  // Step 3: Test users list WITH country filter (GB)
  console.log('3. Fetching users with home_country=GB filter...')
  const gbUsersResponse = await fetch(`${supabaseUrl}/functions/v1/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      resource: 'users',
      action: 'list',
      home_country: 'GB',
      limit: 100,
      offset: 0
    })
  })

  const gbUsersData = await gbUsersResponse.json()
  const gbUsers = gbUsersData.users || []
  console.log(`✅ Found ${gbUsers.length} GB users`)

  if (gbUsers.length > 0) {
    console.log('   Sample GB users:')
    gbUsers.slice(0, 5).forEach(u => {
      console.log(`     - ${u.email} (country: ${u.home_country})`)
    })
  }
  console.log()

  // Step 4: Test users list WITH country filter (US)
  console.log('4. Fetching users with home_country=US filter...')
  const usUsersResponse = await fetch(`${supabaseUrl}/functions/v1/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${sessionToken}`
    },
    body: JSON.stringify({
      resource: 'users',
      action: 'list',
      home_country: 'US',
      limit: 100,
      offset: 0
    })
  })

  const usUsersData = await usUsersResponse.json()
  const usUsers = usUsersData.users || []
  console.log(`✅ Found ${usUsers.length} US users`)

  if (usUsers.length > 0) {
    console.log('   Sample US users:')
    usUsers.slice(0, 5).forEach(u => {
      console.log(`     - ${u.email} (country: ${u.home_country})`)
    })
  }
  console.log()

  // Step 5: Verify filtering worked
  console.log('=== VERIFICATION ===')
  if (allUsers.length > gbUsers.length && allUsers.length > usUsers.length) {
    console.log('✅ Country filter is WORKING:')
    console.log(`   Total users: ${allUsers.length}`)
    console.log(`   GB users: ${gbUsers.length}`)
    console.log(`   US users: ${usUsers.length}`)
    console.log(`   Filtered out: ${allUsers.length - gbUsers.length - usUsers.length} users`)
  } else {
    console.log('❌ Country filter NOT working:')
    console.log(`   Total users: ${allUsers.length}`)
    console.log(`   GB users: ${gbUsers.length}`)
    console.log(`   US users: ${usUsers.length}`)
    console.log('   Expected GB and US to be less than total')
  }

  // Check if any non-GB users in GB results
  const nonGbInResults = gbUsers.filter(u => u.home_country !== 'GB')
  if (nonGbInResults.length > 0) {
    console.log(`\n⚠️  WARNING: Found ${nonGbInResults.length} non-GB users in GB filter results!`)
    nonGbInResults.slice(0, 3).forEach(u => {
      console.log(`   - ${u.email} has country: ${u.home_country}`)
    })
  }
}

testCountryFilter().catch(console.error)
