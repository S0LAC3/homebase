import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const url = 'https://rksnsohhustvxknbaxko.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrc25zb2hodXN0dnhrbmJheGtvIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzYxMDU4MSwiZXhwIjoyMDg5MTg2NTgxfQ._TYcecG_RVVGKy10rVm9j5R4zR77mEE7v1NhR69K4v0';

const supabase = createClient(url, key);
const sql = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');

// Split into individual statements
const statements = sql
  .replace(/--[^\n]*/g, '') // remove comments
  .split(/;\s*\n/)
  .map(s => s.trim())
  .filter(s => s.length > 5);

console.log(`Found ${statements.length} statements to run`);

let success = 0;
let failed = 0;

for (const stmt of statements) {
  const shortStmt = stmt.substring(0, 80).replace(/\n/g, ' ');
  const { data, error } = await supabase.rpc('exec_sql', { query: stmt + ';' });
  if (error) {
    // Try via raw SQL endpoint
    const resp = await fetch(`${url}/rest/v1/rpc/`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'exec_sql', params: { query: stmt + ';' } })
    });
    if (!resp.ok) {
      console.log(`SKIP: ${shortStmt}... (${error.message || resp.status})`);
      failed++;
    } else {
      console.log(`OK: ${shortStmt}...`);
      success++;
    }
  } else {
    console.log(`OK: ${shortStmt}...`);
    success++;
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} failed`);
console.log('Note: If statements failed, you may need to run the SQL in the Supabase dashboard SQL editor.');
