-- ============================================================
-- 065_service_duration_and_business_hours.sql
--
-- 1. professional_services.duration_estimate was free text with no unit
--    (a real row holds the bare string "30", which a reader cannot tell
--    from 30 hours, days, projects...). Duration becomes two columns:
--    duration_value (whole number, 1-999) + duration_unit
--    (hours | days | weeks | months | years), kept together by a CHECK so a
--    value can never exist without its unit (or vice versa).
--
-- 2. business_profiles.opening_hours was free text ("Mon-Fri, 10am-5am").
--    opening_hours_structured stores a 7-entry JSONB array, one object per
--    weekday Monday..Sunday:
--      { "day": "monday", "open": true, "is24h": false,
--        "opens": "10:00", "closes": "17:00", "endsNextDay": false }
--      { "day": "saturday", "open": false }
--    (times are 24-hour HH:MM; full validation lives in the API layer.)
--
-- 3. service_pricing_type gains 'weekly' and 'monthly' so prices can be
--    quoted per week / per month alongside the existing hourly / daily /
--    project / fixed / negotiable / contact_for_quote.
--
-- Additive only. The old free-text columns (duration_estimate,
-- opening_hours) are LEFT IN PLACE and untouched: legacy values are
-- converted by the separate, idempotent, dry-run-first script
-- src/database/backfillStructuredSchedules.js, which converts only values it
-- can read with certainty and leaves the original text for everything else.
-- Old application code keeps working against this schema (it ignores the new
-- columns), so the migration can be applied before the new code deploys.
-- ============================================================

ALTER TYPE service_pricing_type ADD VALUE IF NOT EXISTS 'weekly';
ALTER TYPE service_pricing_type ADD VALUE IF NOT EXISTS 'monthly';

ALTER TABLE professional_services
  ADD COLUMN IF NOT EXISTS duration_value INTEGER,
  ADD COLUMN IF NOT EXISTS duration_unit VARCHAR(10);

ALTER TABLE professional_services
  ADD CONSTRAINT professional_services_duration_chk CHECK (
    (duration_value IS NULL AND duration_unit IS NULL)
    OR (duration_value BETWEEN 1 AND 999 AND duration_unit IN ('hours', 'days', 'weeks', 'months', 'years'))
  );

COMMENT ON COLUMN professional_services.duration_estimate IS 'Legacy free-text duration, superseded by duration_value + duration_unit. Kept read-only for services that were never resaved or could not be converted with certainty.';
COMMENT ON COLUMN professional_services.duration_value IS 'Project duration amount (1-999); meaningless without duration_unit.';
COMMENT ON COLUMN professional_services.duration_unit IS 'hours | days | weeks | months | years';

ALTER TABLE business_profiles
  ADD COLUMN IF NOT EXISTS opening_hours_structured JSONB;

ALTER TABLE business_profiles
  ADD CONSTRAINT business_profiles_hours_shape_chk CHECK (
    opening_hours_structured IS NULL
    OR (jsonb_typeof(opening_hours_structured) = 'array' AND jsonb_array_length(opening_hours_structured) = 7)
  );

COMMENT ON COLUMN business_profiles.opening_hours IS 'Legacy free-text opening hours, superseded by opening_hours_structured. Kept read-only for profiles that were never resaved or could not be converted with certainty.';
COMMENT ON COLUMN business_profiles.opening_hours_structured IS '7-entry array (Monday..Sunday) of {day, open, is24h, opens, closes, endsNextDay}; times are 24-hour HH:MM.';
