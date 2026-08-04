/**
 * discover-api.js — Probe AppFolio to find which endpoints respond.
 * Run:  node src/portfolio/discover-api.js
 */
import 'dotenv/config'

const CLIENT_ID     = process.env.APPFOLIO_CLIENT_ID
const CLIENT_SECRET = process.env.APPFOLIO_CLIENT_SECRET
const SUBDOMAIN     = process.env.APPFOLIO_SUBDOMAIN
const BASE_URL      = `https://${SUBDOMAIN}.appfolio.com`
const BASIC_AUTH    = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

// Paths to probe — we'll try each and report what we get back
const PATHS = [
  '/api/v1/units',
  '/api/v1/properties',
  '/api/v1/leases',
  '/api/v2/units',
  '/api/v2/properties',
  '/api/v2/leases',
  '/api/v1/reports',
  '/api/v1/reports/available_units',
  '/api/v1/reports/leases',
  '/api/v1/reports/rent_roll',
]

async function probe(path) {
  const url = `${BASE_URL}${path}?per_page=1`
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${BASIC_AUTH}`, Accept: 'application/json' }
    })
    const body = await res.text()
    const preview = body.slice(0, 120).replace(/\n/g, ' ')
    return { status: res.status, preview }
  } catch (err) {
    return { status: 'ERR', preview: err.message }
  }
}

console.log(`Probing ${BASE_URL} with Basic Auth...\n`)

for (const path of PATHS) {
  const { status, preview } = await probe(path)
  const icon = status === 200 ? '✓' : status === 401 ? '✗ auth' : status === 404 ? '- not found' : `? ${status}`
  console.log(`${String(status).padStart(3)}  ${path}`)
  if (status === 200) console.log(`     → ${preview}`)
}

console.log('\nDone.')
