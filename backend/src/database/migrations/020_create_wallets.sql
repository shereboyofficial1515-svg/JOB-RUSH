-- ============================================================
-- 020_create_wallets.sql
-- One wallet per user (worker or hirer — a hirer can receive
-- refunds into theirs). Balances are ONLY ever changed by
-- walletService, which locks the row (SELECT ... FOR UPDATE) and
-- writes a ledger entry in the same transaction as the balance
-- update — never a bare UPDATE from anywhere else in the codebase.
-- ============================================================

CREATE TABLE IF NOT EXISTS wallets (
  user_id             UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  available_balance   NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance     NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  currency            VARCHAR(3) NOT NULL DEFAULT 'NGN',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE wallet_transaction_type AS ENUM ('credit', 'debit');
CREATE TYPE wallet_transaction_category AS ENUM (
  'escrow_release',
  'refund',
  'withdrawal_hold',
  'withdrawal_reversed',
  'withdrawal_paid',
  'adjustment'
);

-- Append-only ledger. No UPDATE/DELETE path exists in the application
-- for this table — a correction is a new offsetting row, never an
-- edit to history.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_user_id  UUID NOT NULL REFERENCES wallets(user_id) ON DELETE CASCADE,

  type            wallet_transaction_type NOT NULL,
  category        wallet_transaction_category NOT NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_after   NUMERIC(14,2) NOT NULL,

  source_id       UUID, -- e.g. escrow_transactions.id or withdrawals.id, depending on category
  description     TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet ON wallet_transactions (wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_source ON wallet_transactions (source_id);

DROP TRIGGER IF EXISTS trg_wallets_updated_at ON wallets;
CREATE TRIGGER trg_wallets_updated_at
  BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
