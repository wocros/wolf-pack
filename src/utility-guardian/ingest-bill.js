import { supabase } from '../db/server-client.js'

/**
 * Save a utility bill to the database.
 *
 * @param {object} params
 * @param {string} params.accountNumber  - The utility account number on the bill
 * @param {string} [params.vendorId]     - UUID of the vendor (optional — required if account number is shared across vendors)
 * @param {string} [params.billDate]     - ISO date string, e.g. '2026-05-01'
 * @param {string} [params.dueDate]      - ISO date string
 * @param {string} [params.servicePeriodStart] - ISO date string
 * @param {string} [params.servicePeriodEnd]   - ISO date string
 * @param {number} [params.amountDue]
 * @param {boolean} [params.hasLateFee]
 * @param {number} [params.lateFeeAmount]
 * @param {string} [params.pdfUrl]
 * @param {string} [params.notes]
 * @returns {Promise<{ success: boolean, billId?: string, error?: string }>}
 */
export async function ingestBill({
  accountNumber,
  vendorId,
  billDate,
  dueDate,
  servicePeriodStart,
  servicePeriodEnd,
  amountDue,
  hasLateFee,
  lateFeeAmount,
  pdfUrl,
  notes,
}) {
  try {
    // Build the lookup query
    let query = supabase
      .from('utility_accounts')
      .select('id')
      .eq('account_number', accountNumber)
      .eq('active', true)

    if (vendorId) {
      query = query.eq('vendor_id', vendorId)
    }

    const { data: accounts, error: lookupError } = await query

    if (lookupError) {
      return { success: false, error: `Database error during account lookup: ${lookupError.message}` }
    }

    if (!accounts || accounts.length === 0) {
      return { success: false, error: `Account not found: ${accountNumber}` }
    }

    // If multiple accounts share this number and no vendor_id was given, we can't pick one safely
    if (accounts.length > 1) {
      return {
        success: false,
        error: `Account number ${accountNumber} matches multiple records. Provide vendorId to disambiguate.`,
      }
    }

    const accountId = accounts[0].id

    const { data: bill, error: insertError } = await supabase
      .from('utility_bills')
      .insert({
        account_id: accountId,
        bill_date: billDate ?? null,
        due_date: dueDate ?? null,
        service_period_start: servicePeriodStart ?? null,
        service_period_end: servicePeriodEnd ?? null,
        amount_due: amountDue ?? null,
        has_late_fee: hasLateFee ?? false,
        late_fee_amount: lateFeeAmount ?? null,
        pdf_url: pdfUrl ?? null,
        notes: notes ?? null,
        status: 'received',
      })
      .select('id')
      .single()

    if (insertError) {
      return { success: false, error: `Failed to insert bill: ${insertError.message}` }
    }

    return { success: true, billId: bill.id }
  } catch (err) {
    return { success: false, error: `Unexpected error: ${err.message}` }
  }
}

/**
 * Return all bills for a given utility account, newest period first.
 *
 * @param {string} accountId - UUID of the utility_account row
 * @returns {Promise<Array>}
 */
export async function getBillsByAccount(accountId) {
  const { data, error } = await supabase
    .from('utility_bills')
    .select('*')
    .eq('account_id', accountId)
    .order('service_period_start', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch bills for account ${accountId}: ${error.message}`)
  }

  return data ?? []
}
