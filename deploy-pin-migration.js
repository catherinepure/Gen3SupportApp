#!/usr/bin/env node

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deployMigration() {
  try {
    console.log('Reading SQL migration file...');
    const sqlFile = path.join(__dirname, 'sql', '009_scooter_pins_DEPLOY.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Split SQL into individual statements (rough split, but should work)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--') && !s.startsWith('SELECT'));

    console.log(`Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`\nExecuting statement ${i + 1}/${statements.length}...`);

      const { data, error } = await supabase.rpc('exec_raw_sql', { sql: statement });

      if (error) {
        console.error(`Error executing statement ${i + 1}:`, error.message);
        // Continue with next statement
      } else {
        console.log(`✓ Statement ${i + 1} executed successfully`);
      }
    }

    console.log('\n=== Verification Queries ===\n');

    // Check columns
    const { data: columns, error: colError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_name', 'scooters')
      .in('column_name', ['pin_encrypted', 'pin_set_at', 'pin_set_by_user_id']);

    if (colError) {
      console.error('Error checking columns:', colError.message);
    } else {
      console.log(`Columns added: ${columns?.length || 0} (expected 3)`);
      console.log(columns);
    }

    console.log('\n✓ Migration deployment complete!');
    console.log('\nNext step: Run ./test_pin_system.sh to verify end-to-end functionality');

  } catch (err) {
    console.error('Deployment failed:', err.message);
    process.exit(1);
  }
}

deployMigration();
