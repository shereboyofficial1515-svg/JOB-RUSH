-- ============================================================
-- 004_create_admin_and_audit.sql
-- Admin is a privilege layered on top of a normal user account,
-- not a separate identity system — same login, extra table grants
-- extra server-side permissions. No admin role is super_admin by
-- default; that must be assigned deliberately.
-- ============================================================

CREATE TYPE admin_role AS ENUM (
  'super_admin',
  'verification_admin',
  'support_admin',
  'finance_admin',
  'moderation_admin',
  'content_admin'
);

CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  admin_role    admin_role NOT NULL,
  requires_2fa  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users (user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   UUID REFERENCES users(id),
  action          VARCHAR(80) NOT NULL,     -- e.g. 'ADMIN_LOGIN', 'USER_SUSPENDED'
  resource_type   VARCHAR(60),              -- e.g. 'user', 'session'
  resource_id     UUID,
  result          VARCHAR(20) NOT NULL,     -- 'success' | 'failure'
  metadata        JSONB,
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON admin_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON admin_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON admin_audit_logs (created_at);

-- Audit rows are append-only: revoke UPDATE/DELETE from the application
-- role in production so even a compromised app account can't tamper
-- with the trail. Replace `app_user` with your actual DB role name.
-- REVOKE UPDATE, DELETE ON admin_audit_logs FROM app_user;
