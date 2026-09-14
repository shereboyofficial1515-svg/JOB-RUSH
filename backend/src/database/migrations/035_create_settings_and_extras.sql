-- ============================================================
-- 035_create_settings_and_extras.sql
-- Backing store for the full Profile Settings experience: account
-- preferences (messaging permission, profile visibility, application
-- defaults), chat preferences, and accessibility preferences all live
-- in one `user_settings` row per user — one place, one join, instead
-- of scattering unrelated toggles across worker_profiles/hirer_profiles.
--
-- Also extends a few existing tables with the minimum needed to make
-- the settings that depend on them real rather than cosmetic:
--   - conversation_participants.archived_at  → "Archived chats"
--   - portfolio_media.file_size / verification_documents.file_size
--     → accurate "Storage usage" (message_media already tracks this)
--   - users.deactivated_at / deleted_at      → Deactivate / Delete account
--   - support_tickets gets an attachment + an optional reported-user
--     reference, and a status a ticket can sit in while waiting on the
--     reporter rather than only "open"/"in_progress"
-- ============================================================

CREATE TYPE messaging_permission AS ENUM ('everyone', 'connections_only', 'no_one');
CREATE TYPE profile_visibility_setting AS ENUM ('public', 'private');
CREATE TYPE text_size_preference AS ENUM ('small', 'default', 'large', 'extra_large');
CREATE TYPE media_auto_download_preference AS ENUM ('never', 'wifi_only', 'always');
CREATE TYPE chat_theme_preference AS ENUM ('dark', 'light', 'system');

CREATE TABLE IF NOT EXISTS user_settings (
  user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Account & Security
  messaging_permission    messaging_permission NOT NULL DEFAULT 'everyone',
  profile_visibility      profile_visibility_setting NOT NULL DEFAULT 'public',
  default_cover_note      TEXT,                          -- worker: pre-fills the Apply modal
  require_cover_note      BOOLEAN NOT NULL DEFAULT false, -- hirer: enforced on applications to their jobs

  -- Chat
  chat_theme              chat_theme_preference NOT NULL DEFAULT 'dark',
  chat_wallpaper          VARCHAR(40) NOT NULL DEFAULT 'default',
  chat_font_size          text_size_preference NOT NULL DEFAULT 'default',
  chat_message_previews   BOOLEAN NOT NULL DEFAULT true,
  media_auto_download     media_auto_download_preference NOT NULL DEFAULT 'wifi_only',

  -- Accessibility (applied app-wide, not just on the settings page)
  text_size               text_size_preference NOT NULL DEFAULT 'default',
  high_contrast           BOOLEAN NOT NULL DEFAULT false,
  reduced_motion          BOOLEAN NOT NULL DEFAULT false,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_settings_updated_at ON user_settings;
CREATE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Archived chats — per-participant, same pattern as the existing
-- per-participant `cleared_before` ("clear chat").
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

-- File sizes for accurate storage-usage reporting. message_media
-- already has this; portfolio/verification uploads didn't track it.
ALTER TABLE portfolio_media ADD COLUMN IF NOT EXISTS file_size INTEGER;
ALTER TABLE verification_documents ADD COLUMN IF NOT EXISTS file_size INTEGER;

-- Deactivate (self-service, reversible by logging back in) vs Delete
-- (self-service, redacts PII, irreversible) — both distinct from the
-- existing admin-only 'suspended'/'disabled' account_status values.
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- OTP-verified change-of-contact-detail flows reuse the existing OTP
-- system rather than inventing a second one.
ALTER TYPE otp_purpose ADD VALUE IF NOT EXISTS 'change_email';
ALTER TYPE otp_purpose ADD VALUE IF NOT EXISTS 'change_phone';

-- A ticket can be waiting on the reporter, not just open/in_progress.
ALTER TYPE support_ticket_status ADD VALUE IF NOT EXISTS 'awaiting_response';

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS attachment_path TEXT;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS reported_user_id UUID REFERENCES users(id);

-- Help & Feedback: feature requests / bug reports / complaints / general
-- feedback. Kept separate from support_tickets — this has no
-- open/in-progress/resolved workflow, it's a one-way submission.
CREATE TYPE feedback_type AS ENUM ('feature_request', 'bug_report', 'complaint', 'general');

CREATE TABLE IF NOT EXISTS feedback_submissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          feedback_type NOT NULL,
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback_submissions (user_id);
