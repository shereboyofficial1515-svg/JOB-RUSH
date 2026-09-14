-- ============================================================
-- 019_create_escrow.sql
-- Tracks money secured against a contract (or a specific milestone).
-- `status` only advances through service-layer functions that hold a
-- row lock and check the current status first — see escrowService.
-- ============================================================

CREATE TYPE escrow_status AS ENUM ('pending_funding', 'funded', 'released', 'refunded', 'disputed');

CREATE TABLE IF NOT EXISTS escrow_transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id           UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  milestone_id          UUID REFERENCES milestones(id) ON DELETE SET NULL, -- null = whole-contract escrow

  hirer_user_id         UUID NOT NULL REFERENCES hirer_profiles(user_id),
  worker_user_id        UUID NOT NULL REFERENCES worker_profiles(user_id),

  amount                NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  platform_fee_percent  NUMERIC(5,2) NOT NULL,
  platform_fee_amount   NUMERIC(12,2) NOT NULL,
  worker_payout_amount  NUMERIC(12,2) NOT NULL,
  currency              VARCHAR(3) NOT NULL DEFAULT 'NGN',

  status                escrow_status NOT NULL DEFAULT 'pending_funding',
  payment_id            UUID REFERENCES payments(id),

  funded_at             TIMESTAMPTZ,
  released_at           TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT escrow_amounts_consistent CHECK (
    platform_fee_amount + worker_payout_amount = amount
  )
);

CREATE INDEX IF NOT EXISTS idx_escrow_contract ON escrow_transactions (contract_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_transactions (status);
CREATE INDEX IF NOT EXISTS idx_escrow_payment ON escrow_transactions (payment_id);

DROP TRIGGER IF EXISTS trg_escrow_updated_at ON escrow_transactions;
CREATE TRIGGER trg_escrow_updated_at
  BEFORE UPDATE ON escrow_transactions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
