-- ============================================================
-- 018_create_payments.sql
-- One row per Paystack transaction attempt. `status` only ever moves
-- to 'success' after this platform independently verifies the
-- transaction against the Paystack API (or a signature-verified
-- webhook) — never because the frontend said so. `reference` is the
-- idempotency key shared with Paystack.
-- ============================================================

CREATE TYPE payment_status AS ENUM ('pending', 'success', 'failed', 'abandoned');
CREATE TYPE payment_purpose AS ENUM ('escrow_funding');

CREATE TABLE IF NOT EXISTS payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_user_id         UUID NOT NULL REFERENCES users(id),

  purpose               payment_purpose NOT NULL,
  -- Polymorphic-by-purpose reference (currently only escrow funding,
  -- pointing at a contract or milestone id) — kept as a plain UUID
  -- rather than a strict FK since the target table depends on purpose.
  target_id             UUID NOT NULL,

  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency              VARCHAR(3) NOT NULL DEFAULT 'NGN',

  paystack_reference    VARCHAR(100) NOT NULL UNIQUE,
  paystack_transaction_id VARCHAR(100),
  status                payment_status NOT NULL DEFAULT 'pending',

  verified_at           TIMESTAMPTZ,
  metadata              JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_payer ON payments (payer_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments (status);
CREATE INDEX IF NOT EXISTS idx_payments_target ON payments (target_id);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
