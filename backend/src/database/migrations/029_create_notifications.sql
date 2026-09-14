-- ============================================================
-- 029_create_notifications.sql
-- In-app notification feed plus a delivery log for the other two
-- channels (email/SMS). `notifications` is what the frontend reads
-- for the bell icon; `notification_deliveries` is an audit trail of
-- what was actually attempted/sent on each channel, kept separate so
-- a failed email doesn't affect the in-app read/unread state.
-- ============================================================

CREATE TYPE notification_type AS ENUM (
  'new_message',
  'application_received',
  'application_status_changed',
  'job_invitation',
  'interview_scheduled',
  'interview_response',
  'interview_reminder',
  'interview_cancelled',
  'escrow_funded',
  'escrow_released',
  'withdrawal_approved',
  'withdrawal_rejected',
  'verification_approved',
  'verification_rejected',
  'subscription_activated',
  'subscription_expiring',
  'subscription_expired',
  'review_received',
  'dispute_opened',
  'dispute_resolved',
  'announcement'
);

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  type        notification_type NOT NULL,
  title       VARCHAR(150) NOT NULL,
  body        TEXT,
  data        JSONB,

  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  email_enabled     BOOLEAN NOT NULL DEFAULT true,
  sms_enabled       BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled    BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'sms');
CREATE TYPE notification_delivery_status AS ENUM ('sent', 'failed', 'skipped');

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id   UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel           notification_channel NOT NULL,
  status            notification_delivery_status NOT NULL,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_notification ON notification_deliveries (notification_id);

DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at ON notification_preferences;
CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
