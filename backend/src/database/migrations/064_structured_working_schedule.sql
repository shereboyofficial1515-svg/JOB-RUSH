-- ============================================================
-- 064_structured_working_schedule.sql
-- worker_profiles.working_days / working_hours were free-text
-- VARCHAR columns, letting users type inconsistent formats
-- ("Mon-Fri", "Monday to Friday", "8am-6am", "8:00am - 18:00", ...).
-- Confirmed via direct query against production that at least one
-- real profile already has ambiguous data ("8am-6am" — almost
-- certainly meant to be 8am-6pm, but not safe to guess).
--
-- Adds structured columns instead of touching the old ones — the old
-- free-text values are LEFT ALONE (not parsed, not migrated, not
-- deleted). A profile with only legacy data keeps rendering it as
-- before; the new UI writes only to the new columns. This is the
-- deliberately conservative choice per the "do not silently corrupt
-- existing profiles / do not guess ambiguous values" rule — "Mon-Fri"
-- could be auto-parsed reliably, but "8am-6am" cannot, so nothing is
-- auto-converted at all rather than converting some and not others.
-- ============================================================

ALTER TABLE worker_profiles
  ADD COLUMN IF NOT EXISTS working_days_structured TEXT[],
  ADD COLUMN IF NOT EXISTS working_hours_start TIME,
  ADD COLUMN IF NOT EXISTS working_hours_end TIME,
  ADD COLUMN IF NOT EXISTS working_hours_ends_next_day BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN worker_profiles.working_days IS 'Legacy free-text value, superseded by working_days_structured. Kept read-only for old profiles that never resaved.';
COMMENT ON COLUMN worker_profiles.working_hours IS 'Legacy free-text value, superseded by working_hours_start/end. Kept read-only for old profiles that never resaved.';
