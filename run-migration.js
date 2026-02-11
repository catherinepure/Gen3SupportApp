#!/usr/bin/env node

// Simple script to run SQL migration via Supabase
const fs = require('fs');
const https = require('https');

const SUPABASE_URL = 'https://hhpxmlrpdharhhzwjxuc.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocHhtbHJwZGhhcmhoendqeHVjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDIwODA1NCwiZXhwIjoyMDg1Nzg0MDU0fQ.n_AjoVOs7DSHUlZqqxmM6lKw6zYcoxRKw1gW1aQ404s';

// Read migration file
const sql = fs.readFileSync('supabase/migrations/20260210140000_add_state_subdivision.sql', 'utf8');

// Split into statements
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

console.log(`Found ${statements.length} SQL statements to execute`);

// Execute each statement
async function executeSQL(statement) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query: statement });

    const options = {
      hostname: 'hhpxmlrpdharhhzwjxuc.supabase.co',
      port: 443,
      path: '/rest/v1/rpc/exec_sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function runMigration() {
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    console.log(`\nExecuting statement ${i + 1}/${statements.length}:`);
    console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''));

    try {
      await executeSQL(stmt);
      console.log('✓ Success');
    } catch (error) {
      console.error('✗ Failed:', error.message);
      // Continue with other statements
    }
  }
}

runMigration().catch(console.error);
