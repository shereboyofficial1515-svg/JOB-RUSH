-- ============================================================
-- 050_create_business_experience_services_reports.sql
-- Adds the genuinely-missing pieces of the "rich professional
-- profile" feature set confirmed absent by a full codebase audit:
-- a business/store profile distinct from personal location, repeatable
-- work-experience entries, a per-service pricing catalog (previously
-- collapsed into a single flat worker_profiles.starting_price), and a
-- profile-reporting mechanism (previously only job/review/portfolio
-- had their own narrow *_reports table -- profiles/users had none).
-- Mirrors the existing patterns in 007/008/026/030/042 rather than
-- inventing new conventions.
-- ============================================================

-- ---------- Work experience ----------
-- Repeatable, ordered entries -- distinct from portfolios (which are
-- media-first project showcases, not employment-history records) and
-- from worker_profiles.experience_years (a single summary count).
CREATE TABLE IF NOT EXISTS work_experience (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  job_title         VARCHAR(150) NOT NULL,
  company_name      VARCHAR(150),
  description       TEXT,
  location          VARCHAR(255),
  start_date        DATE,
  end_date          DATE,
  is_current        BOOLEAN NOT NULL DEFAULT false,
  skills_used       TEXT[] NOT NULL DEFAULT '{}',
  sort_order        SMALLINT NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_work_experience_worker ON work_experience (worker_user_id, sort_order);

-- ---------- Business / store profile ----------
-- Deliberately a SEPARATE table from worker_profiles' own
-- street_address/landmark (the worker's private personal location) --
-- a business address is meant to be public, a home address never is.
-- One business profile per worker; is_enabled lets a worker fill this
-- in without immediately making it public.
CREATE TABLE IF NOT EXISTS business_profiles (
  worker_user_id    UUID PRIMARY KEY REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  business_name     VARCHAR(150) NOT NULL,
  description       TEXT,

  state_id          UUID REFERENCES states(id),
  lga_id            UUID REFERENCES lgas(id),
  area_id           UUID REFERENCES areas(id),
  address           VARCHAR(255),
  landmark          VARCHAR(255),

  opening_hours     VARCHAR(255),
  contact_phone     VARCHAR(30),
  contact_email     VARCHAR(255),

  storefront_photo_url TEXT,
  is_enabled        BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_media (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES business_profiles(worker_user_id) ON DELETE CASCADE,
  media_url         TEXT NOT NULL,
  sort_order        SMALLINT NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_business_media_worker ON business_media (worker_user_id, sort_order);

-- ---------- Professional services (per-service pricing catalog) ----------
-- Fills the confirmed gap between "one flat starting_price on the
-- whole profile" and genuine per-service pricing (Section 7/8 of the
-- feature spec). Independent of portfolios -- a service is an offering
-- a worker sells; a portfolio project is evidence of past work.
CREATE TYPE service_pricing_type AS ENUM ('hourly', 'daily', 'project', 'fixed', 'negotiable', 'contact_for_quote');

CREATE TABLE IF NOT EXISTS professional_services (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  name              VARCHAR(150) NOT NULL,
  description       TEXT,
  pricing_type      service_pricing_type NOT NULL DEFAULT 'fixed',
  price             NUMERIC(10,2),
  price_currency    VARCHAR(3) NOT NULL DEFAULT 'NGN',
  duration_estimate VARCHAR(100),
  is_active         BOOLEAN NOT NULL DEFAULT true,
  sort_order        SMALLINT NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A price only means something for the pricing types that quote one;
  -- negotiable/contact_for_quote must not carry a stale numeric price.
  CHECK (
    (pricing_type IN ('negotiable', 'contact_for_quote') AND price IS NULL)
    OR (pricing_type NOT IN ('negotiable', 'contact_for_quote'))
  )
);

CREATE INDEX IF NOT EXISTS idx_professional_services_worker ON professional_services (worker_user_id, sort_order);

-- ---------- Profile reports ----------
-- Mirrors job_reports/review_reports/portfolio_reports exactly (free-
-- text `reason`, no separate status/workflow columns -- moderation
-- action happens through the existing admin user-suspend capability
-- and is captured in admin_audit_logs, not tracked redundantly here).
-- `category` is additional structure the other three don't have,
-- since the feature spec calls for distinct, filterable report reasons
-- for profiles specifically (fake profile, fraud, harassment, etc.).
CREATE TABLE IF NOT EXISTS profile_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reported_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id),
  category          VARCHAR(50) NOT NULL,
  reason            VARCHAR(1000) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_reports_reported_user ON profile_reports (reported_user_id);

DROP TRIGGER IF EXISTS trg_work_experience_updated_at ON work_experience;
CREATE TRIGGER trg_work_experience_updated_at
  BEFORE UPDATE ON work_experience
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_business_profiles_updated_at ON business_profiles;
CREATE TRIGGER trg_business_profiles_updated_at
  BEFORE UPDATE ON business_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_professional_services_updated_at ON professional_services;
CREATE TRIGGER trg_professional_services_updated_at
  BEFORE UPDATE ON professional_services
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
