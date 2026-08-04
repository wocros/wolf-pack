-- =============================================================================
-- Migration: 001_create_utility_bill_guardian
-- Description: Creates the four core tables for the Utility Bill Guardian system.
--              This system tracks utility bills across all properties where BPM
--              pays utilities on behalf of property owners.
-- Date: 2026-06-26
-- =============================================================================


-- =============================================================================
-- HELPER: auto-update updated_at on every row change
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- TABLE 1: utility_vendors
-- The utility companies BPM deals with (SDG&E, City of San Diego Water, etc.)
-- One row per company — not per account.
-- =============================================================================

CREATE TABLE utility_vendors (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT          NOT NULL,
  utility_type        TEXT          NOT NULL
                      CHECK (utility_type IN ('electric','gas','water','trash','sewer','internet','other')),
  contact_email       TEXT,
  contact_phone       TEXT,
  account_portal_url  TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  utility_vendors                   IS 'Utility companies BPM deals with across all managed properties.';
COMMENT ON COLUMN utility_vendors.utility_type      IS 'One of: electric, gas, water, trash, sewer, internet, other.';
COMMENT ON COLUMN utility_vendors.account_portal_url IS 'Online portal URL where BPM logs in to view/pay this vendor.';

CREATE TRIGGER trg_utility_vendors_updated_at
  BEFORE UPDATE ON utility_vendors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- TABLE 2: utility_accounts
-- Links a specific utility account number to a property and vendor.
-- One row = one account at one property.
-- =============================================================================

CREATE TABLE utility_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      TEXT        NOT NULL,
  property_address TEXT,
  vendor_id        UUID        NOT NULL REFERENCES utility_vendors(id),
  account_number   TEXT        NOT NULL,
  owner_name       TEXT,
  billing_cycle    TEXT        NOT NULL DEFAULT 'monthly'
                   CHECK (billing_cycle IN ('monthly','bi-monthly','quarterly')),
  active           BOOLEAN     NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One row per account number per vendor — no duplicates
  CONSTRAINT uq_utility_accounts_vendor_account UNIQUE (vendor_id, account_number)
);

COMMENT ON TABLE  utility_accounts                IS 'Each row is one utility account number tied to one property.';
COMMENT ON COLUMN utility_accounts.property_id    IS 'AppFolio property name or ID — used to cross-reference with AppFolio data.';
COMMENT ON COLUMN utility_accounts.billing_cycle  IS 'How often this account is billed: monthly, bi-monthly, or quarterly.';
COMMENT ON COLUMN utility_accounts.active         IS 'Set to false when an account is closed, not deleted.';

CREATE INDEX idx_utility_accounts_vendor_id    ON utility_accounts (vendor_id);
CREATE INDEX idx_utility_accounts_property_id  ON utility_accounts (property_id);
CREATE INDEX idx_utility_accounts_active       ON utility_accounts (active);

CREATE TRIGGER trg_utility_accounts_updated_at
  BEFORE UPDATE ON utility_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- TABLE 3: utility_bills
-- Every bill received for every utility account.
-- One row = one invoice or statement.
-- =============================================================================

CREATE TABLE utility_bills (
  id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id            UUID           NOT NULL REFERENCES utility_accounts(id),
  bill_date             DATE,
  due_date              DATE,
  service_period_start  DATE,
  service_period_end    DATE,
  amount_due            NUMERIC(10,2),
  amount_paid           NUMERIC(10,2),
  paid_date             DATE,
  status                TEXT           NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','paid','overdue','missing')),
  has_late_fee          BOOLEAN        NOT NULL DEFAULT false,
  late_fee_amount       NUMERIC(10,2),
  pdf_url               TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ    NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ    NOT NULL DEFAULT now()
);

COMMENT ON TABLE  utility_bills                       IS 'Every utility bill received across all accounts.';
COMMENT ON COLUMN utility_bills.account_id            IS 'Which utility account this bill belongs to.';
COMMENT ON COLUMN utility_bills.status                IS 'received = got it; paid = paid; overdue = past due date; missing = expected but not received.';
COMMENT ON COLUMN utility_bills.pdf_url               IS 'Path to the bill PDF stored in Supabase Storage.';
COMMENT ON COLUMN utility_bills.service_period_start  IS 'First day of the billing period this invoice covers.';
COMMENT ON COLUMN utility_bills.service_period_end    IS 'Last day of the billing period this invoice covers.';

CREATE INDEX idx_utility_bills_account_id            ON utility_bills (account_id);
CREATE INDEX idx_utility_bills_status                ON utility_bills (status);
CREATE INDEX idx_utility_bills_due_date              ON utility_bills (due_date);
CREATE INDEX idx_utility_bills_service_period_start  ON utility_bills (service_period_start);

CREATE TRIGGER trg_utility_bills_updated_at
  BEFORE UPDATE ON utility_bills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- TABLE 4: utility_outreach
-- Tracks outreach emails drafted and sent when a bill is missing.
-- One row = one outreach attempt for one missing billing period.
-- =============================================================================

CREATE TABLE utility_outreach (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID        NOT NULL REFERENCES utility_accounts(id),
  missing_period      TEXT        NOT NULL,    -- YYYY-MM format, e.g. "2026-05"
  draft_email_subject TEXT,
  draft_email_body    TEXT,
  status              TEXT        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','approved','sent','responded')),
  sent_at             TIMESTAMPTZ,
  sent_by             TEXT,
  response_received   BOOLEAN     DEFAULT false,
  response_notes      TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  utility_outreach                  IS 'Outreach emails to utility companies when a bill is missing.';
COMMENT ON COLUMN utility_outreach.missing_period   IS 'The billing period that is missing, in YYYY-MM format (e.g. 2026-05).';
COMMENT ON COLUMN utility_outreach.status           IS 'draft = not yet sent; approved = Danyel approved; sent = emailed; responded = vendor replied.';
COMMENT ON COLUMN utility_outreach.sent_by          IS 'Name or email of the person who approved and sent the outreach.';

CREATE INDEX idx_utility_outreach_account_id      ON utility_outreach (account_id);
CREATE INDEX idx_utility_outreach_status          ON utility_outreach (status);
CREATE INDEX idx_utility_outreach_missing_period  ON utility_outreach (missing_period);

CREATE TRIGGER trg_utility_outreach_updated_at
  BEFORE UPDATE ON utility_outreach
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- ROLLBACK
-- Run these statements (in this exact order) to undo this migration completely.
-- Drop in reverse dependency order: outreach → bills → accounts → vendors → trigger function.
-- =============================================================================
--
-- DROP TABLE IF EXISTS utility_outreach;
-- DROP TABLE IF EXISTS utility_bills;
-- DROP TABLE IF EXISTS utility_accounts;
-- DROP TABLE IF EXISTS utility_vendors;
-- DROP FUNCTION IF EXISTS set_updated_at();
--
-- =============================================================================
