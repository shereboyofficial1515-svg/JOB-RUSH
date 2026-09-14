-- ============================================================
-- 021_create_withdrawals.sql
-- Withdrawal requests. The raw bank account number is used only
-- transiently (server-side) to create a Paystack transfer recipient
-- — only the LAST FOUR digits and the resulting recipient_code are
-- ever persisted here. See withdrawalService for the flow.
-- ============================================================

CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'rejected', 'processing', 'paid', 'failed');

CREATE TABLE IF NOT EXISTS withdrawals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id          UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  amount                  NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency                VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status                  withdrawal_status NOT NULL DEFAULT 'pending',

  bank_account_name       VARCHAR(150) NOT NULL,
  bank_account_number_last4 VARCHAR(4) NOT NULL,
  bank_code               VARCHAR(10) NOT NULL,
  paystack_recipient_code VARCHAR(100),
  paystack_transfer_code  VARCHAR(100),
  paystack_transfer_reference VARCHAR(100),

  requested_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at            TIMESTAMPTZ,
  processed_by            UUID REFERENCES users(id), -- admin who approved/rejected
  rejection_reason        TEXT,
  failure_reason          TEXT,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_worker ON withdrawals (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals (status);

DROP TRIGGER IF EXISTS trg_withdrawals_updated_at ON withdrawals;
CREATE TRIGGER trg_withdrawals_updated_at
  BEFORE UPDATE ON withdrawals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
