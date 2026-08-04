-- =============================================================================
-- Migration 008: KPI Dashboard Views — Phase 1
--
-- Creates views used by the Team Response Time leaderboard.
-- No new tables — these views read from existing email_cache,
-- email_actions, and profiles tables.
--
-- Run in Supabase SQL Editor (as service role / postgres).
-- =============================================================================

-- Drop existing versions so this migration is safe to re-run.
DROP VIEW IF EXISTS v_email_response_times;

-- =============================================================================
-- v_email_response_times
--
-- One row per email that received a 'replied' action.
-- response_hours = time from email arrival to first reply.
-- sla_status:  green  = < 4h
--              yellow = 4–24h
--              red    = > 24h
-- =============================================================================
CREATE VIEW v_email_response_times AS
SELECT
  a.id                                                           AS action_id,
  a.performed_by,
  p.display_name,
  p.role                                                         AS performer_role,
  e.id                                                           AS email_id,
  e.subject,
  e.from_address,
  e.received_at,
  a.performed_at                                                 AS replied_at,
  EXTRACT(EPOCH FROM (a.performed_at - e.received_at)) / 3600.0 AS response_hours,
  CASE
    WHEN EXTRACT(EPOCH FROM (a.performed_at - e.received_at)) / 3600.0 <= 4  THEN 'green'
    WHEN EXTRACT(EPOCH FROM (a.performed_at - e.received_at)) / 3600.0 <= 24 THEN 'yellow'
    ELSE 'red'
  END                                                            AS sla_status
FROM email_actions  a
JOIN email_cache    e ON e.id  = a.email_id
JOIN profiles       p ON p.id  = a.performed_by
WHERE a.action_type = 'replied';

-- Grant SELECT to authenticated users (PostgREST will apply RLS from
-- the underlying tables — admin/manager see all rows, staff see own).
GRANT SELECT ON v_email_response_times TO authenticated;
