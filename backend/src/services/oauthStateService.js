const crypto = require('crypto');
const env = require('../config/env');

// Extracted from the original Google-only implementation so Facebook
// and Apple sign-in reuse the exact same CSRF mechanism instead of
// each hand-rolling their own -- one state scheme for every provider.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Stateless CSRF state token: timestamp + an optional payload + HMAC
 * over both, base64url-encoded. The payload is currently only ever
 * "android" (see authController's completeOAuthLogin) — it lets the
 * OAuth callback tell whether the flow started from the Android app's
 * Custom Tab, without a server-side session to look it up in, since
 * this token is the only thing that survives the round trip to
 * Google/Facebook/Apple and back.
 */
function createState(payload = '') {
  const timestamp = Date.now().toString();
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const data = `${timestamp}.${encodedPayload}`;
  const signature = crypto.createHmac('sha256', env.SESSION_SECRET).update(data).digest('hex');
  return Buffer.from(`${data}.${signature}`).toString('base64url');
}

/** Returns { payload } if state is authentic and unexpired, otherwise null. */
function parseState(state) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [timestamp, encodedPayload, signature] = decoded.split('.');
    if (!timestamp || signature === undefined) return null;

    const data = `${timestamp}.${encodedPayload}`;
    const expectedSignature = crypto.createHmac('sha256', env.SESSION_SECRET).update(data).digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    if (Date.now() - Number(timestamp) >= STATE_TTL_MS) return null;

    return { payload: Buffer.from(encodedPayload || '', 'base64url').toString('utf8') };
  } catch {
    return null;
  }
}

function verifyState(state) {
  return parseState(state) !== null;
}

module.exports = { createState, verifyState, parseState };
