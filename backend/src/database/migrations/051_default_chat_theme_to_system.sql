-- ============================================================
-- 051_default_chat_theme_to_system.sql
-- chat_theme's default was 'dark', which made sense when the whole
-- app was a dark-first theme (the chat screen just matched everything
-- else by default). The app has since moved to a light-first visual
-- redesign, so a brand-new user defaulting to a dark chat screen
-- against an otherwise light app is now a jarring, unintentional
-- mismatch rather than a deliberate choice. 'system' is the more
-- honest default going forward -- it defers to the visitor's own OS
-- preference instead of this app silently picking one for them.
--
-- Existing users who already have an explicit 'dark' or 'light' row
-- are untouched -- this only changes the column's DEFAULT for future
-- inserts, not anyone's already-saved preference.
-- ============================================================

ALTER TABLE user_settings ALTER COLUMN chat_theme SET DEFAULT 'system';
