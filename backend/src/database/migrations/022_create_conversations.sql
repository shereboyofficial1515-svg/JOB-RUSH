-- ============================================================
-- 022_create_conversations.sql
-- 1-to-1 conversations. `conversation_participants` is the actual
-- authorization source (who may read/send in a conversation) — not
-- an assumption based on how the conversation was created. `job_id`
-- links a conversation to the job context it started from, where
-- applicable (spec allows starting a conversation from a profile,
-- application, or interview too — job_id is nullable for those).
-- ============================================================

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID REFERENCES jobs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  joined_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at      TIMESTAMPTZ,
  -- Messages created before this timestamp are hidden from this
  -- participant's view ("Clear chat" — per-participant, not a real
  -- delete, so the other party's history is untouched).
  cleared_before    TIMESTAMPTZ,

  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations (last_message_at);
