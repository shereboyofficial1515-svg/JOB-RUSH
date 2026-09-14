-- ============================================================
-- 028_create_subscriptions.sql
-- JOB RUSH PRO. `subscriptions.status` only ever moves to 'active'
-- after Paystack independently confirms a successful charge (same
-- verify-before-trust pattern as escrow funding). is_pro/pro_expires_at
-- on worker_profiles are written exclusively by subscriptionService —
-- another instance of the "one trusted writer per trust field"
-- pattern already used for verification_status and rating_avg.
-- ============================================================

CREATE TYPE subscription_status AS ENUM ('pending', 'active', 'cancelled', 'expired', 'failed', 'suspended');

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id        UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  plan                  VARCHAR(40) NOT NULL DEFAULT 'pro_monthly',
  amount                NUMERIC(10,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status                subscription_status NOT NULL DEFAULT 'pending',

  paystack_reference        VARCHAR(100) NOT NULL UNIQUE,
  paystack_subscription_code VARCHAR(100),
  paystack_email_token      VARCHAR(100),

  auto_renew            BOOLEAN NOT NULL DEFAULT true,
  start_date            TIMESTAMPTZ,
  expiry_date           TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  suspended_at          TIMESTAMPTZ,
  suspension_reason     TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_payments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id         UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

  amount                  NUMERIC(10,2) NOT NULL,
  currency                VARCHAR(3) NOT NULL DEFAULT 'NGN',
  paystack_reference      VARCHAR(100) NOT NULL UNIQUE,
  paystack_transaction_id VARCHAR(100),
  status                  VARCHAR(20) NOT NULL DEFAULT 'success',

  billing_period_start    TIMESTAMPTZ,
  billing_period_end      TIMESTAMPTZ,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_worker ON subscriptions (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_subscription ON subscription_payments (subscription_id);

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
