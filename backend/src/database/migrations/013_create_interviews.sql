-- ============================================================
-- 013_create_interviews.sql
-- Core interview scheduling. hirer_user_id/worker_user_id are kept
-- as direct columns (not just derived via interview_participants)
-- so ownership checks are a simple equality test everywhere they're
-- needed, while interview_participants remains the actual
-- authorization source for "can this user view/join this interview"
-- — see interviewService.assertParticipant.
-- ============================================================

CREATE TYPE interview_type AS ENUM ('video', 'audio', 'text', 'in_person');

CREATE TYPE interview_status AS ENUM (
  'pending',              -- invitation sent, awaiting worker response
  'accepted',             -- worker accepted; scheduling finalized (functionally same as 'scheduled')
  'declined',
  'reschedule_requested',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
  'no_show',
  'passed',
  'failed'
);

CREATE TABLE IF NOT EXISTS interviews (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  application_id        UUID REFERENCES applications(id) ON DELETE SET NULL,
  job_id                UUID REFERENCES jobs(id) ON DELETE SET NULL,

  hirer_user_id         UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,
  worker_user_id        UUID NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,

  interview_type        interview_type NOT NULL,
  status                interview_status NOT NULL DEFAULT 'pending',

  scheduled_start_at    TIMESTAMPTZ NOT NULL,
  duration_minutes      SMALLINT NOT NULL DEFAULT 30,
  timezone              VARCHAR(60) NOT NULL DEFAULT 'Africa/Lagos',

  -- In-person only. Never returned to a worker-facing endpoint until
  -- the interview is accepted — see interviewService.
  location_address      TEXT,
  location_instructions TEXT,

  -- LiveKit room is created lazily on first token issuance, not at
  -- scheduling time, so a room never sits open unused.
  livekit_room_name     VARCHAR(120),

  notes                 TEXT, -- general scheduling note from the hirer, not a private evaluation note

  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE interview_participant_role AS ENUM ('hirer', 'worker');

CREATE TABLE IF NOT EXISTS interview_participants (
  interview_id  UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          interview_participant_role NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (interview_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_interviews_hirer ON interviews (hirer_user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_worker ON interviews (worker_user_id);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON interviews (status);
CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_start ON interviews (scheduled_start_at);
CREATE INDEX IF NOT EXISTS idx_interview_participants_user ON interview_participants (user_id);

DROP TRIGGER IF EXISTS trg_interviews_updated_at ON interviews;
CREATE TRIGGER trg_interviews_updated_at
  BEFORE UPDATE ON interviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
