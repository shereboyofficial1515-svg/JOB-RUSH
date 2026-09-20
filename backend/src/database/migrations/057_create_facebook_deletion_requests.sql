-- ============================================================
-- 057_create_facebook_deletion_requests.sql
-- Records every Facebook "User Data Deletion Request" callback Meta
-- sends us — required so the confirmation URL/code we hand back to
-- Facebook (and show the user at /data-deletion?id=...) actually
-- resolves to something real, and so there's an audit trail of every
-- deletion Meta itself triggered (as opposed to one the user
-- triggered directly from Settings, which is already covered by
-- admin_audit_logs's existing ACCOUNT_DELETED action).
--
-- job_rush_user_id is nullable: Meta calls this endpoint whenever
-- someone removes the app from their Facebook account, which can
-- happen for a Facebook ID that was never actually linked to a real
-- Job Rush account (e.g. they started the OAuth flow but never
-- completed it) -- that's still a valid, must-be-acknowledged request,
-- just with nothing on our side to delete.
-- ============================================================

CREATE TABLE IF NOT EXISTS facebook_deletion_requests (
  id                VARCHAR(64) PRIMARY KEY, -- the confirmation_code handed back to Facebook
  facebook_user_id  VARCHAR(64) NOT NULL,
  job_rush_user_id  UUID REFERENCES users(id),
  status            VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed' | 'no_matching_account'
  requested_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_facebook_deletion_requests_fbuid ON facebook_deletion_requests (facebook_user_id);
