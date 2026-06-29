-- =============================================================================
-- Migration: 003_add_outreach_unique_constraint
-- Description: Adds a unique constraint on (account_id, missing_period) in
--              utility_outreach to prevent duplicate outreach drafts when
--              run-checks.js is called more than once for the same billing period.
-- Date: 2026-06-26
-- =============================================================================
-- Run this AFTER 001_create_utility_bill_guardian.sql and
-- 002_add_rls_utility_bill_guardian.sql.
-- =============================================================================

ALTER TABLE utility_outreach
  ADD CONSTRAINT uq_utility_outreach_account_period
  UNIQUE (account_id, missing_period);


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- ALTER TABLE utility_outreach
--   DROP CONSTRAINT IF EXISTS uq_utility_outreach_account_period;
--
-- =============================================================================
