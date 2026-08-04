import { supabase } from './client.js'

const { error } = await supabase.from('_test').select('*').limit(1)

// "table not found" errors mean the connection worked — the database just has no tables yet
const connected = !error || error.message.includes('schema cache') || error.code === 'PGRST116' || error.code === '42P01'

if (connected) {
  console.log('Supabase connection successful. Database is ready.')
} else {
  console.error('Connection failed:', error.message)
  process.exit(1)
}
