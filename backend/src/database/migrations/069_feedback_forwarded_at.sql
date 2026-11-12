-- ============================================================
-- 069_feedback_forwarded_at.sql
-- Records when an in-app Help & Feedback item reached the SHEREBOY TECH LTD
-- Reviews & Feedback dashboard, so the background sync only sends items the
-- dashboard does not have yet. Additive; changes no existing data.
-- ============================================================
ALTER TABLE feedback_submissions ADD COLUMN IF NOT EXISTS forwarded_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_feedback_not_forwarded ON feedback_submissions (created_at) WHERE forwarded_at IS NULL;
