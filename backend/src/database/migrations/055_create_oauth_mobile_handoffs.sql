-- ============================================================
-- 055_create_oauth_mobile_handoffs.sql
-- Google actively blocks its OAuth consent screen from loading inside
-- an embedded WebView (the Android app's own user-agent), so the
-- Android app must run the Google/Facebook/Apple OAuth flow in a
-- Custom Tab (a real, separate Chrome instance) instead of the app's
-- own WebView. That means the session cookie the OAuth callback would
-- normally set ends up in the Custom Tab's cookie jar, not the app's —
-- useless to the app.
--
-- This table is the fix: a one-time, short-lived, unguessable code
-- that stands in for "this user just finished signing in with OAuth."
-- The OAuth callback (still running in the Custom Tab) redirects to a
-- jobrush:// deep link carrying this code instead of setting a cookie;
-- the Android app intercepts that deep link and has its OWN WebView
-- (with its own cookie jar) hit /api/auth/mobile-handoff?code=... ,
-- which is where the real session cookie actually gets set. The code
-- is deleted the instant it's used, and anything left over after
-- HANDOFF_TTL is just dead weight for the next migration to prune —
-- no separate cleanup job needed at this scale.
-- ============================================================

CREATE TABLE IF NOT EXISTS oauth_mobile_handoffs (
  code          VARCHAR(64) PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  used_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_mobile_handoffs_expires ON oauth_mobile_handoffs (expires_at);
