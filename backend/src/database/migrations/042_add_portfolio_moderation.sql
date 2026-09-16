-- ============================================================
-- 042_add_portfolio_moderation.sql
-- Portfolio projects had zero moderation surface: no hidden/removed
-- flag, and no report table at all (unlike jobs and reviews, which
-- each have their own narrow *_reports table). Admins had no way to
-- act on a reported portfolio project short of editing the worker's
-- whole profile. Mirrors the existing jobs/reviews moderation pattern
-- (hidden/hidden_reason/hidden_by/hidden_at) and the existing narrow
-- per-content-type reports pattern (job_reports, review_reports)
-- rather than introducing a new generic/polymorphic reports table.
-- ============================================================

ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id);
ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS portfolio_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id      UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id),
  reason            VARCHAR(500) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_reports_portfolio_id ON portfolio_reports (portfolio_id);
