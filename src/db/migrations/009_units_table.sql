-- =============================================================================
-- Migration 009: Portfolio Units Table + Morning Pulse Views
--
-- Adds a `units` table that holds ALL units in the managed portfolio
-- (not just turnover units). Used by the Morning Pulse KPI cards:
--   v_occupancy      — total units, occupied count, occupancy %
--   v_vacancy_cost   — estimated rent lost from vacant units this month
--   v_open_work_orders — open work orders and how many are over 7 days
--
-- Run in Supabase SQL Editor (as service role / postgres).
-- =============================================================================

-- Shared updated_at trigger (safe to re-create).
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- units table
-- One row per rentable unit in the managed portfolio.
-- Synced from AppFolio by src/portfolio/sync-units.js.
-- =============================================================================
CREATE TABLE IF NOT EXISTS units (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_unit_id    text        UNIQUE NOT NULL,
  property_name       text        NOT NULL,
  unit_number         text,
  market_rent         numeric(10,2),
  status              text        NOT NULL DEFAULT 'unknown'
                        CHECK (status IN ('occupied','vacant','notice','leased_not_occupied','unknown')),
  vacant_since        date,
  raw_payload         jsonb,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_units_status           ON units(status);
CREATE INDEX IF NOT EXISTS idx_units_property_name    ON units(property_name);
CREATE INDEX IF NOT EXISTS idx_units_vacant_since     ON units(vacant_since);

CREATE TRIGGER units_updated_at
  BEFORE UPDATE ON units
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Row Level Security — anon key (browser) can only read.
ALTER TABLE units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read units"
  ON units FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- v_occupancy
-- Live snapshot: total units, occupied, vacant, occupancy %.
-- =============================================================================
DROP VIEW IF EXISTS v_occupancy;

CREATE VIEW v_occupancy AS
SELECT
  COUNT(*)                                                        AS total_units,
  COUNT(*) FILTER (WHERE status = 'occupied')                     AS occupied_units,
  COUNT(*) FILTER (WHERE status = 'vacant')                       AS vacant_units,
  COUNT(*) FILTER (WHERE status IN ('notice','leased_not_occupied')) AS notice_units,
  CASE
    WHEN COUNT(*) > 0 THEN
      ROUND(
        COUNT(*) FILTER (WHERE status = 'occupied') * 100.0 / COUNT(*),
        1
      )
    ELSE 0
  END                                                             AS occupancy_pct,
  MAX(last_synced_at)                                             AS last_synced_at
FROM units;

GRANT SELECT ON v_occupancy TO authenticated;

-- =============================================================================
-- v_vacancy_cost
-- Estimated rent lost this month from currently vacant units.
-- Formula: market_rent / 30 × days_vacant_this_month (capped at days since MTD start).
-- Units with no market_rent are counted but excluded from dollar amount.
-- =============================================================================
DROP VIEW IF EXISTS v_vacancy_cost;

CREATE VIEW v_vacancy_cost AS
SELECT
  COUNT(*)                                                        AS vacant_units,
  COUNT(*) FILTER (WHERE market_rent IS NOT NULL)                 AS units_with_rent,
  COALESCE(
    ROUND(
      SUM(
        CASE
          WHEN market_rent IS NOT NULL AND vacant_since IS NOT NULL THEN
            market_rent / 30.0 *
            GREATEST(
              EXTRACT(DAY FROM (
                NOW() - GREATEST(vacant_since::timestamptz, DATE_TRUNC('month', NOW()))
              )),
              0
            )
          WHEN market_rent IS NOT NULL THEN
            -- Vacant since before we started tracking; assume vacant all month
            market_rent / 30.0 * EXTRACT(DAY FROM (NOW() - DATE_TRUNC('month', NOW())))
          ELSE 0
        END
      )::numeric,
      0
    ),
    0
  )                                                               AS lost_rent_mtd
FROM units
WHERE status = 'vacant';

GRANT SELECT ON v_vacancy_cost TO authenticated;

-- =============================================================================
-- v_open_work_orders
-- Open work orders across all turnover units, with aging.
-- "Open" means status not completed or not_needed.
-- =============================================================================
DROP VIEW IF EXISTS v_open_work_orders;

CREATE VIEW v_open_work_orders AS
SELECT
  COUNT(*)                                                              AS open_count,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '7 days')       AS over_7_days,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '14 days')      AS over_14_days,
  COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '30 days')      AS over_30_days
FROM turnover_work_orders
WHERE status NOT IN ('completed', 'not_needed');

GRANT SELECT ON v_open_work_orders TO authenticated;
