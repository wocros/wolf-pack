/**
 * graph-client.js — Microsoft Graph API client for email sync
 *
 * Handles authentication and email operations against Danyel's Microsoft 365
 * mailbox (danyel@bpmsd.com) via the Graph API.
 *
 * Required environment variables (add to .env):
 *   MS_TENANT_ID     — Azure AD tenant ID
 *   MS_CLIENT_ID     — Azure app (service principal) client ID
 *   MS_CLIENT_SECRET — Azure app client secret
 *   MS_USER_EMAIL    — The mailbox to read (danyel@bpmsd.com)
 *
 * The Azure app needs the Mail.Read and Mail.Send application permissions
 * granted by an Azure AD admin.
 */

import 'dotenv/config'
import fetch from 'node-fetch'

// =============================================================================
// CONFIG
// =============================================================================

const TENANT_ID     = process.env.MS_TENANT_ID
const CLIENT_ID     = process.env.MS_CLIENT_ID
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET
const USER_EMAIL    = process.env.MS_USER_EMAIL

// Validate all required env vars are present
function assertConfig() {
  const missing = []
  if (!TENANT_ID)     missing.push('MS_TENANT_ID')
  if (!CLIENT_ID)     missing.push('MS_CLIENT_ID')
  if (!CLIENT_SECRET) missing.push('MS_CLIENT_SECRET')
  if (!USER_EMAIL)    missing.push('MS_USER_EMAIL')

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Add them to your .env file. See .env.example for details.'
    )
  }
}

// =============================================================================
// TOKEN CACHE
// Tokens are valid for ~1 hour. We cache the token and its expiry time so we
// don't make an extra HTTP request on every email fetch.
// =============================================================================

let _cachedToken   = null
let _tokenExpiresAt = 0   // Unix timestamp in milliseconds

/**
 * Get a valid OAuth2 access token using the client_credentials grant.
 * Returns a cached token if it's still valid with 60 seconds of buffer.
 */
export async function getAccessToken() {
  assertConfig()

  const now = Date.now()
  // Return cached token if it's still good (with a 60s safety buffer)
  if (_cachedToken && now < _tokenExpiresAt - 60_000) {
    return _cachedToken
  }

  const url  = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope:         'https://graph.microsoft.com/.default'
  })

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    body.toString()
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph token request failed (${res.status}): ${text}`)
  }

  const json = await res.json()

  if (!json.access_token) {
    throw new Error('Graph token response missing access_token: ' + JSON.stringify(json))
  }

  _cachedToken    = json.access_token
  // expires_in is in seconds
  _tokenExpiresAt = now + (json.expires_in || 3600) * 1000

  return _cachedToken
}

// =============================================================================
// FETCH NEW EMAILS
// =============================================================================

/**
 * Fetch emails received after the given timestamp.
 *
 * @param {string|null} since  ISO 8601 datetime string (e.g. "2026-06-01T00:00:00Z").
 *                             Pass null to fetch the last 50 emails with no date filter.
 * @returns {Array} Normalized email objects ready to upsert into email_cache.
 */
export async function fetchNewEmails(since) {
  assertConfig()
  const token = await getAccessToken()

  // Build the OData filter — only apply date filter if we have a since value
  const filterParts = []
  if (since) {
    filterParts.push(`receivedDateTime ge ${since}`)
  }
  const filter = filterParts.length > 0
    ? `&$filter=${encodeURIComponent(filterParts.join(' and '))}`
    : ''

  const select = [
    'id',
    'subject',
    'from',
    'bodyPreview',
    'body',
    'receivedDateTime'
  ].join(',')

  const url = (
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(USER_EMAIL)}/messages` +
    `?$select=${select}` +
    `&$orderby=${encodeURIComponent('receivedDateTime desc')}` +
    `&$top=50` +
    filter
  )

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph messages request failed (${res.status}): ${text}`)
  }

  const json = await res.json()
  const messages = json.value || []

  // Normalize each message to match the email_cache table columns
  return messages.map(msg => ({
    m365_message_id: msg.id,
    subject:         msg.subject         || '(no subject)',
    from_address:    msg.from?.emailAddress?.address || '',
    from_name:       msg.from?.emailAddress?.name    || '',
    body_preview:    msg.bodyPreview      || '',
    body_html:       msg.body?.content   || '',
    received_at:     msg.receivedDateTime || new Date().toISOString()
  }))
}

// =============================================================================
// SEND REPLY
// =============================================================================

/**
 * Send a reply to a specific email.
 *
 * @param {string} messageId   The Graph API message ID (m365_message_id)
 * @param {string} replyBody   The plain-text reply body
 */
export async function sendReply(messageId, replyBody) {
  assertConfig()
  const token = await getAccessToken()

  const url = (
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(USER_EMAIL)}` +
    `/messages/${encodeURIComponent(messageId)}/reply`
  )

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ comment: replyBody })
  })

  // Graph returns 202 Accepted on success — no body
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Graph reply request failed (${res.status}): ${text}`)
  }
}
