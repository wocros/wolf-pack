-- =============================================================================
-- Seed: 001_utility_vendors_seed
-- Description: Starter utility vendors for Beyond Property Management (San Diego).
--              Run this AFTER migration 001_create_utility_bill_guardian.sql.
-- Date: 2026-06-26
-- =============================================================================
--
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING so existing rows
-- are left untouched if you run this more than once.
-- =============================================================================

INSERT INTO utility_vendors (name, utility_type, contact_phone, account_portal_url)
VALUES
  (
    'SDG&E',
    'electric',
    '1-800-411-7343',
    'https://www.sdge.com/myaccount'
  ),
  (
    'SoCal Gas',
    'gas',
    '1-800-427-2200',
    'https://www.socalgas.com/myaccount'
  ),
  (
    'City of San Diego — Water',
    'water',
    '619-515-3500',
    'https://www.sandiego.gov/water/myaccount'
  ),
  (
    'City of San Diego — Sewer',
    'sewer',
    '619-515-3500',
    'https://www.sandiego.gov/water/myaccount'
  ),
  (
    'Republic Services',
    'trash',
    '1-800-299-4898',
    'https://www.republicservices.com/myaccount'
  ),
  (
    'Cox Communications',
    'internet',
    '1-800-234-3993',
    'https://www.cox.com/myaccount'
  )
ON CONFLICT DO NOTHING;
