const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const notificationService = require('./notificationService');
const { recordAuditEvent } = require('../security/auditLogger');

/**
 * Admin search/browse across all users. Deliberately separate from
 * any user-facing search — this can match on email/phone (never
 * exposed to other users) and returns account-status fields that
 * are nobody else's business.
 */
async function searchUsers({ keyword, role, accountStatus, page = 1, pageSize = 25 }) {
  const conditions = [];
  const params = [];

  if (keyword) {
    params.push(`%${keyword}%`);
    conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length} OR phone ILIKE $${params.length})`);
  }
  if (role) {
    params.push(role);
    conditions.push(`role = $${params.length}`);
  }
  if (accountStatus) {
    params.push(accountStatus);
    conditions.push(`account_status = $${params.length}`);
  }

  const limit = Math.min(Math.max(parseInt(pageSize, 10) || 25, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  params.push(limit, offset);

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT id, full_name, email, phone, role, account_status, email_verified_at, phone_verified_at, created_at, last_login_at
       FROM users ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function getUserDetail(userId) {
  const { rows } = await query(
    `SELECT id, full_name, email, phone, role, account_status, email_verified_at, phone_verified_at,
            failed_login_attempts, locked_until, last_login_at, last_login_ip, created_at
       FROM users WHERE id = $1`,
    [userId]
  );
  if (rows.length === 0) throw new AppError('User not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function assertNotSelf(adminUserId, targetUserId, action) {
  if (adminUserId === targetUserId) {
    throw new AppError(`You cannot ${action} your own account from here.`, 400, 'CANNOT_ACT_ON_SELF');
  }
}

/** Suspends an account — reversible, for policy violations under review. Revokes all sessions immediately. */
async function suspendUser(targetUserId, adminUserId, reason) {
  await assertNotSelf(adminUserId, targetUserId, 'suspend');

  const { rows } = await query(
    `UPDATE users SET account_status = 'suspended' WHERE id = $1 AND account_status != 'suspended' RETURNING *`,
    [targetUserId]
  );
  if (rows.length === 0) throw new AppError('User not found or already suspended.', 404, 'NOT_FOUND');

  await query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'admin_action' WHERE user_id = $1 AND revoked_at IS NULL`, [
    targetUserId,
  ]);

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'USER_SUSPENDED',
    resourceType: 'user',
    resourceId: targetUserId,
    result: 'success',
    metadata: { reason },
  });

  return rows[0];
}

/** Disables an account — for confirmed serious violations, more permanent in intent than suspension. */
async function disableUser(targetUserId, adminUserId, reason) {
  await assertNotSelf(adminUserId, targetUserId, 'disable');

  const { rows } = await query(
    `UPDATE users SET account_status = 'disabled' WHERE id = $1 RETURNING *`,
    [targetUserId]
  );
  if (rows.length === 0) throw new AppError('User not found.', 404, 'NOT_FOUND');

  await query(`UPDATE sessions SET revoked_at = now(), revoked_reason = 'admin_action' WHERE user_id = $1 AND revoked_at IS NULL`, [
    targetUserId,
  ]);

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'USER_DISABLED',
    resourceType: 'user',
    resourceId: targetUserId,
    result: 'success',
    metadata: { reason },
  });

  return rows[0];
}

/** Restores a suspended or disabled account to active. */
async function reactivateUser(targetUserId, adminUserId) {
  const { rows } = await query(
    `UPDATE users SET account_status = 'active' WHERE id = $1 AND account_status IN ('suspended', 'disabled') RETURNING *`,
    [targetUserId]
  );
  if (rows.length === 0) throw new AppError('User not found or not currently suspended/disabled.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: adminUserId,
    action: 'USER_REACTIVATED',
    resourceType: 'user',
    resourceId: targetUserId,
    result: 'success',
  });

  notificationService.notifyUser(targetUserId, 'announcement', {
    title: 'Your account has been reactivated',
    body: 'You can now sign in and use JOB RUSH again.',
  }).catch(() => {});

  return rows[0];
}

module.exports = { searchUsers, getUserDetail, suspendUser, disableUser, reactivateUser };
