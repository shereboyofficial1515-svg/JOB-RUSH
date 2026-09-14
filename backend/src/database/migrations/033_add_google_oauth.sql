-- ============================================================
-- 033_add_google_oauth.sql
-- Adds Google account linking to the existing users table. An
-- account created via Google gets a random, unusable password hash
-- (see authService.createOrLinkGoogleUser) rather than making
-- password_hash nullable — avoids touching the NOT NULL constraint
-- and every existing query that assumes the column is always
-- populated, at the cost of one wasted bcrypt hash per OAuth signup.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id) WHERE google_id IS NOT NULL;
