-- =============================================================================
-- Migration: 002_add_rls_utility_bill_guardian
-- Description: Enables Row Level Security on all four Utility Bill Guardian
--              tables and sets read-only access for the anon (browser) key.
--              Server-side scripts must use SUPABASE_SERVICE_ROLE_KEY to write.
-- Date: 2026-06-26
-- =============================================================================
-- Run this AFTER 001_create_utility_bill_guardian.sql.
-- =============================================================================

-- utility_vendors: anon can read, cannot write
ALTER TABLE utility_vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read-only" ON utility_vendors
  FOR SELECT TO anon USING (true);

-- utility_accounts: anon can read active accounts only
ALTER TABLE utility_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read-only" ON utility_accounts
  FOR SELECT TO anon USING (active = true);

-- utility_bills: anon can read all bills
ALTER TABLE utility_bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read-only" ON utility_bills
  FOR SELECT TO anon USING (true);

-- utility_outreach: anon can read drafts/sent records (for dashboard display)
ALTER TABLE utility_outreach ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon read-only" ON utility_outreach
  FOR SELECT TO anon USING (true);


-- =============================================================================
-- ROLLBACK
-- =============================================================================
--
-- DROP POLICY IF EXISTS "anon read-only" ON utility_outreach;
-- ALTER TABLE utility_outreach DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "anon read-only" ON utility_bills;
-- ALTER TABLE utility_bills DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "anon read-only" ON utility_accounts;
-- ALTER TABLE utility_accounts DISABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "anon read-only" ON utility_vendors;
-- ALTER TABLE utility_vendors DISABLE ROW LEVEL SECURITY;
--
-- =============================================================================
