-- ============================================================
-- 039_add_pricing_availability_video_meta.sql
-- Professional worker profile gaps found by direct code inspection:
-- no pricing field existed anywhere for a worker's own rates (jobs
-- have per-posting budgets, contracts have agreed amounts, but
-- nothing represents "what a worker generally charges"), no working-
-- schedule fields beyond the existing availability_status enum, and
-- portfolio_media had no video duration/dimensions to validate or
-- display against — file_size was the only metadata added so far
-- (see migration 035).
-- ============================================================

ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS starting_price NUMERIC(10,2);
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS price_currency VARCHAR(3) NOT NULL DEFAULT 'NGN';
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS working_days VARCHAR(100);
ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS working_hours VARCHAR(100);

ALTER TABLE portfolio_media ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;
ALTER TABLE portfolio_media ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE portfolio_media ADD COLUMN IF NOT EXISTS height INTEGER;
