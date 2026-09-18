const crypto = require('crypto');
const env = require('../config/env');

// Extracted from the original Google-only implementation so Facebook
// and Apple sign-in reuse the exact same CSRF mechanism instead of
// each hand-rolling their own -- one state scheme for every provider.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

module.exports = { createState, verifyState };
