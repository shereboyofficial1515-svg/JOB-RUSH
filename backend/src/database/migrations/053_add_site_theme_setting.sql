-- ============================================================
-- 053_add_site_theme_setting.sql
-- Site-wide light/dark/system theme (distinct from chat_theme, which
-- only ever affected the messaging screen). Reuses the existing
-- chat_theme_preference enum ('dark' | 'light' | 'system') rather than
-- creating a near-identical type. Defaults to 'system' so a first-time
-- visitor gets their OS's prefers-color-scheme until they explicitly
-- pick a theme in Settings, matching chat_theme's own default.
-- ============================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS site_theme chat_theme_preference NOT NULL DEFAULT 'system';
