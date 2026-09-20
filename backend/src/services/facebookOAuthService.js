const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const oauthStateService = require('./oauthStateService');

// Graph API version pinned explicitly per Facebook's own recommendation
// (an unversioned endpoint silently floats to whatever's current).
// Bump this if Facebook deprecates the version before this code is revisited.
const GRAPH_VERSION = 'v21.0';
const AUTH_ENDPOINT = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`;
const USERINFO_ENDPOINT = `https://graph.facebook.com/${GRAPH_VERSION}/me`;

function assertConfigured() {
  if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET || !env.FACEBOOK_REDIRECT_URI) {
    throw new AppError('Facebook sign-in is not configured on this server yet.', 503, 'FACEBOOK_OAUTH_NOT_CONFIGURED');
  }
}

function buildAuthorizationUrl(client) {
  assertConfigured();
  const state = oauthStateService.createState(client === 'android' ? 'android' : '');
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    redirect_uri: env.FACEBOOK_REDIRECT_URI,
    response_type: 'code',
    // public_profile is granted by default; email must be requested
    // explicitly and the user can still decline it at the consent
    // screen -- handled as a real "no email" case in the callback,
    // not assumed to always be present.
    scope: 'email',
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCodeForTokens(code) {
  assertConfigured();
  const params = new URLSearchParams({
    client_id: env.FACEBOOK_APP_ID,
    client_secret: env.FACEBOOK_APP_SECRET,
    redirect_uri: env.FACEBOOK_REDIRECT_URI,
    code,
  });
  const response = await fetch(`${TOKEN_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    logger.error('Facebook token exchange failed', { status: response.status, body });
    throw new AppError('Could not complete Facebook sign-in.', 502, 'FACEBOOK_TOKEN_EXCHANGE_FAILED');
  }

  return response.json();
}

/**
 * Fetches the authenticated user's profile from Facebook's own Graph
 * API using the access token just issued — never anything the client
 * could have sent directly. `email` is only present if the user
 * actually has a verified email on file with Facebook and granted the
 * email permission; its absence is a real, expected case (see
 * authController.facebookCallback), not an error in this function.
 */
async function getUserInfo(accessToken) {
  const params = new URLSearchParams({ fields: 'id,name,email', access_token: accessToken });
  const response = await fetch(`${USERINFO_ENDPOINT}?${params.toString()}`);

  if (!response.ok) {
    throw new AppError('Could not retrieve your Facebook profile.', 502, 'FACEBOOK_USERINFO_FAILED');
  }

  return response.json();
}

module.exports = { buildAuthorizationUrl, exchangeCodeForTokens, getUserInfo };
