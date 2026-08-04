-- =============================================================================
-- Migration 012: Owner Portal Views — Phase 6
--
-- These views power the owner-facing portal. Each view filters to the
-- currently logged-in owner using auth.email() — owners only see their
-- own data. No cross-owner data leakage possible.
--
-- The portal uses Supabase magic-link auth. Owners are not in the profiles
-- table — they authenticate via their email address in the owners table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- v_my_owner_info
-- Returns the current owner's record. Used to verify access on login and
-- show the owner's name in the portal header.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_my_owner_info;

CREATE VIEW v_my_owner_info AS
SELECT
  id,
  name,
  email,
  phone,
  created_at
FROM owners
WHERE LOWER(TRIM(email)) = LOWER(TRIM(auth.email()));

GRANT SELECT ON v_my_owner_info TO authenticated;


-- -----------------------------------------------------------------------------
-- v_my_portfolio
-- One row per property this owner holds, with unit counts and rent roll.
-- Used for the "Your Properties" section of the portal.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_my_portfolio;

CREATE VIEW v_my_portfolio AS
SELECT
  op.property_name,
  COUNT(u.id)                                                                  AS total_units,
  COUNT(u.id) FILTER (WHERE u.status = 'occupied')                             AS occupied,
  COUNT(u.id) FILTER (WHERE u.status = 'vacant')                               AS vacant,
  COUNT(u.id) FILTER (WHERE u.status IN ('notice','leased_not_occupied'))       AS on_notice,
  COALESCE(SUM(u.market_rent), 0)                                               AS total_rent_roll,
  COALESCE(SUM(u.market_rent) FILTER (WHERE u.status = 'occupied'), 0)          AS collected_rent,
  -- Occupancy % (exclude unknown-status units from denominator)
  CASE
    WHEN COUNT(u.id) FILTER (WHERE u.status != 'unknown') > 0 THEN
      ROUND(
        COUNT(u.id) FILTER (WHERE u.status = 'occupied') * 100.0
        / NULLIF(COUNT(u.id) FILTER (WHERE u.status != 'unknown'), 0),
        1
      )
    ELSE NULL
  END                                                                           AS occupancy_pct,
  MAX(u.last_synced_at)                                                         AS last_synced_at
FROM owner_properties op
LEFT JOIN units u
  ON LOWER(TRIM(u.property_name)) = LOWER(TRIM(op.property_name))
WHERE op.owner_id IN (
  SELECT id FROM owners WHERE LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
)
GROUP BY op.property_name
ORDER BY op.property_name;

GRANT SELECT ON v_my_portfolio TO authenticated;


-- -----------------------------------------------------------------------------
-- v_my_work_orders
-- All work orders (open and recent closed) on this owner's properties.
-- Used for the open items list and the recent activity table.
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_my_work_orders;

CREATE VIEW v_my_work_orders AS
SELECT
  t.property_name,
  t.unit_number,
  wo.id                                                                         AS work_order_id,
  wo.category,
  wo.raw_title                                                                  AS description,
  wo.status,
  wo.vendor,
  wo.scheduled_date,
  wo.completed_date,
  wo.created_at,
  -- How long this has been open (NULL if already closed)
  CASE
    WHEN wo.status NOT IN ('completed','not_needed') THEN
      EXTRACT(DAY FROM (NOW() - wo.created_at))::int
    ELSE NULL
  END                                                                           AS days_open,
  -- How long it took to close (NULL if still open)
  CASE
    WHEN wo.completed_date IS NOT NULL THEN
      EXTRACT(DAY FROM (wo.completed_date::timestamptz - wo.created_at))::int
    ELSE NULL
  END                                                                           AS days_to_close
FROM owner_properties op
JOIN turnovers t
  ON LOWER(TRIM(t.property_name)) = LOWER(TRIM(op.property_name))
JOIN turnover_work_orders wo
  ON wo.turnover_id = t.id
WHERE op.owner_id IN (
  SELECT id FROM owners WHERE LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
)
ORDER BY wo.created_at DESC;

GRANT SELECT ON v_my_work_orders TO authenticated;


-- -----------------------------------------------------------------------------
-- v_my_maintenance_stats
-- Aggregated maintenance performance for the portal's headline metrics.
-- One row returned (global stats across all this owner's properties).
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS v_my_maintenance_stats;

CREATE VIEW v_my_maintenance_stats AS
SELECT
  COUNT(*) FILTER (
    WHERE wo.status NOT IN ('completed','not_needed')
  )                                                                             AS open_work_orders,
  COUNT(*) FILTER (
    WHERE wo.status = 'completed'
    AND wo.completed_date >= DATE_TRUNC('month', CURRENT_DATE)
  )                                                                             AS closed_this_month,
  COUNT(*) FILTER (
    WHERE wo.created_at >= DATE_TRUNC('month', CURRENT_DATE)
  )                                                                             AS opened_this_month,
  COUNT(*) FILTER (
    WHERE wo.status NOT IN ('completed','not_needed')
    AND wo.created_at < NOW() - INTERVAL '7 days'
  )                                                                             AS open_over_7_days,
  -- Average days to close (all time, closed items only)
  ROUND(
    AVG(
      CASE WHEN wo.completed_date IS NOT NULL THEN
        EXTRACT(DAY FROM (wo.completed_date::timestamptz - wo.created_at))
      END
    )::numeric, 1
  )                                                                             AS avg_days_to_close,
  -- Average days to close this month only
  ROUND(
    AVG(
      CASE
        WHEN wo.completed_date IS NOT NULL
        AND wo.completed_date >= DATE_TRUNC('month', CURRENT_DATE) THEN
          EXTRACT(DAY FROM (wo.completed_date::timestamptz - wo.created_at))
        ELSE NULL
      END
    )::numeric, 1
  )                                                                             AS avg_days_to_close_mtd
FROM owner_properties op
JOIN turnovers t
  ON LOWER(TRIM(t.property_name)) = LOWER(TRIM(op.property_name))
JOIN turnover_work_orders wo
  ON wo.turnover_id = t.id
WHERE op.owner_id IN (
  SELECT id FROM owners WHERE LOWER(TRIM(email)) = LOWER(TRIM(auth.email()))
);

GRANT SELECT ON v_my_maintenance_stats TO authenticated;
