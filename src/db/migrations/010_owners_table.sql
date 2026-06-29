-- =============================================================================
-- Migration 010: Owners + Owner Health Score (Blue Ocean Phase 3)
--
-- Tables:
--   owners           — property owner contact info (from AppFolio)
--   owner_properties — links each owner to their property names
--
-- View:
--   v_owner_health   — per-owner risk score (0–100) from three signals:
--                       vacancy duration (40 pts) + our response time (40 pts)
--                       + open work orders (20 pts)
--
-- Risk bands:  green 0–33  |  yellow 34–66  |  red 67–100
--
-- Run in Supabase SQL Editor (as service role / postgres).
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- owners
-- =============================================================================
CREATE TABLE IF NOT EXISTS owners (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  appfolio_owner_id   text        UNIQUE NOT NULL,
  name                text        NOT NULL,
  email               text,
  phone               text,
  raw_payload         jsonb,
  last_synced_at      timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_owners_email ON owners(LOWER(email));

CREATE TRIGGER owners_updated_at
  BEFORE UPDATE ON owners
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read owners"
  ON owners FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- owner_properties
-- Links owners to their managed properties by property_name text.
-- Matches the property_name column in both `units` and `turnovers`.
-- =============================================================================
CREATE TABLE IF NOT EXISTS owner_properties (
  id                   uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id             uuid  NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
  property_name        text  NOT NULL,
  appfolio_property_id text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_owner_properties_unique
  ON owner_properties(owner_id, LOWER(TRIM(property_name)));

CREATE INDEX IF NOT EXISTS idx_owner_properties_owner_id
  ON owner_properties(owner_id);

CREATE INDEX IF NOT EXISTS idx_owner_properties_name
  ON owner_properties(LOWER(TRIM(property_name)));

ALTER TABLE owner_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read owner_properties"
  ON owner_properties FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- v_owner_health
--
-- One row per owner. Computes a 0–100 risk score from:
--   Vacancy signal  (0–40 pts): avg days vacant for their empty units
--   Response signal (0–40 pts): avg hours BPM takes to reply to their emails
--   Work order signal (0–20 pts): open work orders on their properties
--
-- Looks at emails received in the last 90 days only.
-- If a signal has no data (no emails, no work orders), it contributes 0 pts
-- so you don't penalize owners for signals we haven't measured yet.
-- =============================================================================
DROP VIEW IF EXISTS v_owner_health;

CREATE VIEW v_owner_health AS
WITH

-- Vacancy signal: per owner, avg days vacant for their currently vacant units
owner_vacancy AS (
  SELECT
    op.owner_id,
    COUNT(u.id) FILTER (WHERE u.status = 'vacant')                       AS vacant_units,
    COALESCE(
      AVG(
        CASE WHEN u.status = 'vacant' AND u.vacant_since IS NOT NULL THEN
          GREATEST(
            EXTRACT(DAY FROM NOW() - u.vacant_since::timestamptz),
            0
          )
        END
      ),
      0
    )                                                                     AS avg_days_vacant
  FROM owner_properties op
  JOIN units u
    ON LOWER(TRIM(u.property_name)) = LOWER(TRIM(op.property_name))
  GROUP BY op.owner_id
),

-- Response signal: avg hours BPM took to reply to this owner's emails (last 90d)
owner_response AS (
  SELECT
    o.id                              AS owner_id,
    COUNT(DISTINCT ec.id)             AS emails_received,
    COALESCE(AVG(rt.response_hours), 0) AS avg_response_hours,
    MAX(ec.received_at)               AS last_contact_at
  FROM owners o
  JOIN email_cache ec
    ON LOWER(TRIM(ec.from_address)) = LOWER(TRIM(o.email))
   AND ec.received_at >= NOW() - INTERVAL '90 days'
  LEFT JOIN v_email_response_times rt ON rt.email_id = ec.id
  WHERE o.email IS NOT NULL AND o.email != ''
  GROUP BY o.id
),

-- Work order signal: open (not completed/not_needed) WOs on their properties
owner_work_orders AS (
  SELECT
    op.owner_id,
    COUNT(DISTINCT wo.id) AS open_work_orders
  FROM owner_properties op
  JOIN turnovers t
    ON LOWER(TRIM(t.property_name)) = LOWER(TRIM(op.property_name))
  JOIN turnover_work_orders wo ON wo.turnover_id = t.id
  WHERE wo.status NOT IN ('completed', 'not_needed')
  GROUP BY op.owner_id
),

-- Combine and compute score
scored AS (
  SELECT
    o.id,
    o.name,
    o.email,
    o.phone,
    o.appfolio_owner_id,
    o.last_synced_at,
    COUNT(DISTINCT op.property_name)                          AS property_count,
    COALESCE(ov.vacant_units,        0)                       AS vacant_units,
    ROUND(COALESCE(ov.avg_days_vacant, 0)::numeric, 1)        AS avg_days_vacant,
    ROUND(COALESCE(orsp.avg_response_hours, 0)::numeric, 1)   AS avg_response_hours,
    COALESCE(orsp.emails_received,   0)                       AS emails_received,
    orsp.last_contact_at,
    COALESCE(owo.open_work_orders,   0)                       AS open_work_orders,
    -- Score: each signal scaled to its max pts, capped, then summed
    LEAST(100, ROUND((
      LEAST(40, COALESCE(ov.avg_days_vacant,        0) / 30.0 * 40) +
      LEAST(40, COALESCE(orsp.avg_response_hours,   0) / 24.0 * 40) +
      LEAST(20, COALESCE(owo.open_work_orders,      0) /  3.0 * 20)
    )::numeric, 0))                                           AS risk_score
  FROM owners o
  LEFT JOIN owner_properties    op   ON op.owner_id   = o.id
  LEFT JOIN owner_vacancy       ov   ON ov.owner_id   = o.id
  LEFT JOIN owner_response      orsp ON orsp.owner_id = o.id
  LEFT JOIN owner_work_orders   owo  ON owo.owner_id  = o.id
  GROUP BY o.id, o.name, o.email, o.phone, o.appfolio_owner_id, o.last_synced_at,
           ov.vacant_units, ov.avg_days_vacant,
           orsp.avg_response_hours, orsp.emails_received, orsp.last_contact_at,
           owo.open_work_orders
)

SELECT
  *,
  CASE
    WHEN risk_score >= 67 THEN 'red'
    WHEN risk_score >= 34 THEN 'yellow'
    ELSE                       'green'
  END AS risk_level
FROM scored;

GRANT SELECT ON v_owner_health TO authenticated;
