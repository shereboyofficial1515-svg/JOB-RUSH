-- ============================================================
-- 005_create_locations.sql
-- Hierarchical Nigerian location data. Launch is restricted to
-- Delta State via the `is_active` flag on `states` — NOT by
-- hard-coding "Delta" anywhere in application logic. Enabling a new
-- state later is a data change (flip is_active), not a code change,
-- per business rules #1/#2 and spec section 47.
-- ============================================================

CREATE TABLE IF NOT EXISTS states (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lgas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  state_id    UUID NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (state_id, name)
);

-- City/town/neighborhood-level granularity. Kept generic (`area`)
-- rather than separate tables per spec's City/Area/Neighborhood list,
-- since they all behave the same way for search/filtering purposes.
CREATE TABLE IF NOT EXISTS areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lga_id      UUID NOT NULL REFERENCES lgas(id) ON DELETE CASCADE,
  name        VARCHAR(120) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lga_id, name)
);

CREATE INDEX IF NOT EXISTS idx_lgas_state_id ON lgas (state_id);
CREATE INDEX IF NOT EXISTS idx_areas_lga_id ON areas (lga_id);

-- Seed: Delta State active at launch; other states present but
-- inactive so Admin can flip them on later without a schema change.
INSERT INTO states (name, is_active) VALUES
  ('Delta', true),
  ('Lagos', false),
  ('Rivers', false),
  ('Edo', false),
  ('Anambra', false),
  ('Abuja (FCT)', false)
ON CONFLICT (name) DO NOTHING;
