import 'dotenv/config'
import { supabase } from '../db/server-client.js'

const CLIENT_ID  = process.env.APPFOLIO_CLIENT_ID
const CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET
const SUBDOMAIN  = process.env.APPFOLIO_SUBDOMAIN   // e.g. "bpmsd" for bpmsd.appfolio.com
const BASE_URL   = SUBDOMAIN ? `https://${SUBDOMAIN}.appfolio.com` : null

// AppFolio token endpoint path — override with APPFOLIO_TOKEN_PATH in .env if needed
const TOKEN_PATH = process.env.APPFOLIO_TOKEN_PATH || '/api/v1/session'

// Maps work order title keywords → board column categories.
// If a work order title doesn't match any keyword, it becomes 'other'.
const CATEGORY_KEYWORDS = {
  inspection: ['inspection', 'walk through', 'walkthrough', 'walk-through', 'move out', 'move-out'],
  dryer_vent: ['dryer vent', 'dryer-vent', 'vent clean', 'lint'],
  gardening:  ['garden', 'landscap', 'lawn', 'yard', 'plant', 'sprinkler', 'irrigat'],
  roof:       ['roof', 'shingle', 'gutter', 'skylight'],
  termite:    ['termite', 'pest control', 'fumigat', 'tenting', 'extermina'],
  carpet:     ['carpet', 'flooring', 'vinyl plank', 'hardwood', 'laminate'],
  paint:      ['paint', 'repaint', 'touch up', 'touch-up', 'primer'],
  repairs:    ['repair', 'replac', 'broken', 'plumbing', 'electrical', 'hvac',
               'heater', 'ac unit', 'air condition', 'door', 'window', 'cabinet',
               'counter', 'tile', 'drywall', 'fixture'],
}

function categorize(title) {
  const lower = (title || '').toLowerCase()
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat
  }
  return 'other'
}

function normalizeWoStatus(raw) {
  const s = (raw || '').toLowerCase().replace(/[\s-]+/g, '_')
  if (s.includes('complet') || s.includes('closed') || s.includes('done'))    return 'completed'
  if (s.includes('in_progress') || s.includes('progress'))                     return 'in_progress'
  if (s.includes('scheduled') || s.includes('approved') || s.includes('open')) return 'scheduled'
  if (s.includes('cancel') || s.includes('not_needed'))                        return 'not_needed'
  return 'pending'
}

function computeStatus(moveOutDate, moveInDate, daysVacant) {
  if (moveInDate) return 'ready_to_rent'
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const moveOut = moveOutDate ? new Date(moveOutDate + 'T00:00:00') : null
  if (!moveOut || moveOut > today) return 'pending_moveout'
  if (daysVacant >= 60) return 'down_unit'
  return 'active_turnover'
}

function extractUtilities(customFields) {
  const util = {}
  for (const [key, val] of Object.entries(customFields || {})) {
    const lower = key.toLowerCase()
    if (['water', 'electric', 'gas', 'trash', 'utilit', 'sewer'].some(k => lower.includes(k))) {
      util[key] = val
    }
  }
  return util
}

async function getToken() {
  const res = await fetch(`${BASE_URL}${TOKEN_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'client_credentials',
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `AppFolio auth failed (${res.status}).\n` +
      `  Check APPFOLIO_CLIENT_ID, APPFOLIO_CLIENT_SECRET, APPFOLIO_SUBDOMAIN in .env\n` +
      `  Token URL tried: ${BASE_URL}${TOKEN_PATH}\n` +
      `  Response: ${body}\n\n` +
      `  If AppFolio uses a different token path, add APPFOLIO_TOKEN_PATH=<path> to .env`
    )
  }
  const data = await res.json()
  const token = data.access_token || data.token
  if (!token) throw new Error(`AppFolio token response missing access_token. Response: ${JSON.stringify(data)}`)
  return token
}

async function apiFetch(token, path, params = {}) {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`AppFolio GET ${path} failed (${res.status}): ${await res.text()}`)
  }
  return res.json()
}

// Handles AppFolio pagination — keeps fetching until a page comes back with fewer than per_page items
async function fetchAllPages(token, path, params = {}) {
  const results = []
  let page = 1
  while (true) {
    const data = await apiFetch(token, path, { ...params, page, per_page: 100 })
    // AppFolio may return results under different keys; try the most common ones
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

async function sync() {
  if (!CLIENT_ID || !CLIENT_SECRET || !SUBDOMAIN) {
    console.error(
      'Missing required environment variables. Add these to your .env file:\n\n' +
      '  APPFOLIO_CLIENT_ID=...\n' +
      '  APPFOLIO_CLIENT_SECRET=...\n' +
      '  APPFOLIO_SUBDOMAIN=bpmsd   (the part before .appfolio.com in your login URL)\n'
    )
    process.exit(1)
  }

  console.log(`Connecting to AppFolio (${BASE_URL})...`)
  const token = await getToken()
  console.log('Connected.\n')

  // --- Vacant units (already moved out, no current tenant) ---
  console.log('Fetching vacant units...')
  const vacantUnits = await fetchAllPages(token, '/api/v1/units', { is_vacant: true })
  console.log(`  ${vacantUnits.length} vacant units found`)

  // --- Leases ending within 90 days (pending move-outs still occupied) ---
  const today = new Date()
  const ninetyOut = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0]
  console.log('Fetching upcoming move-outs (leases ending within 90 days)...')
  const upcomingLeases = await fetchAllPages(token, '/api/v1/leases', {
    end_date_lte: ninetyOut,
    status: 'active',
  })
  console.log(`  ${upcomingLeases.length} upcoming leases found`)

  // --- Work orders (open, in progress, and recently completed) ---
  console.log('Fetching work orders...')
  const workOrders = await fetchAllPages(token, '/api/v1/work_orders')
  console.log(`  ${workOrders.length} work orders found\n`)

  // Build work-order lookup by unit id for fast access
  const woByUnit = {}
  for (const wo of workOrders) {
    const uid = String(wo.unit_id || wo.unit?.id || '')
    if (!uid) continue
    if (!woByUnit[uid]) woByUnit[uid] = []
    woByUnit[uid].push(wo)
  }

  // Merge vacant units + upcoming-lease units (dedup by unit id)
  const allUnitIds = new Set()
  const allUnits = []
  for (const u of vacantUnits) {
    const uid = String(u.id || u.unit_id)
    if (!allUnitIds.has(uid)) { allUnitIds.add(uid); allUnits.push(u) }
  }
  for (const lease of upcomingLeases) {
    const uid = String(lease.unit_id || lease.unit?.id || '')
    if (uid && !allUnitIds.has(uid)) {
      allUnitIds.add(uid)
      allUnits.push({
        id:                    uid,
        property_name:         lease.property_name || lease.property?.name,
        unit_number:           lease.unit_number   || lease.unit?.name,
        last_lease_end_date:   lease.end_date,
        next_lease_start_date: null,
        custom_fields:         {},
      })
    }
  }

  console.log(`Processing ${allUnits.length} units total...\n`)

  let turnoverCount = 0
  let workOrderCount = 0
  let errorCount = 0
  const rawTitles = new Set()

  for (const unit of allUnits) {
    const unitId      = String(unit.id || unit.unit_id)
    const propName    = unit.property_name || unit.address || 'Unknown Property'
    const unitNum     = unit.unit_number || unit.name || ''
    const moveOutDate = unit.last_lease_end_date || null
    const moveInDate  = unit.next_lease_start_date || null

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    const daysVacant = moveOutDate && new Date(moveOutDate + 'T00:00:00') < todayStart
      ? Math.floor((todayStart - new Date(moveOutDate + 'T00:00:00')) / (1000 * 60 * 60 * 24))
      : 0

    const status    = computeStatus(moveOutDate, moveInDate, daysVacant)
    const utilities = extractUtilities(unit.custom_fields || unit.fields)

    const { data: row, error } = await supabase
      .from('turnovers')
      .upsert({
        appfolio_unit_id: unitId,
        property_name:    propName,
        unit_number:      unitNum,
        status,
        move_out_date:    moveOutDate,
        move_in_date:     moveInDate,
        utilities,
        days_vacant:      daysVacant,
        last_synced_at:   new Date().toISOString(),
      }, { onConflict: 'appfolio_unit_id' })
      .select('id')
      .single()

    if (error) {
      console.error(`  ✗ ${propName} ${unitNum} (unit ${unitId}): ${error.message}`)
      errorCount++
      continue
    }

    turnoverCount++

    // Upsert work orders linked to this unit
    const unitWos = woByUnit[unitId] || []
    for (const wo of unitWos) {
      const woId  = String(wo.id || wo.work_order_id)
      const title = wo.title || wo.subject || wo.description || ''
      rawTitles.add(title)

      const { error: woErr } = await supabase
        .from('turnover_work_orders')
        .upsert({
          turnover_id:    row.id,
          appfolio_wo_id: woId,
          category:       categorize(title),
          raw_title:      title,
          status:         normalizeWoStatus(wo.status),
          scheduled_date: wo.scheduled_date || wo.due_date || null,
          completed_date: wo.completed_date || wo.closed_date || null,
          vendor:         wo.vendor_name || wo.vendor?.name || null,
        }, { onConflict: 'appfolio_wo_id' })

      if (woErr) {
        console.error(`    ✗ Work order ${woId}: ${woErr.message}`)
        errorCount++
        continue
      }
      workOrderCount++
    }

    console.log(`  ✓ ${propName} ${unitNum} — ${status} — ${daysVacant}d vacant — ${unitWos.length} work orders`)
  }

  console.log('\n=== Sync Complete ===')
  console.log(`Units synced:       ${turnoverCount}`)
  console.log(`Work orders synced: ${workOrderCount}`)
  if (errorCount > 0) {
    console.log(`Errors:             ${errorCount}  (see messages above)`)
  }

  // Log all raw work order titles so you can tune the category keyword map
  if (rawTitles.size > 0) {
    console.log('\nWork order titles (review category mapping):')
    for (const t of [...rawTitles].sort()) console.log(`  "${t}"`)
  }
}

sync().catch(err => {
  console.error('\nSync failed:', err.message)
  process.exit(1)
})
