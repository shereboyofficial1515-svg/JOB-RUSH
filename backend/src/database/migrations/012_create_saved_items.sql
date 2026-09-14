-- ============================================================
-- 012_create_saved_items.sql
-- Simple bookmarking: workers save jobs, hirers save worker profiles.
-- ============================================================

CREATE TABLE IF NOT EXISTS saved_jobs (
  worker_user_id  UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_user_id, job_id)
);

CREATE TABLE IF NOT EXISTS saved_profiles (
  hirer_user_id   UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,
  worker_user_id  UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (hirer_user_id, worker_user_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_jobs_job ON saved_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_saved_profiles_worker ON saved_profiles (worker_user_id);
