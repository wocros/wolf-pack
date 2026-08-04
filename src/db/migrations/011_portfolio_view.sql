-- =============================================================================
-- Migration 011: Portfolio View — Phase 4
--
-- v_portfolio: one row per property, with full occupancy + financial summary.
-- Used by the Portfolio page (portfolio.html).
-- Reads from the `units` table populated by sync-units.js.
-- =============================================================================

DROP VIEW IF EXISTS v_portfolio;

CREATE VIEW v_portfolio AS
SELECT
  property_name,
  COUNT(*)                                                                   AS total_units,
  COUNT(*) FILTER (WHERE status = 'occupied')                                AS occupied,
  COUNT(*) FILTER (WHERE status = 'vacant')                                  AS vacant,
  COUNT(*) FILTER (WHERE status IN ('notice','leased_not_occupied'))          AS notice,
  COUNT(*) FILTER (WHERE status = 'unknown')                                  AS unknown_status,
  -- Occupancy % (exclude unknowns from denominator so they don't skew %)
  CASE
    WHEN COUNT(*) FILTER (WHERE status != 'unknown') > 0 THEN
      ROUND(
        COUNT(*) FILTER (WHERE status = 'occupied') * 100.0
        / COUNT(*) FILTER (WHERE status != 'unknown'),
        1
      )
    ELSE NULL
  END                                                                        AS occupancy_pct,
  -- Total potential rent roll (all units with a rent figure)
  COALESCE(SUM(market_rent), 0)                                              AS total_rent_roll,
  -- Rent actually being collected (occupied units only)
  COALESCE(SUM(market_rent) FILTER (WHERE status = 'occupied'), 0)           AS collected_rent,
  -- Estimated rent lost this month from vacant units
  COALESCE(
    SUM(
      CASE
        WHEN status = 'vacant' AND market_rent IS NOT NULL AND vacant_since IS NOT NULL THEN
          market_rent / 30.0 *
          GREATEST(
            EXTRACT(DAY FROM (
              NOW() - GREATEST(vacant_since::timestamptz, DATE_TRUNC('month', NOW()))
            )),
            0
          )
        WHEN status = 'vacant' AND market_rent IS NOT NULL THEN
          -- Vacant longer than our tracking window — count from MTD start
          market_rent / 30.0 * EXTRACT(DAY FROM (NOW() - DATE_TRUNC('month', NOW())))
        ELSE 0
      END
    ),
    0
  )                                                                          AS vacancy_cost_mtd,
  COUNT(*) FILTER (WHERE market_rent IS NOT NULL)                            AS units_with_rent,
  MAX(last_synced_at)                                                        AS last_synced_at
FROM units
GROUP BY property_name
ORDER BY vacancy_cost_mtd DESC, property_name;

GRANT SELECT ON v_portfolio TO authenticated;
