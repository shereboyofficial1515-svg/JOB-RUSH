-- ============================================================
-- 011_create_applications.sql
-- One row per (job, worker) relationship, covering both directions:
-- a worker applying to an open job, and a hirer inviting a specific
-- worker directly. `source` records which one started it; `status`
-- is a single state machine from there (see applicationService).
-- ============================================================

CREATE TYPE application_source AS ENUM ('worker_applied', 'hirer_invited');

CREATE TYPE application_status AS ENUM (
  'applied',
  'invited',
  'accepted',
  'declined',
  'shortlisted',
  'hired',
  'rejected',
  'withdrawn'
);

CREATE TABLE IF NOT EXISTS applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  worker_user_id  UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  source          application_source NOT NULL,
  status          application_status NOT NULL,

  cover_note      TEXT,
  proposed_rate   NUMERIC(12,2),

  applied_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ, -- worker accept/decline of an invitation, or hirer decision timestamp
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A worker can only have one active relationship with a given job;
  -- prevents duplicate applications and duplicate invitations alike.
  UNIQUE (job_id, worker_user_id)
);

CREATE INDEX IF NOT EXISTS idx_applications_job ON applications (job_id);
CREATE INDEX IF NOT EXISTS idx_applications_worker ON applications (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications (status);

DROP TRIGGER IF EXISTS trg_applications_updated_at ON applications;
CREATE TRIGGER trg_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
