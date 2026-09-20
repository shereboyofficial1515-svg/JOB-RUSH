-- ============================================================
-- 054_create_device_push_tokens.sql
-- FCM device tokens for the Android app, kept as a separate table
-- from push_subscriptions (049) rather than reusing it — a Web Push
-- subscription is an {endpoint, p256dh, auth} triple the browser
-- generates, while an FCM token is a single opaque string Google's
-- servers issue to the Android app; forcing both shapes into one
-- table would mean nullable columns depending on platform. A user can
-- have several rows (e.g. the same account signed into the Android
-- app on two phones); each row is one device's current token.
-- ============================================================

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform      VARCHAR(20) NOT NULL DEFAULT 'android',
  token         TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_push_tokens_user ON device_push_tokens (user_id);

-- 'fcm' joins the existing in_app/email/sms/web_push delivery channels
-- so notificationService can log FCM attempts the same way.
ALTER TYPE notification_channel ADD VALUE IF NOT EXISTS 'fcm';
