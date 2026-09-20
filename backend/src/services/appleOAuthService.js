/**
 * Sign in with Apple. Genuinely different from the Google/Facebook
 * OAuth2 flows this app already has, not just a copy with different
 * URLs:
 *
 * - Apple's authorization endpoint requires response_mode=form_post,
 *   so its callback arrives as a POST body, not GET query params (see
 *   the scoped express.urlencoded() parser on that one route in
 *   server.js, mirroring how the Paystack webhook gets its own scoped
 *   body parser).
 * - There is no separate "userinfo" REST endpoint. Identity (sub,
 *   email, whether it's a private-relay address) comes embedded in a
 *   signed id_token JWT returned directly from the token endpoint,
 *   which this server must cryptographically verify itself against
 *   Apple's published public keys (JWKS) -- get this wrong and a
 *   forged token could be accepted as a real identity, so it uses the
 *   well-established `jsonwebtoken`/`jwks-rsa` libraries rather than
 *   hand-rolled signature verification.
 * - Apple's "client secret" isn't a static value from a dashboard --
 *   it's a JWT this server signs itself (ES256) using a private key
 *   downloaded once from Apple Developer, regenerated fresh on every
 *   request here rather than cached, to keep the logic simple.
 * - The user's name is only ever sent once, on the very first
 *   authorization, as a JSON string in the `user` form field --
 *   never in the id_token, never resent on later logins.
 */
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const oauthStateService = require('./oauthStateService');

const AUTH_ENDPOINT = 'https://appleid.apple.com/auth/authorize';
const TOKEN_ENDPOINT = 'https://appleid.apple.com/auth/token';
const ISSUER = 'https://appleid.apple.com';

const jwks = jwksClient({ jwksUri: 'https://appleid.apple.com/auth/keys', cache: true, cacheMaxAge: 12 * 60 * 60 * 1000 });

function assertConfigured() {
  if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY || !env.APPLE_REDIRECT_URI) {
    throw new AppError('Sign in with Apple is not configured on this server yet.', 503, 'APPLE_OAUTH_NOT_CONFIGURED');
  }
}

function buildAuthorizationUrl(client) {
  assertConfigured();
  const state = oauthStateService.createState(client === 'android' ? 'android' : '');
  const params = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    redirect_uri: env.APPLE_REDIRECT_URI,
    response_type: 'code',
    response_mode: 'form_post',
    scope: 'name email',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/**
 * Signs a fresh, short-lived (5 min) ES256 JWT to use as the OAuth
 * "client secret" -- Apple verifies this against the public key
 * counterpart of APPLE_PRIVATE_KEY that was registered for
 * APPLE_KEY_ID in Apple Developer. Never cached/reused across
 * requests; regenerating it is cheap and avoids any expiry bookkeeping.
 */
function generateClientSecret() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: env.APPLE_TEAM_ID,
      iat: now,
      exp: now + 300,
      aud: ISSUER,
      sub: env.APPLE_CLIENT_ID,
    },
    env.APPLE_PRIVATE_KEY,
    { algorithm: 'ES256', keyid: env.APPLE_KEY_ID }
  );
}

async function exchangeCodeForTokens(code) {
  assertConfigured();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.APPLE_CLIENT_ID,
      client_secret: generateClientSecret(),
      code,
      redirect_uri: env.APPLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Apple token exchange failed', { status: response.status, body });
    throw new AppError('Could not complete Apple sign-in.', 502, 'APPLE_TOKEN_EXCHANGE_FAILED');
  }

  return response.json();
}

function getSigningKey(header, callback) {
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Verifies the id_token's RS256 signature against Apple's published
 * public keys (fetched/cached by kid) and checks issuer/audience/
 * expiry -- this is the actual proof that `sub`/`email` genuinely came
 * from Apple, not something the browser could have supplied on its own.
 */
function verifyIdToken(idToken) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      idToken,
      getSigningKey,
      { algorithms: ['RS256'], issuer: ISSUER, audience: env.APPLE_CLIENT_ID },
      (err, decoded) => {
        if (err) return reject(new AppError('Could not verify your Apple identity token.', 502, 'APPLE_TOKEN_INVALID'));
        resolve(decoded);
      }
    );
  });
}

/**
 * Apple sends the user's name only once, ever, as a JSON string in
 * the `user` form field -- and only on the very first authorization
 * for this app. Returns null on every later login; callers must not
 * treat that as an error or assume the name changed.
 */
function parseFirstLoginName(userField) {
  if (!userField) return null;
  try {
    const parsed = typeof userField === 'string' ? JSON.parse(userField) : userField;
    const first = parsed?.name?.firstName || '';
    const last = parsed?.name?.lastName || '';
    const fullName = `${first} ${last}`.trim();
    return fullName || null;
  } catch {
    return null;
  }
}

module.exports = { buildAuthorizationUrl, exchangeCodeForTokens, verifyIdToken, parseFirstLoginName };
