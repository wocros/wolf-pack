/**
 * sync.js — Pull new emails from Microsoft 365 and save them to Supabase
 *
 * Usage:
 *   node src/email/sync.js
 *
 * How it works:
 *   1. Checks email_cache for the most recent received_at timestamp
 *   2. Fetches all emails received after that timestamp from the Graph API
 *   3. Upserts them into email_cache (skips duplicates by m365_message_id)
 *   4. Logs how many were fetched and saved, then exits
 *
 * On the very first run (empty table) it fetches the last 50 emails with no
 * date filter, giving you an initial backfill.
 *
 * This script uses the service role key, which bypasses RLS.
 * Never run this in the browser.
 */

import 'dotenv/config'
import { supabase } from '../db/server-client.js'
import { fetchNewEmails } from './graph-client.js'

// =============================================================================
// MAIN
// =============================================================================

async function run() {
  console.log('=== BPM Email Sync ===')
  console.log('Started:', new Date().toLocaleString())
  console.log('')

  try {
    // Step 1 — Find the most recent email we already have, so we know where to start
    const { data: latest, error: latestErr } = await supabase
      .from('email_cache')
      .select('received_at')
      .order('received_at', { ascending: false })
      .limit(1)
      .single()

    // PGRST116 = no rows found — that's fine on first run
    if (latestErr && latestErr.code !== 'PGRST116') {
      throw new Error('Could not query email_cache: ' + latestErr.message)
    }

    const since = latest?.received_at ?? null

    if (since) {
      console.log('Fetching emails received after:', since)
    } else {
      console.log('No existing emails found. Fetching the 50 most recent emails...')
    }

    // Step 2 — Fetch from Graph API
    const emails = await fetchNewEmails(since)
    console.log(`Fetched ${emails.length} email(s) from Microsoft 365.`)

    if (emails.length === 0) {
      console.log('Nothing to save. All caught up.')
      console.log('')
      return
    }

    // Step 3 — Upsert into email_cache
    // ON CONFLICT (m365_message_id) DO NOTHING — so re-running is always safe
    const { data: upserted, error: upsertErr } = await supabase
      .from('email_cache')
      .upsert(emails, {
        onConflict:        'm365_message_id',
        ignoreDuplicates:  true
      })
      .select('id')

    if (upsertErr) {
      throw new Error('Could not save emails to Supabase: ' + upsertErr.message)
    }

    const savedCount = upserted?.length ?? 0

    // Step 4 — Report results
    console.log(`Saved ${savedCount} new email(s) to the database.`)

    if (emails.length > savedCount) {
      console.log(`Skipped ${emails.length - savedCount} duplicate(s) already in the database.`)
    }

    console.log('')
    console.log('Sync complete:', new Date().toLocaleString())

  } catch (err) {
    console.error('')
    console.error('Sync failed:', err.message || String(err))
    console.error('')
    process.exit(1)
  }
}

run()
