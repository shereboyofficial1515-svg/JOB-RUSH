-- ============================================================
-- 026_create_reviews.sql
-- One review per completed contract, hirer rating worker (spec
-- section 59 is one-directional). `hidden` lets a moderation admin
-- suppress a review from public display without deleting it — the
-- history stays for accountability, but it stops showing publicly.
-- ============================================================

CREATE TABLE IF NOT EXISTS reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id       UUID NOT NULL UNIQUE REFERENCES contracts(id) ON DELETE CASCADE,
  reviewer_user_id  UUID NOT NULL REFERENCES hirer_profiles(user_id),
  reviewee_user_id  UUID NOT NULL REFERENCES worker_profiles(user_id),

  rating            SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text       TEXT,

  hidden            BOOLEAN NOT NULL DEFAULT false,
  hidden_reason     TEXT,
  hidden_by         UUID REFERENCES users(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id         UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id),
  reason            VARCHAR(500) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews (reviewee_user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews (reviewer_user_id);
CREATE INDEX IF NOT EXISTS idx_review_reports_review ON review_reports (review_id);

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON reviews;
CREATE TRIGGER trg_reviews_updated_at
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
