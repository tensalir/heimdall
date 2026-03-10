import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_KEY!

console.log('SUPABASE_URL:', url ? '(set)' : '(missing)')
console.log('SUPABASE_SERVICE_KEY:', key ? '(set)' : '(missing)')
console.log('')

const sb = createClient(url, key)

async function main() {
  const tables = ['comment_files', 'comments', 'comment_summaries']
  for (const t of tables) {
    const { data, error } = await sb.from(t).select('*').limit(1)
    if (error) {
      console.log(`${t}: ERROR - ${error.message}`)
    } else {
      console.log(`${t}: OK (${data.length} rows)`)
    }
  }
  console.log('\nSupabase connection: SUCCESS')
}

main().catch((e) => {
  console.error('Connection failed:', e.message)
  process.exit(1)
})
