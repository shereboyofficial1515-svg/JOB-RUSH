const crypto = require('crypto');
const env = require('../config/env');
const { query } = require('../config/db');
const authService = require('./authService');
const { recordAuditEvent } = require('../security/auditLogger');
const logger = require('../utils/logger');

/**
 * Meta's User Data Deletion Callback. When someone removes the Job
 * Rush Facebook app (or explicitly requests data deletion via
 * Facebook's own "Apps and Websites" settings), Facebook POSTs a
 * `signed_request` field here — a self-contained, HMAC-signed proof
 * of which Facebook user asked, with no user session or password
 * involved. This module verifies that signature and drives the same
 * account-redaction path the in-app "Delete account" button uses
 * (authService.deleteAccountViaFacebookRequest), just authorized
 * differently.
 *
 * Protocol reference: signed_request is
 * "<base64url(HMAC-SHA256 signature)>.<base64url(JSON payload)>". The
 * signature covers the encoded payload string itself (not the decoded
 * JSON, not the whole request body), keyed with the app secret. This
 * is Meta's actual documented format for the OAuth signed_request/
 * deauthorize/data-deletion callbacks — not invented here.
 */

function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64');
}

/** Returns the decoded payload object if signature + shape check out, otherwise null. Never throws. */
function verifySignedRequest(signedRequest) {
  if (!signedRequest || typeof signedRequest !== 'string' || !env.FACEBOOK_APP_SECRET) return null;

  try {
    const [encodedSig, encodedPayload] = signedRequest.split('.');
    if (!encodedSig || !encodedPayload) return null;

    const signature = base64UrlDecode(encodedSig);
    const expectedSignature = crypto.createHmac('sha256', env.FACEBOOK_APP_SECRET).update(encodedPayload).digest();

    if (signature.length !== expectedSignature.length || !crypto.timingSafeEqual(signature, expectedSignature)) {
      return null;
    }

    const data = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (String(data.algorithm || '').toUpperCase() !== 'HMAC-SHA256') return null;
    if (!data.user_id) return null;

    return data;
  } catch {
    return null;
  }
}

function generateConfirmationCode() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Runs the actual deletion (if a matching account exists) and records
 * the request either way — Facebook still needs a valid confirmation
 * response even when the Facebook ID never mapped to a completed Job
 * Rush account (e.g. someone started, but never finished, signing in
 * with Facebook).
 */
async function processDeletionRequest(facebookUserId) {
  const confirmationCode = generateConfirmationCode();

  const { rows } = await query('SELECT id FROM users WHERE facebook_id = $1', [facebookUserId]);
  const jobRushUserId = rows[0]?.id || null;

  if (jobRushUserId) {
    await authService.deleteAccountViaFacebookRequest(jobRushUserId);
  }

  await query(
    `INSERT INTO facebook_deletion_requests (id, facebook_user_id, job_rush_user_id, status, completed_at)
     VALUES ($1, $2, $3, $4, now())`,
    [confirmationCode, facebookUserId, jobRushUserId, jobRushUserId ? 'completed' : 'no_matching_account']
  );

  // Logged regardless of actorUserId being null — the deletion request
  // itself (and the fact that no account matched, if that's the case)
  // is the auditable event; recordAuditEvent already accepts a null actor.
  await recordAuditEvent({
    actorUserId: jobRushUserId,
    action: 'FACEBOOK_DATA_DELETION_REQUESTED',
    resourceType: 'user',
    resourceId: jobRushUserId,
    result: 'success',
    metadata: { confirmationCode, hasMatchingAccount: !!jobRushUserId },
  });

  logger.info('Processed Facebook data deletion request', { confirmationCode, hasMatchingAccount: !!jobRushUserId });

  const appBaseUrl = env.APP_BASE_URL.split(',')[0].trim();
  return {
    url: `${appBaseUrl}/data-deletion?id=${confirmationCode}`,
    confirmation_code: confirmationCode,
  };
}

/** Public status lookup (see GET /api/auth/facebook/deletion-status/:code) — never returns the Facebook/Job Rush user IDs. */
async function getStatus(confirmationCode) {
  const { rows } = await query(
    'SELECT status, requested_at, completed_at FROM facebook_deletion_requests WHERE id = $1',
    [confirmationCode]
  );
  return rows[0] || null;
}

module.exports = { verifySignedRequest, processDeletionRequest, getStatus };
