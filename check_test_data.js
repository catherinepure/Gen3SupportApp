// Check test data in Supabase database
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s'

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Checking Supabase Database Test Data...\n')

// 1. Check distributors with territory info
console.log('=== DISTRIBUTORS (with territory) ===')
const { data: distributors, error: distError } = await supabase
  .from('distributors')
  .select('id, name, countries')
  .order('name')

if (distError) {
  console.error('❌ Error fetching distributors:', distError.message)
} else if (!distributors || distributors.length === 0) {
  console.log('⚠️  NO DISTRIBUTORS FOUND')
} else {
  console.log(`✅ Found ${distributors.length} distributors:`)
  distributors.forEach(d => {
    console.log(`   - ${d.name}: countries=${JSON.stringify(d.countries || [])}`)
  })
}

// 2. Check workshops with territory info
console.log('\n=== WORKSHOPS (with territory) ===')
const { data: workshops, error: workshopError } = await supabase
  .from('workshops')
  .select('id, name, parent_distributor_id, service_area_countries')
  .order('name')

if (workshopError) {
  console.error('❌ Error fetching workshops:', workshopError.message)
} else if (!workshops || workshops.length === 0) {
  console.log('⚠️  NO WORKSHOPS FOUND')
} else {
  console.log(`✅ Found ${workshops.length} workshops:`)
  workshops.forEach(w => {
    const linked = w.parent_distributor_id ? `Linked to ${w.parent_distributor_id.substring(0, 8)}...` : 'Independent'
    const countries = w.service_area_countries || []
    console.log(`   - ${w.name}: ${linked}, service_area=${JSON.stringify(countries)}`)
  })
}

// 3. Check territory test users
console.log('\n=== TERRITORY TEST USERS ===')
const testEmails = [
  'admin@pure.com',
  'dist-uk@pure.com',
  'dist-us@pure.com',
  'workshop-london@pure.com',
  'workshop-indie@pure.com'
]

const { data: testUsers, error: userError } = await supabase
  .from('users')
  .select('email, roles, user_level, distributor_id, workshop_id, home_country, is_active')
  .in('email', testEmails)
  .order('email')

if (userError) {
  console.error('❌ Error fetching test users:', userError.message)
} else if (!testUsers || testUsers.length === 0) {
  console.log('⚠️  NO TERRITORY TEST USERS FOUND')
  console.log('   Expected emails:', testEmails.join(', '))
} else {
  console.log(`✅ Found ${testUsers.length}/${testEmails.length} territory test users:`)
  testUsers.forEach(u => {
    const role = u.roles?.[0] || u.user_level
    const territory = u.distributor_id ? `dist=${u.distributor_id.substring(0, 8)}...` :
                     u.workshop_id ? `workshop=${u.workshop_id.substring(0, 8)}...` : 'global'
    console.log(`   - ${u.email}: ${role}, ${territory}, country=${u.home_country}`)
  })

  // Show missing users
  const foundEmails = testUsers.map(u => u.email)
  const missingEmails = testEmails.filter(e => !foundEmails.includes(e))
  if (missingEmails.length > 0) {
    console.log(`   ⚠️  Missing: ${missingEmails.join(', ')}`)
  }
}

// 4. Check scooters with country info
console.log('\n=== SCOOTERS (with country) ===')
const { data: scooters, error: scooterError } = await supabase
  .from('scooters')
  .select('country_of_registration')
  .order('country_of_registration')

if (scooterError) {
  console.error('❌ Error fetching scooters:', scooterError.message)
} else if (!scooters || scooters.length === 0) {
  console.log('⚠️  NO SCOOTERS FOUND')
} else {
  // Count by country
  const countryCount = {}
  scooters.forEach(s => {
    const country = s.country_of_registration || 'NULL'
    countryCount[country] = (countryCount[country] || 0) + 1
  })

  console.log(`✅ Found ${scooters.length} scooters by country:`)
  Object.entries(countryCount).sort((a, b) => b[1] - a[1]).forEach(([country, count]) => {
    console.log(`   - ${country}: ${count} scooters`)
  })
}

// 5. Summary
console.log('\n=== SUMMARY ===')
const hasDistributors = distributors && distributors.length > 0
const hasWorkshops = workshops && workshops.length > 0
const hasTestUsers = testUsers && testUsers.length === 5
const hasScooters = scooters && scooters.length > 0

if (hasDistributors && hasWorkshops && hasTestUsers && hasScooters) {
  console.log('✅ ALL TEST DATA PRESENT WITH TERRITORY INFORMATION')
  console.log('\nReady to test territory scoping with:')
  console.log('  1. admin@pure.com (manufacturer_admin - global access)')
  console.log('  2. dist-uk@pure.com (distributor_staff - GB/IE territory)')
  console.log('  3. dist-us@pure.com (distributor_staff - US territory)')
  console.log('  4. workshop-london@pure.com (workshop_staff - linked to UK dist)')
  console.log('  5. workshop-indie@pure.com (workshop_staff - independent US)')
} else {
  console.log('⚠️  MISSING TEST DATA:')
  if (!hasDistributors) console.log('   - Distributors with countries arrays')
  if (!hasWorkshops) console.log('   - Workshops with territory config')
  if (!hasTestUsers) console.log('   - Territory test users (need all 5)')
  if (!hasScooters) console.log('   - Scooters with country_of_registration')
  console.log('\nTo load test data, run:')
  console.log('  1. sql/seed_test_data.sql (distributors, workshops, scooters)')
  console.log('  2. sql/seed_territory_test_users.sql (5 test admin users)')
}
