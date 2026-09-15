const crypto = require('crypto');
const env = require('../config/env');
const branding = require('../config/emailBranding');

/**
 * Stateless one-click-unsubscribe token: HMAC(userId) using a server
 * secret, no DB row needed. Verifiable without a session — clicking
 * an email link while logged out (the whole point of unsubscribe
 * links) still works, and the signature means a userId can't be
 * forged to unsubscribe someone else.
 */
function signUnsubscribeToken(userId) {
  const signature = crypto.createHmac('sha256', branding.unsubscribeSecret).update(userId).digest('hex');
  return Buffer.from(`${userId}.${signature}`).toString('base64url');
}

function verifyUnsubscribeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [userId, signature] = decoded.split('.');
    if (!userId || !signature) return null;
    const expected = crypto.createHmac('sha256', branding.unsubscribeSecret).update(userId).digest('hex');
    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expected, 'utf8');
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    return userId;
  } catch {
    return null;
  }
}

/** This hits the API directly (not the frontend) — a plain top-level GET, no CORS involved. */
function buildUnsubscribeUrl(userId) {
  return `${env.API_BASE_URL}/api/email/unsubscribe?token=${signUnsubscribeToken(userId)}`;
}

module.exports = { signUnsubscribeToken, verifyUnsubscribeToken, buildUnsubscribeUrl };
