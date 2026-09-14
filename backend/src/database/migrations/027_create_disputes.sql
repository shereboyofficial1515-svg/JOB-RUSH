-- ============================================================
-- 027_create_disputes.sql
-- Either party can open a dispute against a contract. Evidence files
-- go to a private bucket (dispute-evidence) — only the two parties
-- and disputes-handling admins can ever resolve a storage_path here
-- to a signed URL, same pattern as verification documents and chat
-- media.
-- ============================================================

CREATE TYPE dispute_status AS ENUM (
  'open', 'under_review', 'awaiting_information', 'resolved', 'rejected', 'escalated'
);

CREATE TABLE IF NOT EXISTS disputes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id           UUID NOT NULL REFERENCES contracts(id),
  escrow_transaction_id UUID REFERENCES escrow_transactions(id),

  opened_by_user_id     UUID NOT NULL REFERENCES users(id),
  against_user_id       UUID NOT NULL REFERENCES users(id),

  reason                VARCHAR(150) NOT NULL,
  description           TEXT NOT NULL,
  status                dispute_status NOT NULL DEFAULT 'open',

  admin_decision        TEXT,
  resolution_action     VARCHAR(30), -- 'release_to_worker' | 'refund_to_hirer' | null (rejected/escalated)
  resolved_by           UUID REFERENCES users(id),
  resolved_at           TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id        UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  uploaded_by       UUID NOT NULL REFERENCES users(id),
  file_type         VARCHAR(20) NOT NULL, -- 'image' | 'video' | 'document'
  storage_path      TEXT NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_contract ON disputes (contract_id);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes (status);
CREATE INDEX IF NOT EXISTS idx_disputes_opened_by ON disputes (opened_by_user_id);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);

DROP TRIGGER IF EXISTS trg_disputes_updated_at ON disputes;
CREATE TRIGGER trg_disputes_updated_at
  BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
