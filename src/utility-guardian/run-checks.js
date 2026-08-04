/**
 * run-checks.js
 *
 * Nightly check cycle for the Utility Bill Guardian.
 * Finds missing bills and drafts outreach emails for any new gaps.
 *
 * Usage:
 *   node src/utility-guardian/run-checks.js
 *
 * Exit codes:
 *   0 — completed successfully
 *   1 — an error occurred
 */

import { detectGaps } from './detect-gaps.js'
import { draftOutreachForGaps } from './draft-outreach.js'

async function main() {
  console.log(`[${new Date().toISOString()}] Utility Bill Guardian — starting check`)

  // Step 1: Detect gaps and overdue bills
  let result
  try {
    result = await detectGaps(3)
  } catch (err) {
    console.error(`ERROR: Gap detection failed — ${err.message}`)
    process.exit(1)
  }

  // Step 2: Print summary
  console.log(`\n--- Summary ---`)
  console.log(`Accounts checked : ${result.totalAccounts}`)
  console.log(`Gaps found       : ${result.gaps.length}`)
  console.log(`Overdue/late fee : ${result.overdueOrLateFee.length}`)

  if (result.gaps.length > 0) {
    console.log(`\nGaps:`)
    for (const gap of result.gaps) {
      console.log(`  [${gap.missingPeriod}] ${gap.propertyAddress} — ${gap.vendorName}`)
    }
  }

  if (result.overdueOrLateFee.length > 0) {
    console.log(`\nOverdue / Late Fee bills:`)
    for (const bill of result.overdueOrLateFee) {
      const fee = bill.hasLateFee ? ` (late fee: $${bill.lateFeeAmount})` : ''
      console.log(`  ${bill.propertyAddress} — ${bill.vendorName} — Due ${bill.dueDate} — $${bill.amountDue}${fee}`)
    }
  }

  // Step 3: Draft outreach for new gaps
  let newDraftIds = []
  if (result.gaps.length > 0) {
    try {
      newDraftIds = await draftOutreachForGaps(result.gaps)
    } catch (err) {
      console.error(`ERROR: Outreach drafting failed — ${err.message}`)
      process.exit(1)
    }
  }

  console.log(`\nNew outreach drafts created: ${newDraftIds.length}`)
  if (newDraftIds.length > 0) {
    console.log(`  (Review and approve them before sending — Tier 2 action)`)
  }

  console.log(`\n[${new Date().toISOString()}] Check complete`)
  process.exit(0)
}

main()
