-- ============================================================
-- 017_create_contracts.sql
-- A contract is created after a hire decision (application.status =
-- 'hired') and is what escrow funding attaches to. Milestones are
-- optional — a contract with none is funded/released as one lump sum.
-- ============================================================

CREATE TYPE contract_status AS ENUM ('active', 'completed', 'cancelled', 'disputed');
CREATE TYPE milestone_status AS ENUM ('pending', 'funded', 'submitted', 'approved', 'released', 'disputed');

CREATE TABLE IF NOT EXISTS contracts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id),
  application_id    UUID NOT NULL REFERENCES applications(id),
  hirer_user_id     UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,
  worker_user_id    UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  agreed_amount     NUMERIC(12,2) NOT NULL CHECK (agreed_amount > 0),
  currency          VARCHAR(3) NOT NULL DEFAULT 'NGN',
  status            contract_status NOT NULL DEFAULT 'active',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (application_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id   UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  title         VARCHAR(150) NOT NULL,
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  sequence      SMALLINT NOT NULL DEFAULT 1,
  status        milestone_status NOT NULL DEFAULT 'pending',
  due_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contracts_hirer ON contracts (hirer_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_worker ON contracts (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_milestones_contract ON milestones (contract_id);

DROP TRIGGER IF EXISTS trg_contracts_updated_at ON contracts;
CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_milestones_updated_at ON milestones;
CREATE TRIGGER trg_milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
