-- ============================================================
-- 043_add_pro_price_setting.sql
-- JOB RUSH PRO's price lived only in the PRO_MONTHLY_PRICE_NGN env
-- var, so changing it required a deploy, and there was no way for an
-- admin to see or change it at runtime. Moves it alongside the
-- existing platform_fee_percent in the same single-row settings
-- table. Seeded from the current env default (4000) so behavior is
-- unchanged until an admin actually edits it.
-- ============================================================

ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS pro_monthly_price_ngn INTEGER NOT NULL DEFAULT 4000;
