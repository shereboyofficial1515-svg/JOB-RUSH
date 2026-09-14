-- ============================================================
-- 009_create_verification.sql
-- Identity verification workflow feeding worker_profiles.verification_status.
-- Documents live in a PRIVATE Supabase Storage bucket — storage_path
-- here is never turned into a public URL; access must go through a
-- signed URL issued server-side after an ownership/admin check
-- (see verificationService + the storage module).
-- ============================================================

CREATE TABLE IF NOT EXISTS verification_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id      UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  status              verification_status NOT NULL DEFAULT 'submitted',
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at         TIMESTAMPTZ,
  reviewed_by         UUID REFERENCES users(id), -- must be a verification_admin/super_admin at review time
  rejection_reason    TEXT,
  resubmission_notes  TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS verification_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_request_id UUID NOT NULL REFERENCES verification_requests(id) ON DELETE CASCADE,

  document_type           VARCHAR(60) NOT NULL, -- e.g. 'government_id', 'proof_of_address', 'certification'
  storage_path             TEXT NOT NULL,        -- private bucket path, never a public URL

  uploaded_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_requests_worker ON verification_requests (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_verification_requests_status ON verification_requests (status);
CREATE INDEX IF NOT EXISTS idx_verification_documents_request ON verification_documents (verification_request_id);

DROP TRIGGER IF EXISTS trg_verification_requests_updated_at ON verification_requests;
CREATE TRIGGER trg_verification_requests_updated_at
  BEFORE UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
