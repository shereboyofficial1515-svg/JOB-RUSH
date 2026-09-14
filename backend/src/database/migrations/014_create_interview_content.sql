-- ============================================================
-- 014_create_interview_content.sql
-- Questions are hirer-authored prep material (visible to the hirer;
-- exposing them to the worker ahead of time is a product choice left
-- to the API layer, not assumed here). Notes and evaluations are
-- ALWAYS hirer-private — there is no worker-facing route anywhere in
-- this module that can return rows from these two tables.
-- ============================================================

CREATE TABLE IF NOT EXISTS interview_questions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  question_text   TEXT NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_answered     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interview_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id    UUID NOT NULL REFERENCES interviews(id) ON DELETE CASCADE,
  hirer_user_id   UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,
  category        VARCHAR(40), -- e.g. 'technical_skills', 'communication', 'experience', 'availability', 'salary_expectations', 'overall'
  note_text       TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE interview_recommendation AS ENUM ('strong_candidate', 'consider', 'not_suitable');

CREATE TABLE IF NOT EXISTS interview_evaluations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id          UUID NOT NULL UNIQUE REFERENCES interviews(id) ON DELETE CASCADE,
  hirer_user_id         UUID NOT NULL REFERENCES hirer_profiles(user_id) ON DELETE CASCADE,

  technical_skills_rating  SMALLINT CHECK (technical_skills_rating BETWEEN 1 AND 5),
  communication_rating     SMALLINT CHECK (communication_rating BETWEEN 1 AND 5),
  experience_rating        SMALLINT CHECK (experience_rating BETWEEN 1 AND 5),
  availability_notes       TEXT,
  overall_assessment       TEXT,
  recommendation           interview_recommendation NOT NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_interview_questions_interview ON interview_questions (interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_notes_interview ON interview_notes (interview_id);
CREATE INDEX IF NOT EXISTS idx_interview_evaluations_interview ON interview_evaluations (interview_id);

DROP TRIGGER IF EXISTS trg_interview_notes_updated_at ON interview_notes;
CREATE TRIGGER trg_interview_notes_updated_at
  BEFORE UPDATE ON interview_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_interview_evaluations_updated_at ON interview_evaluations;
CREATE TRIGGER trg_interview_evaluations_updated_at
  BEFORE UPDATE ON interview_evaluations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
