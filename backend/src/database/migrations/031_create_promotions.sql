-- ============================================================
-- 031_create_promotions.sql
-- Admin-curated featured placements (spec section 67 PROMOTION).
-- A worker can have multiple active placements across different
-- sections at once (e.g. homepage AND their category page).
-- ============================================================

CREATE TYPE placement_type AS ENUM ('homepage', 'category', 'location', 'spotlight');

CREATE TABLE IF NOT EXISTS featured_placements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placement_type    placement_type NOT NULL,
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  category_id       UUID REFERENCES categories(id),
  state_id          UUID REFERENCES states(id),

  starts_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at           TIMESTAMPTZ,

  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_featured_placements_type ON featured_placements (placement_type);
CREATE INDEX IF NOT EXISTS idx_featured_placements_worker ON featured_placements (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_featured_placements_active
  ON featured_placements (placement_type, ends_at)
  WHERE ends_at IS NULL;
