-- ============================================================
-- 066_messaging_v2.sql
--
-- Backs the full-screen messaging redesign. Additive only: no column or
-- table is dropped or rewritten, and existing rows keep working.
--
--  * messages.reply_to_message_id   real reply relationship (not visual text)
--  * messages.client_message_id     idempotency key so a retried send after a
--                                   flaky connection can never create a duplicate
--  * message_media metadata         original file name, detected MIME type,
--                                   voice-note duration + waveform, image size,
--                                   thumbnail object
--  * message_pins                   shared per-conversation pinned messages
--  * message_hidden                 "delete for me" (per-user, other side untouched)
--  * conversation_participants.muted_until   per-user mute of new-message alerts
--  * indexes for the pagination / lookup paths the new endpoints use
-- ============================================================

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_message_id UUID;

-- One logical send per (sender, client id). NULL client ids (older clients,
-- system messages) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_sender_client_id
  ON messages (sender_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;

-- Newest-first pagination ("load older") and the (created_at, id) tuple
-- cursor both walk this index in order.
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_desc
  ON messages (conversation_id, created_at DESC, id DESC);

ALTER TABLE message_media
  ADD COLUMN IF NOT EXISTS file_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER,
  ADD COLUMN IF NOT EXISTS waveform JSONB,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER,
  ADD COLUMN IF NOT EXISTS thumbnail_path TEXT;

COMMENT ON COLUMN message_media.file_name IS 'Display-only original file name (sanitised). Never used to build a storage path.';
COMMENT ON COLUMN message_media.mime_type IS 'MIME type detected from the file bytes server-side, not the client-declared one.';
COMMENT ON COLUMN message_media.waveform IS 'Voice notes: small array of 0-100 peak values for the bubble waveform.';
COMMENT ON COLUMN message_media.thumbnail_path IS 'Images: small preview object in the same private bucket.';

CREATE TABLE IF NOT EXISTS message_pins (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_pins_conversation ON message_pins (conversation_id, pinned_at DESC);

CREATE TABLE IF NOT EXISTS message_hidden (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  hidden_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_message_hidden_message ON message_hidden (message_id);

ALTER TABLE conversation_participants
  ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

COMMENT ON COLUMN conversation_participants.muted_until IS 'New-message alerts for this conversation are suppressed for this user until this time (NULL = not muted).';
