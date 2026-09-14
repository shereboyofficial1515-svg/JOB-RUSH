-- ============================================================
-- 007_create_profiles.sql
-- Worker and hirer profiles. Kept one-to-one with `users` (PK =
-- user_id) so ownership checks are a trivial `user_id = req.user.id`
-- rather than a second layer of IDs to reconcile.
--
-- Trust/visibility fields (verification_status, is_pro, ratings,
-- completed_jobs_count, response_rate) are NEVER written by profile
-- update endpoints — only by the systems that own them
-- (verification admin actions, the subscriptions module, the
-- reviews module, the jobs module). This is enforced in
-- profileService, not just by convention.
-- ============================================================

CREATE TYPE verification_status AS ENUM (
  'not_submitted',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'resubmission_required',
  'suspended'
);

CREATE TYPE availability_status AS ENUM ('available', 'busy', 'unavailable');

CREATE TABLE IF NOT EXISTS worker_profiles (
  user_id                   UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  professional_title        VARCHAR(150),
  bio                       TEXT,
  experience_years          SMALLINT CHECK (experience_years >= 0 AND experience_years <= 80),
  availability_status       availability_status NOT NULL DEFAULT 'available',
  languages                 TEXT[] NOT NULL DEFAULT '{}',

  -- Location (server-validated against active states/lgas/areas —
  -- see profileService.assertLocationAllowed)
  state_id                  UUID REFERENCES states(id),
  lga_id                    UUID REFERENCES lgas(id),
  area_id                   UUID REFERENCES areas(id),
  street_address            VARCHAR(255),
  landmark                  VARCHAR(255),
  service_radius_km         SMALLINT,

  profile_picture_url       TEXT,

  -- Trust/visibility fields — read-only from the profile API.
  verification_status       verification_status NOT NULL DEFAULT 'not_submitted',
  is_pro                    BOOLEAN NOT NULL DEFAULT false,
  pro_expires_at            TIMESTAMPTZ,
  rating_avg                NUMERIC(3,2) NOT NULL DEFAULT 0,
  rating_count              INTEGER NOT NULL DEFAULT 0,
  completed_jobs_count      INTEGER NOT NULL DEFAULT 0,
  response_rate_percent     SMALLINT,
  profile_completion_percent SMALLINT NOT NULL DEFAULT 0,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS worker_profile_skills (
  worker_user_id  UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  skill_id        UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (worker_user_id, skill_id)
);

CREATE TABLE IF NOT EXISTS hirer_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  display_name        VARCHAR(150), -- individual hirer name or company name
  is_company          BOOLEAN NOT NULL DEFAULT false,
  bio                 TEXT,

  state_id            UUID REFERENCES states(id),
  lga_id              UUID REFERENCES lgas(id),
  area_id             UUID REFERENCES areas(id),

  profile_picture_url TEXT,

  jobs_posted_count   INTEGER NOT NULL DEFAULT 0,
  hires_completed_count INTEGER NOT NULL DEFAULT 0,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_profiles_state ON worker_profiles (state_id);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_verification ON worker_profiles (verification_status);
CREATE INDEX IF NOT EXISTS idx_worker_profiles_pro ON worker_profiles (is_pro);
CREATE INDEX IF NOT EXISTS idx_worker_profile_skills_skill ON worker_profile_skills (skill_id);
CREATE INDEX IF NOT EXISTS idx_hirer_profiles_state ON hirer_profiles (state_id);

DROP TRIGGER IF EXISTS trg_worker_profiles_updated_at ON worker_profiles;
CREATE TRIGGER trg_worker_profiles_updated_at
  BEFORE UPDATE ON worker_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_hirer_profiles_updated_at ON hirer_profiles;
CREATE TRIGGER trg_hirer_profiles_updated_at
  BEFORE UPDATE ON hirer_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
