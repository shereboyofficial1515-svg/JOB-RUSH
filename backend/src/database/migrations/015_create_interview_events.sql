-- ============================================================
-- 015_create_interview_events.sql
-- Lifecycle timeline for a single interview (created, accepted,
-- joined, left, completed, etc). Distinct from admin_audit_logs,
-- which covers platform-wide admin/security actions — this is
-- domain-specific and safe to show to both participants as an
-- activity timeline (event_type + timestamp only; no private note
-- content ever lands here).
-- ============================================================

CREATE TABLE IF NOT EXISTS interview_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  actor_user_id   UUID REFERENCES users(id),
  event_type      VARCHAR(60) NOT NULL, -- 'created' | 'invited' | 'accepted' | 'declined' | 'reschedule_requested' | 'rescheduled' | 'cancelled' | 'joined' | 'left' | 'completed' | 'no_show'
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_events_interview ON interview_events (interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_events_created_at ON interview_events (created_at);
