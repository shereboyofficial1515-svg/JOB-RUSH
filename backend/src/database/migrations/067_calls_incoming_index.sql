-- ============================================================
-- 067_calls_incoming_index.sql
--
-- GET /messaging/calls/incoming runs for every signed-in page (every 3s while the realtime
-- stream is down, every 20s as a safety net otherwise). It filters on
--   callee_user_id = $1 AND status IN ('calling','ringing') AND started_at > now() - 45s
-- but only idx_calls_callee (callee_user_id) existed, so it read every call a person ever
-- received. This partial index covers exactly the rows that can still be ringing, so the
-- lookup touches at most a handful of rows however long the call history grows.
--
-- Additive and non-destructive (CREATE INDEX IF NOT EXISTS). Nothing is dropped.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_calls_callee_ringing
  ON calls (callee_user_id, started_at DESC)
  WHERE status IN ('calling', 'ringing');
