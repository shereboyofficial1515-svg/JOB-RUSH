-- ============================================================
-- 056_create_referral_program.sql
-- Referral program: every user gets one authoritative referral code
-- (stored directly on `users` — a 1:1 attribute, not worth a separate
-- table). Each referred account gets exactly one `referrals` row,
-- which doubles as the "did they qualify" and "did they leave
-- feedback" record — a referral is inherently 1:1 with the referred
-- user, so folding feedback/rating into this row avoids inventing a
-- second table for what would always be a 1-row join anyway (an
-- earlier audit of `reviews` and `feedback_submissions` confirmed
-- neither existing feedback table fits: reviews is hard-bound to a
-- completed contract with hirer->worker role constraints, and
-- feedback_submissions has no rating column).
--
-- Reward rule (confirmed): every user who independently reaches 12
-- qualified referrals gets rewarded -- NOT a single first-past-the-
-- post winner. `referral_rewards` therefore has no global uniqueness
-- constraint, only UNIQUE (referrer_user_id, milestone) so the same
-- person can't be rewarded twice for the same milestone.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users (referral_code);

CREATE TYPE referral_status AS ENUM (
  'registered',         -- account created through the link; nothing else done yet
  'activity_completed', -- has done real, meaningful Job Rush activity
  'qualified',          -- activity done AND feedback+rating submitted -- counts toward the milestone
  'disqualified'        -- explicitly excluded (self-referral, fraud, admin correction)
);

CREATE TABLE IF NOT EXISTS referrals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- UNIQUE, not just indexed: a referred account can only ever have
  -- ONE row here, which is exactly "one authoritative referrer per
  -- account" and "a referral can't be counted twice" enforced at the
  -- database level, not just in application code.
  referred_user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code_used    VARCHAR(20) NOT NULL,

  status                referral_status NOT NULL DEFAULT 'registered',

  -- Qualifying activity (Part 5/13): which real, existing Job Rush
  -- action satisfied the requirement, and when. activity_type is one
  -- of 'portfolio_published' | 'service_published' | 'job_posted' |
  -- 'profile_completed' -- whichever the referred user's role/actions
  -- actually produced first. Not an enum: this list is descriptive
  -- metadata for admin/UI display, not something the database needs
  -- to constrain.
  activity_type         VARCHAR(30),
  activity_completed_at TIMESTAMPTZ,

  -- Feedback (Part 6) -- submitted by the referred user about THEIR
  -- OWN experience, never by the referrer. One referral = one
  -- feedback, hence columns here rather than a child table.
  feedback_rating       SMALLINT CHECK (feedback_rating BETWEEN 1 AND 5),
  feedback_text         TEXT,
  feedback_submitted_at TIMESTAMPTZ,

  qualified_at          TIMESTAMPTZ,
  disqualified_at       TIMESTAMPTZ,
  disqualified_reason   TEXT,

  -- Fraud/abuse signal (Part 10) -- soft flag, never auto-blocks
  -- qualification, just surfaces the pattern for admin review.
  registration_ip       INET,
  flagged_for_review    BOOLEAN NOT NULL DEFAULT false,
  flagged_reason        TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Belt-and-suspenders self-referral guard at the schema level, in
  -- addition to the application-level check (which is the real
  -- enforcement point, since referrer_user_id is resolved from a code
  -- lookup before this row ever gets inserted).
  CONSTRAINT referrals_no_self_referral CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals (status);
-- Powers "count this referrer's qualified referrals" -- the single
-- most frequent query in the whole feature (every dashboard load,
-- every activity/feedback submission's qualification check).
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status ON referrals (referrer_user_id, status);

DROP TRIGGER IF EXISTS trg_referrals_updated_at ON referrals;
CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON referrals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE referral_reward_status AS ENUM ('eligible', 'approved', 'rejected', 'paid');

CREATE TABLE IF NOT EXISTS referral_rewards (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone         INTEGER NOT NULL DEFAULT 12,
  amount            NUMERIC(14,2) NOT NULL DEFAULT 15000,
  status            referral_reward_status NOT NULL DEFAULT 'eligible',

  eligible_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by       UUID REFERENCES users(id), -- admin who approved/rejected
  reviewed_at       TIMESTAMPTZ,
  rejection_reason  TEXT,
  paid_at           TIMESTAMPTZ,
  paid_by           UUID REFERENCES users(id), -- admin who triggered the wallet credit
  wallet_transaction_id UUID REFERENCES wallet_transactions(id),

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Same referrer can reach further milestones later (24, 36, ...) in
  -- future iterations of this program, but never twice for the SAME
  -- milestone -- this is what actually prevents a duplicate ₦15,000
  -- reward, not application-level checking alone.
  CONSTRAINT referral_rewards_one_per_milestone UNIQUE (referrer_user_id, milestone)
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards (status);

DROP TRIGGER IF EXISTS trg_referral_rewards_updated_at ON referral_rewards;
CREATE TRIGGER trg_referral_rewards_updated_at
  BEFORE UPDATE ON referral_rewards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Onboarding state (Part 1/§8) -- reuses the existing lazily-created
-- user_settings row rather than a new table, matching how
-- accessibility/chat preferences already work.
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_status VARCHAR(20) NOT NULL DEFAULT 'not_started';
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS referral_intro_seen BOOLEAN NOT NULL DEFAULT false;

-- New notification types (Part 11), following the exact pattern of
-- migrations 037/038 -- one ALTER TYPE per batch, not used until this
-- migration commits.
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_new_signup';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_qualified';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_milestone_reached';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_reward_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referral_reward_paid';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'referred_welcome';

-- New wallet transaction category (Part 8) -- reuses the existing
-- wallet ledger as the reward's system of record instead of building
-- a parallel payment mechanism; the existing Paystack withdrawal flow
-- then handles actually getting the money to the user's bank account.
ALTER TYPE wallet_transaction_category ADD VALUE IF NOT EXISTS 'referral_reward';
