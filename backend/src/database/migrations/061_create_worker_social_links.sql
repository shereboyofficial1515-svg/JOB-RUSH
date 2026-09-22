-- ============================================================
-- 061_create_worker_social_links.sql
-- New worker-only "Social" profile feature — confirmed absent by a
-- schema audit (no social/facebook/instagram/tiktok/youtube columns
-- or tables anywhere except users.facebook_id, which is unrelated
-- Facebook Login OAuth linkage, not a profile social link).
--
-- One row per (worker, platform) rather than free-form JSON, so the
-- platform set is enumerable/validatable at the DB level and each
-- link gets its own independent is_enabled toggle (never
-- localStorage-only — enable/disable must persist server-side per
-- spec). Mirrors worker_education's ownership/timestamp shape.
-- ============================================================

CREATE TABLE IF NOT EXISTS worker_social_links (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  platform          VARCHAR(20) NOT NULL
                       CHECK (platform IN ('facebook', 'instagram', 'tiktok', 'youtube', 'website')),
  url               TEXT NOT NULL,
  is_enabled        BOOLEAN NOT NULL DEFAULT true,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (worker_user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_worker_social_links_worker ON worker_social_links (worker_user_id);

DROP TRIGGER IF EXISTS trg_worker_social_links_updated_at ON worker_social_links;
CREATE TRIGGER trg_worker_social_links_updated_at
  BEFORE UPDATE ON worker_social_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
