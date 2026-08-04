import { supabase } from '../db/server-client.js'

/**
 * Return the YYYY-MM strings for every period we expect a bill for,
 * looking back `monthsBack` full calendar months from today.
 *
 * Examples (today = 2026-06-26, monthsBack = 3):
 *   monthly    → ['2026-05', '2026-04', '2026-03']
 *   bi-monthly → ['2026-05', '2026-03']   (every 2 months)
 *   quarterly  → ['2026-05']              (every 3 months)
 *
 * We anchor to the most recent completed month and step backward.
 */
function expectedPeriods(billingCycle, monthsBack) {
  const today = new Date()
  // Most recent completed month (month before the current one)
  const anchor = new Date(today.getFullYear(), today.getMonth() - 1, 1)

  const step = billingCycle === 'monthly' ? 1
    : billingCycle === 'bi-monthly' ? 2
    : 3  // quarterly

  const periods = []
  let cursor = new Date(anchor)

  while (true) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth() + 1  // 1-based
    const label = `${year}-${String(month).padStart(2, '0')}`

    // Stop once we've gone further back than monthsBack allows
    const monthsAgo = (today.getFullYear() - year) * 12 + (today.getMonth() - (month - 1))
    if (monthsAgo > monthsBack) break

    periods.push(label)
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() - step, 1)
  }

  return periods
}

/**
 * Scan all active utility accounts and find:
 *   1. Expected billing periods with no bill on record (gaps)
 *   2. Bills that are overdue or have a late fee
 *
 * @param {number} monthsBack - How many completed months to look back (default 3)
 * @returns {Promise<object>}
 */
export async function detectGaps(monthsBack = 3) {
  // Fetch all active accounts, joined to their vendor name
  const { data: accounts, error: accountsError } = await supabase
    .from('utility_accounts')
    .select(`
      id,
      account_number,
      property_address,
      owner_name,
      billing_cycle,
      vendor_id,
      utility_vendors ( name )
    `)
    .eq('active', true)

  if (accountsError) {
    throw new Error(`Failed to fetch utility accounts: ${accountsError.message}`)
  }

  const gaps = []
  const overdueOrLateFee = []

  for (const account of accounts ?? []) {
    const vendorName = account.utility_vendors?.name ?? 'Unknown Vendor'

    // --- Gap detection ---
    const periods = expectedPeriods(account.billing_cycle, monthsBack)

    for (const period of periods) {
      // A bill covers this period if service_period_start falls in the same YYYY-MM
      const periodStart = `${period}-01`
      const nextMonth = new Date(period + '-01')
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      const periodEnd = nextMonth.toISOString().slice(0, 10)  // exclusive upper bound

      const { data: bills, error: billError } = await supabase
        .from('utility_bills')
        .select('id')
        .eq('account_id', account.id)
        .gte('service_period_start', periodStart)
        .lt('service_period_start', periodEnd)
        .limit(1)

      if (billError) {
        // Log and skip this period rather than crashing the whole run.
        // A query error here could produce a false-positive gap — worth knowing about.
        console.warn(`[detect-gaps] Bill query failed for account ${account.id} period ${period}: ${billError.message}`)
        continue
      }

      if (!bills || bills.length === 0) {
        gaps.push({
          accountId: account.id,
          accountNumber: account.account_number,
          propertyAddress: account.property_address ?? '',
          ownerName: account.owner_name ?? '',
          vendorName,
          missingPeriod: period,
          billingCycle: account.billing_cycle,
        })
      }
    }

    // --- Overdue / late fee detection ---
    const today = new Date().toISOString().slice(0, 10)

    const { data: problemBills, error: problemError } = await supabase
      .from('utility_bills')
      .select('id, due_date, has_late_fee, late_fee_amount, amount_due, status')
      .eq('account_id', account.id)
      .or(`status.eq.overdue,has_late_fee.eq.true`)

    if (problemError) continue

    for (const bill of problemBills ?? []) {
      // Also flag any 'received' bill whose due date has passed
      const isOverdue =
        bill.status === 'overdue' ||
        (bill.status === 'received' && bill.due_date && bill.due_date < today)

      if (isOverdue || bill.has_late_fee) {
        overdueOrLateFee.push({
          billId: bill.id,
          accountId: account.id,
          propertyAddress: account.property_address ?? '',
          ownerName: account.owner_name ?? '',
          vendorName,
          dueDate: bill.due_date,
          hasLateFee: bill.has_late_fee,
          lateFeeAmount: bill.late_fee_amount,
          amountDue: bill.amount_due,
          status: isOverdue ? 'overdue' : bill.status,
        })
      }
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    totalAccounts: (accounts ?? []).length,
    gaps,
    overdueOrLateFee,
  }
}
