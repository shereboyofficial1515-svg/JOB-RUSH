-- ============================================================
-- 063_add_ringtone_selection.sql
-- call_ringtone_enabled (047) only ever controlled ON/OFF -- there
-- was no column for WHICH ringtone plays, because only one tone
-- existed. Adds a selection column now that a small set of
-- synthesized tones exist to choose from (see
-- frontend/assets/audio/ringtones/).
-- ============================================================

ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS call_ringtone_id VARCHAR(20) NOT NULL DEFAULT 'classic';

DO $$ BEGIN
  ALTER TABLE user_settings ADD CONSTRAINT chk_call_ringtone_id
    CHECK (call_ringtone_id IN ('classic', 'chime', 'pulse'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
