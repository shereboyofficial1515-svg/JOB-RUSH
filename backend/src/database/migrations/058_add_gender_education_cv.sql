-- ============================================================
-- 058_add_gender_education_cv.sql
-- Adds three profile features confirmed absent by a full codebase
-- audit: optional gender (workers + hirers), a normalized worker
-- education history, and a worker CV/resume. Mirrors existing
-- conventions rather than inventing new ones:
--   - gender_visibility reuses profile_visibility_setting (035) —
--     the same public/private enum user_settings.profile_visibility
--     already uses — for a per-field visibility toggle.
--   - worker_education mirrors work_experience (050) exactly:
--     same ownership FK shape, sort_order, updated_at trigger.
--   - worker_cv follows the verification_documents/private-bucket
--     pattern (storageService.getSignedUrl), plus a 3rd
--     "verified hirers only" option that public/private profile
--     visibility has no use for elsewhere, hence its own enum
--     rather than extending profile_visibility_setting everywhere.
-- Existing users get NULL gender / no education / no CV rows — all
-- three features are additive and optional, nothing here requires
-- backfilling or breaks a profile that never sets them.
-- ============================================================

-- ---------- Gender (optional, private by default) ----------
ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gender_custom VARCHAR(60),
  ADD COLUMN IF NOT EXISTS gender_visibility profile_visibility_setting NOT NULL DEFAULT 'private';

ALTER TABLE hirer_profiles
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS gender_custom VARCHAR(60),
  ADD COLUMN IF NOT EXISTS gender_visibility profile_visibility_setting NOT NULL DEFAULT 'private';

DO $$ BEGIN
  ALTER TABLE worker_profiles ADD CONSTRAINT chk_worker_gender
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE hirer_profiles ADD CONSTRAINT chk_hirer_gender
    CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say', 'custom'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Education (repeatable, ordered — same shape as work_experience) ----------
CREATE TABLE IF NOT EXISTS worker_education (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  institution       VARCHAR(200) NOT NULL,
  education_type    VARCHAR(30) NOT NULL DEFAULT 'university'
                       CHECK (education_type IN (
                         'university', 'college', 'polytechnic', 'secondary_school',
                         'vocational_training', 'professional_training', 'certification', 'online'
                       )),
  degree            VARCHAR(150),
  field_of_study    VARCHAR(150),
  location          VARCHAR(255),
  description       TEXT,
  start_date        DATE,
  end_date          DATE,
  is_current        BOOLEAN NOT NULL DEFAULT false,
  -- Education reads as ordinary CV content (like work_experience,
  -- which has no per-row visibility of its own), so it defaults to
  -- 'public' — visible whenever the worker's overall profile is —
  -- with an explicit opt-out per entry rather than gender's opt-in.
  visibility        profile_visibility_setting NOT NULL DEFAULT 'public',
  sort_order        SMALLINT NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_worker_education_worker ON worker_education (worker_user_id, sort_order);

DROP TRIGGER IF EXISTS trg_worker_education_updated_at ON worker_education;
CREATE TRIGGER trg_worker_education_updated_at
  BEFORE UPDATE ON worker_education
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------- CV / résumé ----------
-- Three-way visibility ('verified_hirers_only' has no meaning for
-- gender/profile_visibility elsewhere) is its own enum rather than
-- extending profile_visibility_setting project-wide.
DO $$ BEGIN
  CREATE TYPE cv_visibility_setting AS ENUM ('public', 'private', 'verified_hirers_only');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per worker (UNIQUE worker_user_id) — a worker has exactly
-- one active CV at a time, matching the "current CV / replace CV"
-- requirement; upserting this row on a new upload is the natural
-- "replace" operation. cv_type='built' means storage_path/file_name/
-- mime_type/file_size stay NULL and the CV is assembled on read from
-- the worker's existing profile/experience/education/skills/portfolio
-- rows instead of a stored file.
CREATE TABLE IF NOT EXISTS worker_cv (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL UNIQUE REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  cv_type           VARCHAR(20) NOT NULL DEFAULT 'uploaded_file' CHECK (cv_type IN ('uploaded_file', 'built')),
  storage_path      TEXT,
  file_name         VARCHAR(255),
  mime_type         VARCHAR(100),
  file_size         INTEGER,
  -- Private by default — a CV is denser personal/contact history than
  -- a public profile page and must never be exposed just because it
  -- was uploaded (see PART 4 CV PRIVACY).
  visibility        cv_visibility_setting NOT NULL DEFAULT 'private',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (cv_type = 'built' OR storage_path IS NOT NULL)
);

DROP TRIGGER IF EXISTS trg_worker_cv_updated_at ON worker_cv;
CREATE TRIGGER trg_worker_cv_updated_at
  BEFORE UPDATE ON worker_cv
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
