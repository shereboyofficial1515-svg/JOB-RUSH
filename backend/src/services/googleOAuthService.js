const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const oauthStateService = require('./oauthStateService');

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

function assertConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
    throw new AppError('Google sign-in is not configured on this server yet.', 503, 'GOOGLE_OAUTH_NOT_CONFIGURED');
  }
}

function buildAuthorizationUrl(client) {
  assertConfigured();
  const state = oauthStateService.createState(client === 'android' ? 'android' : '');
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

module.exports = { buildAuthorizationUrl, exchangeCodeForTokens, getUserInfo };
