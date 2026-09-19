-- ============================================================
-- 049_create_push_subscriptions.sql
-- Web Push subscriptions (VAPID) for new-message and incoming-call
-- alerts to reach the user when the Job Rush tab isn't the active,
-- visible one. A user can have several subscriptions (one per
-- browser/device they've granted permission on); each is a distinct
-- row keyed by its unique push endpoint URL.
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    VARCHAR(300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);

-- 'web_push' joins the existing in_app/email/sms delivery channels so
-- notificationService can log web-push attempts the same way it
-- already logs the other three.
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'web_push';

-- Per-user opt-out for push specifically, mirroring the existing
-- email_enabled/sms_enabled toggles on notification_preferences.
ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true;
