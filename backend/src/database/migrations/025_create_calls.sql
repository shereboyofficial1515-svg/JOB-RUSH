-- ============================================================
-- 025_create_calls.sql
-- Call records for LiveKit audio/video calls initiated from a
-- conversation. Authorization for joining follows the same pattern
-- as interviews: participant check + status check, done in
-- callService before any LiveKit token is issued.
-- ============================================================

CREATE TYPE call_type AS ENUM ('audio', 'video');
CREATE TYPE call_status AS ENUM (
  'calling', 'ringing', 'connecting', 'connected', 'reconnecting',
  'busy', 'declined', 'missed', 'ended'
);

CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  caller_user_id    UUID NOT NULL REFERENCES users(id),
  callee_user_id    UUID NOT NULL REFERENCES users(id),

  call_type         call_type NOT NULL,
  status            call_status NOT NULL DEFAULT 'calling',

  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  connected_at      TIMESTAMPTZ,
  ended_at          TIMESTAMPTZ,
  duration_seconds  INTEGER,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls (conversation_id);
CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls (caller_user_id);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls (callee_user_id);
