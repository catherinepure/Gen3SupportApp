import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s'

const supabase = createClient(supabaseUrl, supabaseServiceKey)

console.log('🔍 Checking workshops table directly...\n')

const { data: workshops, error } = await supabase
  .from('workshops')
  .select('id, name, activation_code')
  .limit(10)

if (error) {
  console.error('Error:', error)
} else {
  console.log('Workshops:')
  workshops.forEach(w => {
    console.log(`  • ${w.name}: ${w.activation_code || '❌ NO CODE'}`)
  })
}

const { data: distributors, error: distError } = await supabase
  .from('distributors')
  .select('id, name, activation_code')
  .limit(10)

if (distError) {
  console.error('Error:', distError)
} else {
  console.log('\nDistributors:')
  distributors.forEach(d => {
    console.log(`  • ${d.name}: ${d.activation_code || '❌ NO CODE'}`)
  })
}

console.log('\n✅ Check complete!')
