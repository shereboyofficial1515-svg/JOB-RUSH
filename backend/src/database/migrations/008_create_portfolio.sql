-- ============================================================
-- 008_create_portfolio.sql
-- Worker portfolio projects and their media. `storage_path` points
-- into Supabase Storage — the bucket for portfolio media is public
-- read (per spec, portfolio content is meant to be shown publicly),
-- but uploads are still authorized/validated server-side (see
-- portfolioService + the storage module).
-- ============================================================

CREATE TYPE portfolio_media_type AS ENUM ('image', 'video', 'document');

CREATE TABLE IF NOT EXISTS portfolios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  title             VARCHAR(150) NOT NULL,
  description       TEXT,
  category_id       UUID REFERENCES categories(id),
  project_type      VARCHAR(80),
  external_link     TEXT,
  is_featured       BOOLEAN NOT NULL DEFAULT false, -- PRO users may feature selected projects

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id    UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,

  media_type      portfolio_media_type NOT NULL,
  storage_path    TEXT NOT NULL,
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  sort_order      INTEGER NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_worker ON portfolios (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_featured ON portfolios (is_featured);
CREATE INDEX IF NOT EXISTS idx_portfolio_media_portfolio ON portfolio_media (portfolio_id);

DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON portfolios;
CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
