import { supabase } from '../db/server-client.js'

/**
 * Convert a YYYY-MM string to a human-readable "Month YYYY" label.
 * e.g. '2026-04' → 'April 2026'
 */
function formatPeriod(yyyyMm) {
  const [year, month] = yyyyMm.split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

/**
 * Build the outreach email subject and body for a single gap.
 */
function buildEmail(accountNumber, vendorName, missingPeriod) {
  const periodLabel = formatPeriod(missingPeriod)

  const subject = `Request for Invoice — Account #${accountNumber} — ${periodLabel}`

  const body = `Dear ${vendorName} Customer Service Team,

My name is Danyel Brooks. I am the property manager at Beyond Property Management, and we manage utilities for the above account on behalf of the property owner.

We have not received an invoice for the service period ${periodLabel}.

Could you please resend the invoice, or confirm the amount due, at your earliest convenience? You can reach us at:

  Email: utilities@bpmsd.com
  Phone: (619) 793-6283

Thank you for your help.

Danyel Brooks
Beyond Property Management
www.bpmsd.com`

  return { subject, body }
}

/**
 * Create draft outreach records for each gap returned by detectGaps.
 * Skips any gap that already has an outreach record (no duplicates).
 *
 * @param {Array} gaps - Array of gap objects from detectGaps()
 * @returns {Promise<string[]>} - Array of newly created outreach record IDs
 */
export async function draftOutreachForGaps(gaps) {
  const createdIds = []

  for (const gap of gaps ?? []) {
    // Check for an existing outreach record for this account + period
    const { data: existing, error: checkError } = await supabase
      .from('utility_outreach')
      .select('id')
      .eq('account_id', gap.accountId)
      .eq('missing_period', gap.missingPeriod)
      .limit(1)

    if (checkError) {
      // Log and skip — don't let one bad record block the rest
      continue
    }

    if (existing && existing.length > 0) {
      // Already drafted for this gap, skip
      continue
    }

    // Look up vendor contact email (not in the gap object — fetch from DB)
    const { data: account, error: accountError } = await supabase
      .from('utility_accounts')
      .select('vendor_id, account_number')
      .eq('id', gap.accountId)
      .single()

    if (accountError || !account) continue

    const { data: vendor, error: vendorError } = await supabase
      .from('utility_vendors')
      .select('name, contact_email')
      .eq('id', account.vendor_id)
      .single()

    if (vendorError || !vendor) continue

    const { subject, body } = buildEmail(
      gap.accountNumber,
      vendor.name,
      gap.missingPeriod,
    )

    const { data: outreach, error: insertError } = await supabase
      .from('utility_outreach')
      .insert({
        account_id: gap.accountId,
        missing_period: gap.missingPeriod,
        draft_email_subject: subject,
        draft_email_body: body,
        status: 'draft',
      })
      .select('id')
      .single()

    if (insertError) {
      continue
    }

    createdIds.push(outreach.id)
  }

  return createdIds
}

/**
 * Return all outreach records in draft or approved status,
 * with account and vendor info joined, newest first.
 *
 * @returns {Promise<Array>}
 */
export async function getPendingOutreach() {
  const { data, error } = await supabase
    .from('utility_outreach')
    .select(`
      id,
      missing_period,
      draft_email_subject,
      draft_email_body,
      status,
      created_at,
      utility_accounts (
        account_number,
        property_address,
        owner_name,
        utility_vendors ( name, contact_email )
      )
    `)
    .in('status', ['draft', 'approved'])
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch pending outreach: ${error.message}`)
  }

  return data ?? []
}
