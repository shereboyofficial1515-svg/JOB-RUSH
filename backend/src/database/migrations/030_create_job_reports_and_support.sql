-- ============================================================
-- 030_create_job_reports_and_support.sql
-- Job reports feed the admin job-moderation queue. Support tickets
-- are a simple single-thread model (subject/description + one admin
-- response) — enough for spec section 62/67's SUPPORT requirement
-- without building a full multi-message helpdesk thread.
-- ============================================================

CREATE TABLE IF NOT EXISTS job_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reporter_user_id  UUID NOT NULL REFERENCES users(id),
  reason            VARCHAR(500) NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_reports_job ON job_reports (job_id);

CREATE TYPE support_ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');

CREATE TABLE IF NOT EXISTS support_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  subject           VARCHAR(200) NOT NULL,
  description       TEXT NOT NULL,
  category          VARCHAR(50),
  status            support_ticket_status NOT NULL DEFAULT 'open',

  admin_response    TEXT,
  handled_by        UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status);

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
