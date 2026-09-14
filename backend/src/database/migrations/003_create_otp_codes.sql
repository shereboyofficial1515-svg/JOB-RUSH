-- ============================================================
-- 003_create_otp_codes.sql
-- One-time codes for phone/email verification, login step-up, and
-- password reset. Codes are always stored hashed and expire quickly.
-- ============================================================

CREATE TYPE otp_purpose AS ENUM (
  'registration_email',
  'registration_phone',
  'login_verification',
  'password_reset'
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) ON DELETE CASCADE,

  -- destination the code was sent to, so we can validate it independent
  -- of whether the user record is fully created yet (pre-registration OTP)
  destination     VARCHAR(150) NOT NULL,
  purpose         otp_purpose NOT NULL,

  code_hash       CHAR(64) NOT NULL, -- SHA-256 of the numeric code
  attempts        INTEGER NOT NULL DEFAULT 0,
  max_attempts    INTEGER NOT NULL DEFAULT 5,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL,
  consumed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_otp_destination_purpose
  ON otp_codes (destination, purpose);
CREATE INDEX IF NOT EXISTS idx_otp_user_id ON otp_codes (user_id);

-- Password reset tokens are separate from OTP codes: longer-lived,
-- single-use, delivered as a link rather than a typed code.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash    CHAR(64) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ,
  request_ip    INET
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON password_reset_tokens (user_id);
