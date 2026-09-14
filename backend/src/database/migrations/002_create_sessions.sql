-- ============================================================
-- 002_create_sessions.sql
-- Server-authoritative sessions. The cookie only carries an opaque
-- token; every request re-checks this table so sessions can be
-- revoked (logout, logout-all-devices, admin force-logout) instantly.
-- ============================================================

CREATE TABLE IF NOT EXISTS sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- SHA-256 hash of the raw session token. The raw token is only ever
  -- held by the client cookie; the DB never stores it in plaintext.
  token_hash        CHAR(64) NOT NULL UNIQUE,

  ip_address        INET,
  user_agent        TEXT,
  device_label      VARCHAR(120),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL,
  revoked_at        TIMESTAMPTZ,
  revoked_reason    VARCHAR(60) -- 'logout' | 'logout_all' | 'password_change' | 'admin_action' | 'expired'
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active
  ON sessions (user_id, expires_at)
  WHERE revoked_at IS NULL;
