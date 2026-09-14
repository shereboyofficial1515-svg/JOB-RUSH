-- ============================================================
-- 001_create_users.sql
-- Core identity table. Roles are additive (a person can be a
-- worker and a hirer on one account per business rule #3).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE account_role AS ENUM ('worker', 'hirer', 'both');

CREATE TYPE account_status AS ENUM (
  'pending_verification', -- email/phone not yet confirmed
  'active',
  'suspended',
  'disabled'
);

CREATE TABLE IF NOT EXISTS users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                  CITEXT UNIQUE,
  phone                  VARCHAR(20) UNIQUE,
  password_hash          TEXT NOT NULL,
  full_name              VARCHAR(150) NOT NULL,
  role                   account_role NOT NULL DEFAULT 'worker',
  account_status         account_status NOT NULL DEFAULT 'pending_verification',

  email_verified_at      TIMESTAMPTZ,
  phone_verified_at      TIMESTAMPTZ,

  -- Login security / brute-force protection
  failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until           TIMESTAMPTZ,
  last_login_at          TIMESTAMPTZ,
  last_login_ip          INET,

  -- Password reset / credential rotation bookkeeping
  password_changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT users_email_or_phone_required
    CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);
CREATE INDEX IF NOT EXISTS idx_users_account_status ON users (account_status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
