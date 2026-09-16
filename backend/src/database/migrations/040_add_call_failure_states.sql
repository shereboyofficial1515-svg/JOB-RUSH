-- ============================================================
-- 040_add_call_failure_states.sql
-- Call history was silently dropping every call that never reached
-- "connected" — call-room.html had no code path that ever moved a
-- call to 'failed' (a connection error) or a genuine 'cancelled'
-- (caller backs out before the other side picks up), so those calls
-- either got miscategorized as 'ended' or sat stuck at 'calling'
-- forever with no record of what actually happened.
-- ============================================================

ALTER TYPE call_status ADD VALUE IF NOT EXISTS 'failed';
ALTER TYPE call_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Optional human-readable reason for a 'failed' call (e.g. the
-- LiveKit connection error message) — never required, never shown as
-- raw internal detail beyond what callService itself puts here.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS failure_reason TEXT;
