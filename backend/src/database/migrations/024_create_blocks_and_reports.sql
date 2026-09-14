-- ============================================================
-- 024_create_blocks_and_reports.sql
-- Blocking is directional and checked in both directions before any
-- new conversation or message is allowed (see messageService) — if
-- either party has blocked the other, messaging is refused.
-- ============================================================

CREATE TABLE IF NOT EXISTS blocked_users (
  blocker_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CONSTRAINT blocked_users_no_self_block CHECK (blocker_user_id != blocked_user_id)
);

CREATE TABLE IF NOT EXISTS message_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id),
  reason            VARCHAR(500) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users (blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_message_reports_message ON message_reports (message_id);
