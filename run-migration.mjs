import { readFileSync } from 'fs';

const sql = readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || readFileSync('../.env', 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)?.[1];
const url = 'https://rksnsohhustvxknbaxko.supabase.co';

// Split SQL into individual statements and run via pg REST
const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

async function runSQL(query) {
  const resp = await fetch(`${url}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  return { status: resp.status, text: await resp.text() };
}

// Try running full SQL via the Supabase query endpoint
async function main() {
  console.log('Attempting migration via Supabase...');
  
  // Try the /pg endpoint (available in newer Supabase)
  try {
    const resp = await fetch(`${url}/pg/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });
    const text = await resp.text();
    console.log(`/pg/query: ${resp.status}`);
    if (resp.ok) {
      console.log('Migration successful!');
      console.log(text);
      return;
    }
    console.log(text);
  } catch (e) {
    console.log(`/pg/query failed: ${e.message}`);
  }

  // Try the SQL endpoint
  try {
    const resp = await fetch(`${url}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        'x-supabase-query': sql
      },
      body: JSON.stringify({})
    });
    console.log(`REST: ${resp.status} ${await resp.text()}`);
  } catch (e) {
    console.log(`REST failed: ${e.message}`);
  }

  console.log('\\nAutomated migration failed. Please run the SQL manually in the Supabase dashboard.');
  console.log('URL: https://supabase.com/dashboard/project/rksnsohhustvxknbaxko/sql/new');
}

main().catch(console.error);
