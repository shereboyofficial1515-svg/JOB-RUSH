-- ============================================================
-- 068_call_events_and_notification_categories.sql
-- 1. A call outcome (missed, declined, ended with a duration) becomes a REAL
--    message in the conversation (message_type 'call', linked to the calls
--    row), instead of something the frontend would have to fake. One event
--    per call (unique index), so a repeated "call ended" can never add a
--    second card.
-- 2. 'call_missed' notification type for the notification centre.
-- 3. Per-category notification preferences, stored server-side.
-- 4. Partial index so the sweeper that times out unanswered calls is cheap.
-- Additive only: no existing row or column changes.
-- ============================================================

ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'call';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'call_missed';

ALTER TABLE messages ADD COLUMN IF NOT EXISTS call_id UUID REFERENCES calls(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_call_event ON messages (call_id) WHERE call_id IS NOT NULL;

ALTER TABLE notification_preferences ADD COLUMN IF NOT EXISTS category_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_calls_open ON calls (started_at) WHERE status IN ('calling', 'ringing', 'connecting');
