-- ============================================================
-- 016_create_platform_settings.sql
-- Single-row configuration table. Business rule #6 requires the
-- platform fee to be admin-configurable rather than hard-coded, so
-- escrowService reads this row instead of a constant.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1,
  platform_fee_percent  NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (platform_fee_percent >= 0 AND platform_fee_percent <= 100),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by            UUID REFERENCES users(id),

  CONSTRAINT platform_settings_single_row CHECK (id = 1)
);

INSERT INTO platform_settings (id, platform_fee_percent) VALUES (1, 10.00)
ON CONFLICT (id) DO NOTHING;
