/**
 * sync-owners.js — Sync property owners from AppFolio into the `owners` table
 *                  and their property associations into `owner_properties`.
 *
 * Run:  node src/portfolio/sync-owners.js
 *       npm run sync:owners
 *
 * This populates the data behind the Owner Health Score dashboard.
 *
 * Env vars required (same as other AppFolio syncs):
 *   APPFOLIO_CLIENT_ID
 *   APPFOLIO_CLIENT_SECRET
 *   APPFOLIO_SUBDOMAIN
 */

import 'dotenv/config'
import { supabase } from '../db/server-client.js'

const CLIENT_ID     = process.env.APPFOLIO_CLIENT_ID
const CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET
const SUBDOMAIN     = process.env.APPFOLIO_SUBDOMAIN
const BASE_URL      = SUBDOMAIN ? `https://${SUBDOMAIN}.appfolio.com` : null
const TOKEN_PATH    = process.env.APPFOLIO_TOKEN_PATH || '/api/v1/session'

// ============================================================================
// AUTH
// ============================================================================
async function getToken() {
  const res = await fetch(`${BASE_URL}${TOKEN_PATH}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', client_id: CLIENT_ID, client_secret: CLIENT_SECRET }),
  })
  if (!res.ok) throw new Error(`AppFolio auth failed (${res.status}): ${await res.text()}`)
  const data  = await res.json()
  const token = data.access_token || data.token
  if (!token) throw new Error(`AppFolio token missing access_token: ${JSON.stringify(data)}`)
  return token
}

// ============================================================================
// FETCH — paginated
// ============================================================================
async function fetchAllPages(token, path, params = {}) {
  const results = []
  let page = 1
  while (true) {
    const url = new URL(`${BASE_URL}${path}`)
    for (const [k, v] of Object.entries({ ...params, page, per_page: 100 })) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`AppFolio GET ${path} failed (${res.status}): ${await res.text()}`)
    const data  = await res.json()
    const items = Array.isArray(data)
      ? data
      : data.results || data.data || data[Object.keys(data).find(k => Array.isArray(data[k]))] || []
    if (items.length === 0) break
    results.push(...items)
    if (items.length < 100) break
    page++
  }
  return results
}

// ============================================================================
// MAP owner record → owners table row
//
// AppFolio owner field names vary. We try the most common ones.
// ============================================================================
function mapOwner(raw, runStamp) {
  const id    = String(raw.id || raw.owner_id || '')
  const name  = raw.name
    || [raw.first_name, raw.last_name].filter(Boolean).join(' ')
    || raw.display_name
    || 'Unknown'
  const email = raw.email || raw.email_address || raw.primary_email || null
  const phone = raw.phone || raw.phone_number  || raw.primary_phone  || null

  return {
    appfolio_owner_id: id,
    name,
    email: email ? email.toLowerCase().trim() : null,
    phone,
    raw_payload:   raw,
    last_synced_at: runStamp,
  }
}

// ============================================================================
// EXTRACT property names from an owner record.
//
// AppFolio embeds property info differently across versions.
// We try every known shape and fall back to an empty array.
// After first run, check the console output to verify extraction worked —
// if 0 properties found, look at raw_payload in the owners table to find
// the correct field name and update this function.
// ============================================================================
function extractPropertyNames(raw) {
  const names = new Set()

  const candidates = [
    raw.properties,
    raw.managed_properties,
    raw.portfolio,
    raw.ownership_records,
    raw.ownerships,
  ]

  for (const list of candidates) {
    if (!Array.isArray(list)) continue
    for (const p of list) {
      const n = p?.name || p?.property_name || p?.address || p?.unit_address
      if (n) names.add(String(n).trim())
    }
  }

  // Some versions embed a single property at top level
  const single = raw.property_name || raw.property_address || raw.managed_property
  if (single) names.add(String(single).trim())

  return [...names]
}

// ============================================================================
// MAIN SYNC
// ============================================================================
async function sync() {
  if (!CLIENT_ID || !CLIENT_SECRET || !SUBDOMAIN) {
    console.error(
      'Missing env vars:\n  APPFOLIO_CLIENT_ID\n  APPFOLIO_CLIENT_SECRET\n  APPFOLIO_SUBDOMAIN\n'
    )
    process.exit(1)
  }

  const runStamp = new Date().toISOString()
  console.log(`sync-owners starting at ${runStamp}`)
  console.log(`Connecting to AppFolio (${BASE_URL})...`)
  const token = await getToken()
  console.log('Connected.\n')

  // --- Fetch owners ---
  console.log('Fetching owners...')
  let owners = []
  try {
    owners = await fetchAllPages(token, '/api/v1/owners')
  } catch (err) {
    // Some AppFolio accounts use a different path — try alternate
    console.warn(`  /api/v1/owners failed: ${err.message}`)
    console.log('  Trying /api/v2/owners...')
    try {
      owners = await fetchAllPages(token, '/api/v2/owners')
    } catch (err2) {
      console.error(
        `  Both owner endpoints failed.\n` +
        `  AppFolio may use a different path for your account.\n` +
        `  Check the AppFolio API docs for your subdomain and update TOKEN_PATH in sync-owners.js.\n` +
        `  Error: ${err2.message}`
      )
      process.exit(1)
    }
  }
  console.log(`  ${owners.length} owners found\n`)

  if (owners.length === 0) {
    console.warn(
      'AppFolio returned 0 owners.\n' +
      '  - Confirm your API credentials have read access to owner records\n' +
      '  - Try: curl -H "Authorization: Bearer <token>" ' + BASE_URL + '/api/v1/owners\n'
    )
    process.exit(0)
  }

  // --- Fetch properties (if available) to supplement owner→property mapping ---
  let propertiesByOwnerId = {}
  try {
    console.log('Fetching properties to supplement owner-property mapping...')
    const properties = await fetchAllPages(token, '/api/v1/properties')
    for (const p of properties) {
      const ownerId = String(p.owner_id || p.primary_owner_id || '')
      if (!ownerId) continue
      if (!propertiesByOwnerId[ownerId]) propertiesByOwnerId[ownerId] = []
      const name = p.name || p.property_name || p.address
      if (name) propertiesByOwnerId[ownerId].push(name)
    }
    const withProps = Object.keys(propertiesByOwnerId).length
    console.log(`  ${withProps} owners have properties via /api/v1/properties\n`)
  } catch {
    console.log('  /api/v1/properties not available — using properties embedded in owner records\n')
  }

  // --- Upsert owners ---
  let ownersSynced = 0
  let propertiesSynced = 0
  let ownersWithNoEmail = 0
  let ownersWithNoProperties = 0

  for (const raw of owners) {
    const row     = mapOwner(raw, runStamp)
    if (!row.appfolio_owner_id) continue
    if (!row.email) ownersWithNoEmail++

    const { data: upserted, error } = await supabase
      .from('owners')
      .upsert(row, { onConflict: 'appfolio_owner_id' })
      .select('id')
      .single()

    if (error) {
      console.error(`  ✗ Owner "${row.name}": ${error.message}`)
      continue
    }

    ownersSynced++
    const ownerId = upserted.id

    // Gather property names from all sources
    const fromOwnerRecord = extractPropertyNames(raw)
    const fromPropertiesEndpoint = propertiesByOwnerId[row.appfolio_owner_id] || []
    const allNames = [...new Set([...fromOwnerRecord, ...fromPropertiesEndpoint])]

    if (allNames.length === 0) {
      ownersWithNoProperties++
      continue
    }

    // Upsert owner_properties rows
    for (const propName of allNames) {
      const { error: opErr } = await supabase
        .from('owner_properties')
        .upsert(
          { owner_id: ownerId, property_name: propName },
          { onConflict: 'owner_id,property_name' }
        )
      if (opErr) {
        console.error(`    ✗ Property link "${propName}": ${opErr.message}`)
        continue
      }
      propertiesSynced++
    }
  }

  // --- Summary ---
  console.log('=== Sync Complete ===')
  console.log(`Owners synced:           ${ownersSynced}`)
  console.log(`Property links synced:   ${propertiesSynced}`)

  if (ownersWithNoEmail > 0) {
    console.log(`Owners without email:    ${ownersWithNoEmail}`)
    console.log('  (These owners will have no response-time signal in the health score)')
  }

  if (ownersWithNoProperties > 0) {
    console.log(`\nOwners with no properties found: ${ownersWithNoProperties}`)
    console.log(
      '  The property-to-owner link could not be extracted from AppFolio automatically.\n' +
      '  To fix: check raw_payload in the owners table for the field that lists their properties,\n' +
      '  then update extractPropertyNames() in this file.\n' +
      '  Query: SELECT name, raw_payload FROM owners LIMIT 3;\n'
    )
  }

  if (propertiesSynced === 0) {
    console.log(
      '\nIMPORTANT: No owner-property links were created.\n' +
      '  Owner Health Scores require knowing which properties each owner has.\n' +
      '  Run: SELECT appfolio_owner_id, name, raw_payload FROM owners LIMIT 1;\n' +
      '  Find the field that lists their properties and update extractPropertyNames().\n'
    )
  }

  console.log('\nOwner Health dashboard is at: src/command-center/owner-health.html')
}

sync().catch(err => {
  console.error('\nSync failed:', err.message)
  process.exit(1)
})
