import { createClient } from '@supabase/supabase-js'

const db = createClient(
  'https://ozmnspzxcatvmubyswni.supabase.co',
  process.env.SUPABASE_SERVICE_KEY,
)

const statements = [
  // 1. Create watchlist table
  `create table if not exists meta_ads_watchlist (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    kind text not null,
    search_term text,
    page_id text,
    page_name text,
    region_code text not null default 'US',
    enabled boolean not null default true,
    is_default boolean not null default false,
    sort_mode text not null default 'longest_running',
    last_synced_at timestamptz,
    last_success_at timestamptz,
    last_error text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,

  // 2. Create followed brands table
  `create table if not exists briefing_followed_brands (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    page_id text not null,
    page_name text not null default '',
    created_at timestamptz not null default now(),
    unique(user_id, page_id)
  )`,

  // 3. Add source attribution columns
  `alter table briefing_source_items add column if not exists page_id text`,
  `alter table briefing_source_items add column if not exists source_query text`,
]

async function tryStatement(label, sql) {
  try {
    // Use a dummy select to test if tables exist
    const { error } = await db.from('meta_ads_watchlist').select('id').limit(1)
    if (!error) {
      console.log(`[${label}] Table already exists or accessible`)
      return true
    }
  } catch {}
  return false
}

// Check if watchlist table exists
const { data: wlCheck, error: wlErr } = await db
  .from('meta_ads_watchlist')
  .select('id')
  .limit(1)

if (wlErr && wlErr.message.includes('does not exist')) {
  console.log('Tables do not exist yet. Please run the migration SQL manually:')
  console.log('  File: supabase/migrations/019_watchlist_and_follows.sql')
  console.log('  Location: Supabase Dashboard > SQL Editor')
  console.log('')
  console.log('Alternatively, paste this into the SQL Editor:')
  console.log('---')
  
  const { readFileSync } = await import('fs')
  const sql = readFileSync('supabase/migrations/019_watchlist_and_follows.sql', 'utf8')
  console.log(sql)
  console.log('---')
} else if (!wlErr) {
  console.log('meta_ads_watchlist table already exists!')
  
  // Check if seed data exists
  const { data: seeds } = await db
    .from('meta_ads_watchlist')
    .select('name')
    .eq('is_default', true)
  
  if (!seeds || seeds.length === 0) {
    console.log('Inserting seed watchlist entries...')
    const { error: insertErr } = await db.from('meta_ads_watchlist').insert([
      { name: 'Sleep', kind: 'use_case', search_term: 'sleep earplugs', region_code: 'US', is_default: true, sort_mode: 'longest_running' },
      { name: 'Focus', kind: 'use_case', search_term: 'focus concentration', region_code: 'US', is_default: true, sort_mode: 'longest_running' },
      { name: 'Lifestyle', kind: 'use_case', search_term: 'noise cancelling lifestyle', region_code: 'US', is_default: true, sort_mode: 'longest_running' },
      { name: 'Trending', kind: 'trending_seed', search_term: 'best ads', region_code: 'US', is_default: true, sort_mode: 'longest_running' },
    ])
    if (insertErr) console.log('Seed insert error:', insertErr.message)
    else console.log('Seeds inserted successfully!')
  } else {
    console.log(`Default watchlist already has ${seeds.length} entries:`, seeds.map(s => s.name).join(', '))
  }
}

// Check source_query column
const { error: sqErr } = await db
  .from('briefing_source_items')
  .select('source_query')
  .limit(1)

if (sqErr && sqErr.message.includes('source_query')) {
  console.log('source_query column missing - needs migration')
} else {
  console.log('source_query column exists')
}

// Check page_id column
const { error: piErr } = await db
  .from('briefing_source_items')
  .select('page_id')
  .limit(1)

if (piErr && piErr.message.includes('page_id')) {
  console.log('page_id column missing on briefing_source_items - needs migration')
} else {
  console.log('page_id column exists on briefing_source_items')
}

console.log('Done.')
