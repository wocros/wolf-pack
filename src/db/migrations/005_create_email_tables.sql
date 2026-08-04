-- =============================================================================
-- Migration: 005_create_email_tables
-- Description: Creates three tables for the email triage module:
--              email_categories  — configurable label/badge types
--              email_cache       — emails pulled from Microsoft 365 / Graph API
--              email_actions     — append-only audit log of every action taken
--              Includes default seed data for the six standard categories.
-- Date: 2026-06-26
-- =============================================================================
-- Run this AFTER 004_create_profiles.sql (depends on public.get_user_role()).
-- =============================================================================


-- =============================================================================
-- TABLE 1: email_categories
-- The labels that can be applied to any email (maintenance, payment, etc.).
-- Admin manages these; all authenticated users can read them.
-- =============================================================================

CREATE TABLE public.email_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL UNIQUE,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.email_categories        IS 'Configurable labels applied to emails in the triage module.';
COMMENT ON COLUMN public.email_categories.name   IS 'Short label shown on badge, e.g. maintenance, payment, complaint.';
COMMENT ON COLUMN public.email_categories.color  IS 'Hex color string for the badge, e.g. #e74c3c. Optional.';


-- =============================================================================
-- SEED: the six default categories
-- =============================================================================

INSERT INTO public.email_categories (name, color) VALUES
  ('maintenance', '#3498db'),
  ('payment',     '#2ecc71'),
  ('complaint',   '#e74c3c'),
  ('question',    '#f39c12'),
  ('legal',       '#9b59b6'),
  ('other',       '#95a5a6');


-- =============================================================================
-- RLS: email_categories
-- =============================================================================

ALTER TABLE public.email_categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read categories (needed to render badges)
CREATE POLICY "authenticated users can read categories"
  ON public.email_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin can add new categories
CREATE POLICY "admin can insert categories"
  ON public.email_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.get_user_role() = 'admin');

-- Only admin can rename or recolor categories
CREATE POLICY "admin can update categories"
  ON public.email_categories
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() = 'admin')
  WITH CHECK (public.get_user_role() = 'admin');

-- Only admin can delete categories
CREATE POLICY "admin can delete categories"
  ON public.email_categories
  FOR DELETE
  TO authenticated
  USING (public.get_user_role() = 'admin');


-- =============================================================================
-- TABLE 2: email_cache
-- One row per email pulled from Microsoft 365 via the Graph API.
-- The sync script (service role key) inserts rows; the browser (anon/authed
-- key) reads and updates them to assign, categorize, or mark handled.
-- =============================================================================

CREATE TABLE public.email_cache (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  m365_message_id  TEXT        NOT NULL UNIQUE,
  subject          TEXT,
  from_address     TEXT        NOT NULL,
  from_name        TEXT,
  body_preview     TEXT,
  body_html        TEXT,
  received_at      TIMESTAMPTZ NOT NULL,
  status           TEXT        NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new', 'assigned', 'handled')),
  assigned_to      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  category_id      UUID        REFERENCES public.email_categories(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.email_cache                   IS 'Emails pulled from Microsoft 365 via Graph API. Sync script inserts; browser reads and updates.';
COMMENT ON COLUMN public.email_cache.m365_message_id   IS 'Unique message ID from the Microsoft Graph API. Prevents duplicate rows on re-sync.';
COMMENT ON COLUMN public.email_cache.body_preview      IS 'First ~150 characters of the email body for list-view display.';
COMMENT ON COLUMN public.email_cache.body_html         IS 'Full HTML body of the email for detail-view display.';
COMMENT ON COLUMN public.email_cache.status            IS 'new = just pulled; assigned = given to a team member; handled = fully resolved.';
COMMENT ON COLUMN public.email_cache.assigned_to       IS 'The auth.users.id of the team member responsible for this email.';

CREATE INDEX idx_email_cache_m365_message_id  ON public.email_cache (m365_message_id);
CREATE INDEX idx_email_cache_status           ON public.email_cache (status);
CREATE INDEX idx_email_cache_assigned_to      ON public.email_cache (assigned_to);
CREATE INDEX idx_email_cache_received_at      ON public.email_cache (received_at DESC);

CREATE TRIGGER trg_email_cache_updated_at
  BEFORE UPDATE ON public.email_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- =============================================================================
-- RLS: email_cache
-- =============================================================================

ALTER TABLE public.email_cache ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read all emails
CREATE POLICY "admin and manager can read all emails"
  ON public.email_cache
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'));

-- Staff can only read emails assigned to them
CREATE POLICY "staff can read own assigned emails"
  ON public.email_cache
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'staff'
    AND assigned_to = auth.uid()
  );

-- Admin and manager can update any email (assign, categorize, change status)
CREATE POLICY "admin and manager can update any email"
  ON public.email_cache
  FOR UPDATE
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'))
  WITH CHECK (public.get_user_role() IN ('admin', 'manager'));

-- Staff can update only emails assigned to them (e.g., mark handled, add category)
CREATE POLICY "staff can update own assigned emails"
  ON public.email_cache
  FOR UPDATE
  TO authenticated
  USING (
    public.get_user_role() = 'staff'
    AND assigned_to = auth.uid()
  )
  WITH CHECK (
    public.get_user_role() = 'staff'
    AND assigned_to = auth.uid()
  );

-- No INSERT or DELETE via browser. The sync script uses the service role key,
-- which bypasses RLS entirely. No policy = no browser access for those operations.


-- =============================================================================
-- TABLE 3: email_actions
-- Append-only audit log. Every action taken on any email gets a row here.
-- No UPDATE or DELETE is ever allowed — this is a permanent record.
-- =============================================================================

CREATE TABLE public.email_actions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id      UUID        NOT NULL REFERENCES public.email_cache(id) ON DELETE CASCADE,
  action_type   TEXT        NOT NULL
                CHECK (action_type IN ('assigned', 'categorized', 'replied', 'marked_handled', 'marked_new')),
  performed_by  UUID        NOT NULL REFERENCES auth.users(id),
  assigned_to   UUID        REFERENCES auth.users(id),
  category_id   UUID        REFERENCES public.email_categories(id),
  reply_body    TEXT,
  performed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.email_actions               IS 'Append-only audit log of every action taken on every email. Never modified after insert.';
COMMENT ON COLUMN public.email_actions.action_type   IS 'assigned = routed to a person; categorized = label applied; replied = email sent; marked_handled = closed; marked_new = reopened.';
COMMENT ON COLUMN public.email_actions.performed_by  IS 'The auth.users.id of the team member who took the action.';
COMMENT ON COLUMN public.email_actions.assigned_to   IS 'Populated only when action_type = assigned. The user this email was routed to.';
COMMENT ON COLUMN public.email_actions.category_id   IS 'Populated only when action_type = categorized. The label that was applied.';
COMMENT ON COLUMN public.email_actions.reply_body    IS 'Populated only when action_type = replied. The text of the reply that was sent.';

CREATE INDEX idx_email_actions_email_id      ON public.email_actions (email_id);
CREATE INDEX idx_email_actions_performed_by  ON public.email_actions (performed_by);
CREATE INDEX idx_email_actions_performed_at  ON public.email_actions (performed_at DESC);


-- =============================================================================
-- RLS: email_actions
-- =============================================================================

ALTER TABLE public.email_actions ENABLE ROW LEVEL SECURITY;

-- Admin and manager can read the full action history across all emails
CREATE POLICY "admin and manager can read all actions"
  ON public.email_actions
  FOR SELECT
  TO authenticated
  USING (public.get_user_role() IN ('admin', 'manager'));

-- Staff can only read actions on emails that are assigned to them
CREATE POLICY "staff can read actions on own assigned emails"
  ON public.email_actions
  FOR SELECT
  TO authenticated
  USING (
    public.get_user_role() = 'staff'
    AND email_id IN (
      SELECT id FROM public.email_cache WHERE assigned_to = auth.uid()
    )
  );

-- All authenticated users can insert their own action rows (audit trail).
-- The WITH CHECK enforces that performed_by must always be the caller's own ID —
-- no one can log an action on behalf of someone else.
CREATE POLICY "authenticated users can insert own actions"
  ON public.email_actions
  FOR INSERT
  TO authenticated
  WITH CHECK (performed_by = auth.uid());

-- No UPDATE or DELETE policies are defined. The audit log is append-only.
-- Even admins cannot alter or remove action history.


-- =============================================================================
-- ROLLBACK
-- Run these statements (in this exact order) to undo this migration.
-- Drop in reverse dependency order: actions → cache → categories.
-- =============================================================================
--
-- DROP POLICY IF EXISTS "authenticated users can insert own actions"      ON public.email_actions;
-- DROP POLICY IF EXISTS "staff can read actions on own assigned emails"   ON public.email_actions;
-- DROP POLICY IF EXISTS "admin and manager can read all actions"          ON public.email_actions;
-- ALTER TABLE public.email_actions DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.email_actions;
--
-- DROP POLICY IF EXISTS "staff can update own assigned emails"            ON public.email_cache;
-- DROP POLICY IF EXISTS "admin and manager can update any email"          ON public.email_cache;
-- DROP POLICY IF EXISTS "staff can read own assigned emails"              ON public.email_cache;
-- DROP POLICY IF EXISTS "admin and manager can read all emails"           ON public.email_cache;
-- ALTER TABLE public.email_cache DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.email_cache;
--
-- DROP POLICY IF EXISTS "admin can delete categories"                     ON public.email_categories;
-- DROP POLICY IF EXISTS "admin can update categories"                     ON public.email_categories;
-- DROP POLICY IF EXISTS "admin can insert categories"                     ON public.email_categories;
-- DROP POLICY IF EXISTS "authenticated users can read categories"         ON public.email_categories;
-- ALTER TABLE public.email_categories DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.email_categories;
--
-- =============================================================================
