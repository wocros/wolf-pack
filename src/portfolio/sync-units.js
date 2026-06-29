/**
 * sync-units.js — Sync ALL portfolio units from AppFolio into the `units` table.
 *
 * Run:  node src/portfolio/sync-units.js
 *
 * This populates the `units` table used by the Morning Pulse KPI cards:
 *   - Occupancy % (occupied / total)
 *   - Vacancy $ lost this month (market_rent × days vacant)
 *
 * Env vars required (same as sync-turnovers.js):
 *   APPFOLIO_CLIENT_ID
 *   APPFOLIO_CLIENT_SECRET
 *   APPFOLIO_SUBDOMAIN   (e.g. "bpmsd" for bpmsd.appfolio.com)
 */

import 'dotenv/config'
import { supabase } from '../db/server-client.js'

const CLIENT_ID     = process.env.APPFOLIO_CLIENT_ID
const CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET
const SUBDOMAIN     = process.env.APPFOLIO_SUBDOMAIN
const BASE_URL      = SUBDOMAIN ? `https://${SUBDOMAIN}.appfolio.com` : null

// AppFolio Reports API uses HTTP Basic Auth — no token endpoint needed.
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

// ============================================================================
// FETCH — paginated, Basic Auth
// ============================================================================
async function fetchAllPages(path, params = {}) {
  const results = []
  let pageCursor = 1
  while (true) {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries({ ...params, page: pageCursor, per_page: 100 })) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Basic ${BASIC_AUTH}`,
        Accept: 'application/json',
      },
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`AppFolio GET ${path} failed (${res.status}):\n${body.slice(0, 500)}`)
    }
    const data  = await res.json()
    const items = Array.isArray(data)
      ? data
      : data.results || data.data || data.units || data[Object.keys(data).find(k => Array.isArray(data[k]))] || []
    if (items.length === 0) break
    results.push(...items)
    if (items.length < 100) break
    pageCursor++
  }
  return results
}

// ============================================================================
// MAP — AppFolio unit → units table row
//
// AppFolio field names vary by API version. We try the most common ones
// and fall back to null. The full raw record is stored in raw_payload so
// you can always derive additional fields later with SQL without re-syncing.
// ============================================================================
function mapUnit(u, runStamp) {
  const unitId = String(u.id || u.unit_id || '')

  // --- Occupancy status ---
  // AppFolio may expose this as is_vacant (boolean), occupancy_status (string),
  // or lease_status (string). We try each in order.
  let status = 'unknown'
  if (typeof u.is_vacant === 'boolean') {
    status = u.is_vacant ? 'vacant' : 'occupied'
  } else if (u.occupancy_status || u.status) {
    const raw = (u.occupancy_status || u.status || '').toLowerCase()
    if (raw.includes('vacant'))   status = 'vacant'
    else if (raw.includes('notice'))   status = 'notice'
    else if (raw.includes('leased') && !raw.includes('occupied')) status = 'leased_not_occupied'
    else if (raw.includes('occupied') || raw.includes('rented'))  status = 'occupied'
  }

  // --- Market rent ---
  // Try the most common field names AppFolio uses across API versions.
  const rawRent = u.market_rent ?? u.rent_amount ?? u.rent ?? u.advertised_rent ?? u.monthly_rent ?? null
  const marketRent = rawRent !== null ? parseFloat(rawRent) : null

  // --- Vacant since date ---
  // Use last_lease_end_date if the unit is vacant; leave null for occupied units.
  const vacantSince = status === 'vacant'
    ? (u.last_lease_end_date || u.vacancy_start_date || null)
    : null

  return {
    appfolio_unit_id: unitId,
    property_name:    u.property_name || u.address || u.building_name || 'Unknown Property',
    unit_number:      u.unit_number   || u.name    || u.unit_name     || '',
    market_rent:      marketRent,
    status,
    vacant_since:     vacantSince,
    raw_payload:      u,
    last_synced_at:   runStamp,
  }
}

// ============================================================================
// MAIN SYNC
// ============================================================================
async function sync() {
  if (!CLIENT_ID || !CLIENT_SECRET || !SUBDOMAIN) {
    console.error(
      'Missing required environment variables. Add to your .env:\n\n' +
      '  APPFOLIO_CLIENT_ID=...\n' +
      '  APPFOLIO_CLIENT_SECRET=...\n' +
      '  APPFOLIO_SUBDOMAIN=bpmsd\n'
    )
    process.exit(1)
  }

  const runStamp = new Date().toISOString()
  console.log(`sync-units starting at ${runStamp}`)
  console.log(`Connecting to AppFolio (${BASE_URL})...`)

  // Verify credentials work by fetching first page
  console.log('Fetching all units...')
  const units = await fetchAllPages('/api/v1/units')
  console.log(`  ${units.length} units found\n`)

  if (units.length === 0) {
    console.warn(
      'AppFolio returned 0 units. Possible causes:\n' +
      '  - The /api/v1/units endpoint path is different for your account\n' +
      '  - Your API credentials do not have read access to units\n' +
      '  - Try running sync-turnovers.js first to confirm the connection works\n'
    )
    process.exit(0)
  }

  // Map and validate
  const rows = units
    .map(u => mapUnit(u, runStamp))
    .filter(r => r.appfolio_unit_id)  // skip any without an ID

  // Print field discovery info so you can verify mappings on first run
  const sample = rows[0]
  console.log('Sample unit mapping (verify these look correct):')
  console.log(`  appfolio_unit_id: ${sample.appfolio_unit_id}`)
  console.log(`  property_name:    ${sample.property_name}`)
  console.log(`  unit_number:      ${sample.unit_number}`)
  console.log(`  status:           ${sample.status}`)
  console.log(`  market_rent:      ${sample.market_rent ?? '(not found — check raw_payload)'}`)
  console.log(`  vacant_since:     ${sample.vacant_since ?? 'null'}\n`)

  // Upsert in batches of 50
  let synced = 0
  let errors = 0
  const BATCH = 50

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase
      .from('units')
      .upsert(batch, { onConflict: 'appfolio_unit_id' })

    if (error) {
      console.error(`  Batch ${Math.floor(i / BATCH) + 1} error: ${error.message}`)
      errors += batch.length
    } else {
      synced += batch.length
    }
  }

  // Summary
  const byStatus = {}
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1
  }
  const withRent = rows.filter(r => r.market_rent !== null).length

  console.log('=== Sync Complete ===')
  console.log(`Units synced:      ${synced}`)
  console.log(`Units with rent:   ${withRent} / ${synced}`)
  if (errors > 0) console.log(`Errors:            ${errors} (see messages above)`)
  console.log('\nStatus breakdown:')
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`)

  if (withRent === 0) {
    console.log(
      '\nNOTE: No market rent was found in any unit record.\n' +
      '  The vacancy cost card will show $0 until rent data is available.\n' +
      '  Look at raw_payload in the units table to find the correct field name,\n' +
      '  then update the mapUnit() function in this file.\n' +
      '  Query to check: SELECT raw_payload FROM units LIMIT 1;\n'
    )
  }
}

sync().catch(err => {
  console.error('\nSync failed:', err.message)
  process.exit(1)
})
