const { query } = require('../config/db');
const logger = require('../utils/logger');

/**
 * Records a security/admin-relevant event. This must never throw in a
 * way that blocks the primary action — audit logging failures are
 * logged locally and swallowed, not surfaced to the user.
 *
 * @param {object} params
 * @param {string|null} params.actorUserId
 * @param {string} params.action        e.g. 'LOGIN_SUCCESS', 'PASSWORD_CHANGED'
 * @param {string} [params.resourceType]
 * @param {string} [params.resourceId]
 * @param {'success'|'failure'} params.result
 * @param {object} [params.metadata]
 * @param {string} [params.ipAddress]
 */
async function recordAuditEvent({
  actorUserId = null,
  action,
  resourceType = null,
  resourceId = null,
  result,
  metadata = {},
  ipAddress = null,
}) {
  try {
    await query(
      `INSERT INTO admin_audit_logs
        (actor_user_id, action, resource_type, resource_id, result, metadata, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorUserId, action, resourceType, resourceId, result, JSON.stringify(metadata), ipAddress]
    );
  } catch (err) {
    logger.error('Failed to write audit log entry', { action, error: err.message });
  }
}

module.exports = { recordAuditEvent };
