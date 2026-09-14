const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function assertConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError('Google sign-in is not configured on this server yet.', 503, 'GOOGLE_OAUTH_NOT_CONFIGURED');
  }
}

/**
 * Stateless CSRF state token: timestamp + HMAC(timestamp, SESSION_SECRET),
 * base64url-encoded. Avoids a server-side state table — the signature
 * can't be forged without SESSION_SECRET, and the embedded timestamp
 * lets verification reject anything older than STATE_TTL_MS without a
 * database round trip.
 */
function createState() {
  const timestamp = Date.now().toString();
  const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(timestamp).digest('hex');
  return Buffer.from(`${timestamp}.${signature}`).toString('base64url');
}

function verifyState(state) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [timestamp, signature] = decoded.split('.');
    const expectedSignature = crypto.createHmac('sha256', env.SESSION_SECRET).update(timestamp).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return false;
    }

    return Date.now() - Number(timestamp) < STATE_TTL_MS;
  } catch {
    return false;
  }
}

function buildAuthorizationUrl() {
  assertConfigured();
  const state = createState();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: env.GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  assertConfigured();
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      code,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Google token exchange failed', { status: response.status, body });
    throw new AppError('Could not complete Google sign-in.', 502, 'GOOGLE_TOKEN_EXCHANGE_FAILED');
  }

  return response.json();
}

/**
 * Fetches the authenticated user's profile from Google's own userinfo
 * endpoint using the access token just issued — this is the source of
 * truth for the email/name, never anything the client could have sent.
 */
async function getUserInfo(accessToken) {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new AppError('Could not retrieve your Google profile.', 502, 'GOOGLE_USERINFO_FAILED');
  }

  return response.json();
}

module.exports = { buildAuthorizationUrl, verifyState, exchangeCodeForTokens, getUserInfo };
