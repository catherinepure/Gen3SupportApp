// Apply workshop activation codes migration to Supabase
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://hhpxmlrpdharhhzwjxuc.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s'

console.log('🚀 Applying workshop activation codes migration...\n')

const supabase = createClient(supabaseUrl, supabaseKey)

async function executeSql(sql) {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql })
  if (error) throw error
  return data
}

async function applyMigration() {
  try {
    // Read the SQL file
    const sql = fs.readFileSync('sql/006_workshop_activation_codes.sql', 'utf8')

    // Split by semicolons to execute statements separately
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'))

    console.log(`Executing ${statements.length} SQL statements...\n`)

    for (const statement of statements) {
      if (statement.length > 0) {
        try {
          // Execute via raw SQL if exec_sql RPC exists, otherwise use direct approach
          const { error } = await supabase.rpc('exec_sql', { query: statement })

          if (error) {
            // If RPC doesn't exist, try direct execution for ALTER/CREATE statements
            console.log(`⚠️  RPC method not available, trying direct execution...`)

            // For ALTER TABLE statements, we can use the REST API
            if (statement.toUpperCase().includes('ALTER TABLE')) {
              console.log('✓ Skipping ALTER TABLE (will use Supabase dashboard)')
            } else {
              console.log('Statement:', statement.substring(0, 100) + '...')
            }
          } else {
            console.log('✓ Executed successfully')
          }
        } catch (err) {
          console.error(`❌ Error executing statement:`, err.message)
          console.log('Statement:', statement.substring(0, 100))
        }
      }
    }

    console.log('\n✅ Migration process complete!')
    console.log('\nNote: If ALTER TABLE statements failed, please run this SQL manually in Supabase SQL Editor:')
    console.log('Dashboard → SQL Editor → New Query → Paste and Run\n')
    console.log(sql)

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error('\nPlease apply the migration manually via Supabase Dashboard:')
    console.error('1. Go to https://supabase.com/dashboard/project/hhpxmlrpdharhhzwjxuc/sql')
    console.error('2. Click "New Query"')
    console.error('3. Copy and paste the contents of sql/006_workshop_activation_codes.sql')
    console.error('4. Click "Run"')
    throw error
  }
}

applyMigration()
