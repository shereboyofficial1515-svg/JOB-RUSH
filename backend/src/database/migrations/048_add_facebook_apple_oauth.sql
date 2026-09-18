-- ============================================================
-- 048_add_facebook_apple_oauth.sql
--
-- Follows 033_add_google_oauth.sql's exact pattern: a nullable,
-- unique, partially-indexed column per provider bolted onto `users`,
-- not a shared oauth_identities table -- consistent with the existing
-- architecture rather than introducing a second design.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_id VARCHAR(64) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_facebook_id ON users (facebook_id) WHERE facebook_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_apple_id ON users (apple_id) WHERE apple_id IS NOT NULL;
