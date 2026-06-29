import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file')
}

// Server-side client — uses the service role key, which bypasses RLS.
// NEVER use this key in the browser or dashboard.html.
// Only import this from Node.js scripts (run-checks.js, ingest-bill.js, etc.)
export const supabase = createClient(supabaseUrl, supabaseServiceKey)
