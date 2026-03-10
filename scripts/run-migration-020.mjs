/**
 * Run migration 020_meta_intelligence.sql against the remote Supabase instance.
 * Uses the management API to execute raw SQL since the JS client doesn't support DDL.
 *
 * Usage: SUPABASE_SERVICE_KEY=... node scripts/run-migration-020.mjs
 */

import { readFileSync } from 'fs'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required.')
  process.exit(1)
}
if (!SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_KEY is required.')
  process.exit(1)
}

const sql = readFileSync('supabase/migrations/020_meta_intelligence.sql', 'utf8')

const statements = sql
  .split(/;\s*$/m)
  .map(s => s.trim())
  .filter(s => s.length > 0 && !s.startsWith('--'))

console.log(`Found ${statements.length} SQL statements to execute.`)

const PGREST_URL = SUPABASE_URL.replace('.supabase.co', '.supabase.co/rest/v1')

async function execSql(statement) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: statement }),
  })
  return res
}

async function execViaPg() {
  const dbUrl = SUPABASE_URL.replace('https://', '')
    .replace('.supabase.co', '')

  const pgUrl = `postgresql://postgres.${dbUrl}:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`

  const projectRef = SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
  console.log('\n--- Migration SQL to run in Supabase SQL Editor ---')
  console.log(`Go to: https://supabase.com/dashboard/project/${projectRef}/sql/new`)
  console.log('Paste the contents of: supabase/migrations/020_meta_intelligence.sql')
  console.log('---\n')
  console.log(sql)
  console.log('\n--- End of SQL ---')
}

console.log('The Supabase JS client cannot run DDL (ALTER TABLE, CREATE TABLE, etc.) directly.')
console.log('Please run the migration via the Supabase SQL Editor.\n')

await execViaPg()
