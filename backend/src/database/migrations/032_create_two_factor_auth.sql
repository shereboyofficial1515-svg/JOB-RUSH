-- ============================================================
-- 032_create_two_factor_auth.sql
-- TOTP-based 2FA, available to any account but specifically what
-- admin_users.requires_2fa (existing since the auth module) now
-- actually enforces — see requireAdmin in middleware/authorize.js.
--
-- The TOTP secret is stored in plaintext in this column. That is a
-- real gap: production should encrypt it at rest (e.g. with a KMS-
-- managed key) rather than relying solely on database access control.
-- Noted here and in the README rather than glossed over.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_two_factor (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret          VARCHAR(64) NOT NULL,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  backup_codes    TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS two_factor_challenges (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_two_factor_challenges_user ON two_factor_challenges (user_id);

DROP TRIGGER IF EXISTS trg_user_two_factor_updated_at ON user_two_factor;
CREATE TRIGGER trg_user_two_factor_updated_at
  BEFORE UPDATE ON user_two_factor
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
