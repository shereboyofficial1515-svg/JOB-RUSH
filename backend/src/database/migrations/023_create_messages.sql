-- ============================================================
-- 023_create_messages.sql
-- `edited_at`/`is_edited` are set only by messageService after it
-- has independently checked the 20-minute edit window server-side
-- (business rule / spec section 52) — never trusted from the client.
-- `deleted_at` is a real soft-delete of the message itself (sender
-- deleting their own message), distinct from a participant's
-- per-user "clear chat" (conversation_participants.cleared_before).
-- ============================================================

CREATE TYPE message_type AS ENUM ('text', 'image', 'video', 'document', 'voice_note', 'system');

CREATE TABLE IF NOT EXISTS messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES users(id),

  message_type      message_type NOT NULL DEFAULT 'text',
  content           TEXT, -- null for pure-media messages

  is_edited         BOOLEAN NOT NULL DEFAULT false,
  edited_at         TIMESTAMPTZ,
  deleted_at        TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS message_media (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  media_type    VARCHAR(20) NOT NULL, -- 'image' | 'video' | 'document' | 'voice_note'
  storage_path  TEXT NOT NULL,        -- private bucket; access via signed URL only
  file_size     INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_message_media_message ON message_media (message_id);
