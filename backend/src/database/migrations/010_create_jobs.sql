-- ============================================================
-- 010_create_jobs.sql
-- Job postings. Ownership is always hirer_profiles(user_id) — a job
-- can only be created/edited by the hirer account that owns it,
-- checked in jobService on every mutating call, not just by RBAC role.
-- ============================================================

CREATE TYPE job_status AS ENUM ('draft', 'open', 'closed', 'filled', 'cancelled', 'expired');
CREATE TYPE employment_type AS ENUM ('full_time', 'part_time', 'contract', 'one_time');
CREATE TYPE budget_type AS ENUM ('fixed', 'hourly', 'salary');
CREATE TYPE experience_level AS ENUM ('entry', 'intermediate', 'expert');

CREATE TABLE IF NOT EXISTS jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hirer_user_id       UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,

  title               VARCHAR(150) NOT NULL,
  description         TEXT NOT NULL,
  category_id         UUID REFERENCES categories(id),

  employment_type     employment_type NOT NULL DEFAULT 'one_time',
  experience_level    experience_level NOT NULL DEFAULT 'entry',

  budget_type         budget_type NOT NULL DEFAULT 'fixed',
  budget_min          NUMERIC(12,2),
  budget_max          NUMERIC(12,2),

  state_id            UUID REFERENCES states(id),
  lga_id              UUID REFERENCES lgas(id),
  area_id             UUID REFERENCES areas(id),

  deadline            DATE,
  additional_requirements TEXT,

  status              job_status NOT NULL DEFAULT 'open',
  view_count          INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT jobs_budget_range_valid CHECK (
    budget_min IS NULL OR budget_max IS NULL OR budget_min <= budget_max
  )
);

CREATE TABLE IF NOT EXISTS job_skills (
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (job_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_hirer ON jobs (hirer_user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_category ON jobs (category_id);
CREATE INDEX IF NOT EXISTS idx_jobs_state ON jobs (state_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs (created_at);
CREATE INDEX IF NOT EXISTS idx_job_skills_skill ON job_skills (skill_id);

DROP TRIGGER IF EXISTS trg_jobs_updated_at ON jobs;
CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
