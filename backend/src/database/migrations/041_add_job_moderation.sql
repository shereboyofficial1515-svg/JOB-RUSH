-- ============================================================
-- 041_add_job_moderation.sql
-- Admin job moderation previously had exactly one lever: cancelling a
-- job outright via adminSetJobStatus (irreversible in practice, and
-- indistinguishable from a hirer's own cancellation in job_status).
-- There was no reversible way to pull a job out of public search
-- while an admin investigates a report, and no record of who did it
-- or why. Mirrors the hidden/hidden_reason/hidden_by pattern already
-- used on reviews (026_create_reviews.sql) rather than inventing a
-- second moderation mechanism.
-- ============================================================

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden_by UUID REFERENCES users(id);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
