-- ============================================================
-- 047_add_call_ringtone_setting.sql
--
-- No existing notification/settings column controls call audio --
-- adding one clearly-scoped toggle rather than overloading the
-- unrelated in_app_enabled/email_enabled channel switches in
-- notification_preferences (029_create_notifications.sql), which are
-- about delivery channels, not sound.
-- ============================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS call_ringtone_enabled BOOLEAN NOT NULL DEFAULT true;
