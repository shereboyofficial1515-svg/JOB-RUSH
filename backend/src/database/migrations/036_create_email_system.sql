-- ============================================================
-- 036_create_email_system.sql
-- Backing store for the professional email system: a delivery log
-- (every send attempt, success or failure, without the email body —
-- see emailLogService for why) and the handful of notification_type
-- values that didn't already exist for events the email templates
-- now cover (contract creation, PRO renewal/cancellation, support
-- ticket creation, account deactivation). Everything else reuses the
-- existing notifications/notification_deliveries/notification_type
-- machinery from 029_create_notifications.sql — this is deliberately
-- small.
-- ============================================================

CREATE TYPE email_log_status AS ENUM ('sent', 'failed');

CREATE TABLE IF NOT EXISTS email_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES users(id) ON DELETE SET NULL,

  recipient             VARCHAR(255) NOT NULL,
  email_type            VARCHAR(60) NOT NULL, -- e.g. 'welcome', 'application_received'
  subject               VARCHAR(255) NOT NULL,

  provider_message_id   VARCHAR(120),
  status                email_log_status NOT NULL,
  error_message         TEXT,

  related_entity_type   VARCHAR(40),  -- e.g. 'application', 'contract', 'subscription'
  related_entity_id     UUID,

  sent_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_type ON email_logs (email_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs (sent_at DESC);

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'contract_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_renewed';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_cancelled';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'support_ticket_created';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'support_ticket_updated';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'account_deactivated';
