-- ============================================================
-- 034_create_known_devices.sql
-- Lightweight new-device detection: fingerprints a login by hashing
-- the User-Agent string per user. No IP geolocation service is
-- configured in this codebase, so this is scoped to "have we seen
-- this browser/device sign in before," not "is this a suspicious
-- country" — a real but honest scope limit, not a placeholder.
-- ============================================================

CREATE TABLE IF NOT EXISTS known_devices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint_hash  CHAR(64) NOT NULL,
  user_agent        TEXT,
  last_ip           INET,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (user_id, fingerprint_hash)
);

CREATE INDEX IF NOT EXISTS idx_known_devices_user ON known_devices (user_id);

-- New notification type for the alert this module sends.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_device_login';
