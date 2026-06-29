import { supabase } from '../db/server-client.js'

/**
 * Add a new utility account to the database.
 *
 * @param {object} params
 * @param {string} params.propertyId       - AppFolio property ID or name
 * @param {string} [params.propertyAddress] - Human-readable address (e.g. '110 W Robertson, Ridgecrest CA')
 * @param {string} params.vendorId         - UUID of the vendor from utility_vendors
 * @param {string} params.accountNumber    - The account number on the bill
 * @param {string} [params.ownerName]      - Property owner's name
 * @param {'monthly'|'bi-monthly'|'quarterly'} [params.billingCycle] - Defaults to 'monthly'
 * @param {string} [params.notes]
 * @returns {Promise<{ success: boolean, accountId?: string, error?: string }>}
 */
export async function addUtilityAccount({
  propertyId,
  propertyAddress,
  vendorId,
  accountNumber,
  ownerName,
  billingCycle = 'monthly',
  notes,
}) {
  if (!propertyId) {
    return { success: false, error: 'propertyId is required' }
  }
  if (!vendorId) {
    return { success: false, error: 'vendorId is required' }
  }
  if (!accountNumber) {
    return { success: false, error: 'accountNumber is required' }
  }

  const validCycles = ['monthly', 'bi-monthly', 'quarterly']
  if (!validCycles.includes(billingCycle)) {
    return {
      success: false,
      error: `billingCycle must be one of: ${validCycles.join(', ')}`,
    }
  }

  const { data, error } = await supabase
    .from('utility_accounts')
    .insert({
      property_id: propertyId,
      property_address: propertyAddress ?? null,
      vendor_id: vendorId,
      account_number: accountNumber,
      owner_name: ownerName ?? null,
      billing_cycle: billingCycle,
      notes: notes ?? null,
      active: true,
    })
    .select('id')
    .single()

  if (error) {
    // Surface duplicate key violations in plain English
    if (error.code === '23505') {
      return {
        success: false,
        error: `Account number ${accountNumber} already exists for this vendor.`,
      }
    }
    return { success: false, error: `Failed to create account: ${error.message}` }
  }

  return { success: true, accountId: data.id }
}

/**
 * Return all active utility accounts with vendor name, sorted by address.
 *
 * @returns {Promise<Array>}
 */
export async function listAccounts() {
  const { data, error } = await supabase
    .from('utility_accounts')
    .select(`
      id,
      property_id,
      property_address,
      account_number,
      owner_name,
      billing_cycle,
      notes,
      created_at,
      utility_vendors ( name, utility_type )
    `)
    .eq('active', true)
    .order('property_address', { ascending: true })

  if (error) {
    throw new Error(`Failed to list accounts: ${error.message}`)
  }

  return data ?? []
}
