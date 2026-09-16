const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { recordAuditEvent } = require('../security/auditLogger');

/** All active (non-revoked) admins, joined to the user record for display. */
async function listAdmins() {
  const { rows } = await query(
    `SELECT au.id, au.user_id, au.admin_role, au.requires_2fa, au.created_at, au.revoked_at,
            u.full_name, u.email, creator.full_name AS created_by_name
       FROM admin_users au
       JOIN users u ON u.id = au.user_id
       LEFT JOIN users creator ON creator.id = au.created_by
      ORDER BY au.revoked_at IS NOT NULL, au.created_at DESC`
  );
  return rows;
}

async function resolveUserId({ userId, email }) {
  if (userId) return userId;
  const { rows } = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length === 0) throw new AppError('No user found with that email.', 404, 'NOT_FOUND');
  return rows[0].id;
}

/**
 * Grants an admin role. If the user already holds a revoked grant,
 * re-activates it with the new role rather than inserting a second
 * row — admin_users.user_id is unique, so a prior revoke must be
 * un-revoked, not duplicated.
 */
async function grantAdminRole({ userId, email, adminRole, requires2FA }, grantedByUserId) {
  const targetUserId = await resolveUserId({ userId, email });

  const { rows } = await query(
    `INSERT INTO admin_users (user_id, admin_role, requires_2fa, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET admin_role = EXCLUDED.admin_role,
           requires_2fa = EXCLUDED.requires_2fa,
           created_by = EXCLUDED.created_by,
           created_at = now(),
           revoked_at = NULL
     RETURNING *`,
    [targetUserId, adminRole, requires2FA, grantedByUserId]
  );

  await recordAuditEvent({
    actorUserId: grantedByUserId,
    action: 'ADMIN_ROLE_GRANTED',
    resourceType: 'admin_user',
    resourceId: targetUserId,
    result: 'success',
    metadata: { adminRole, requires2FA },
  });

  return rows[0];
}

async function revokeAdminRole(adminUserRowId, revokedByUserId) {
  if (!revokedByUserId) throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');

  const { rows: targetRows } = await query('SELECT user_id FROM admin_users WHERE id = $1', [adminUserRowId]);
  if (targetRows.length === 0) throw new AppError('Admin grant not found.', 404, 'NOT_FOUND');
  if (targetRows[0].user_id === revokedByUserId) {
    throw new AppError('You cannot revoke your own admin access from here.', 400, 'CANNOT_ACT_ON_SELF');
  }

  const { rows } = await query(
    `UPDATE admin_users SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL RETURNING *`,
    [adminUserRowId]
  );
  if (rows.length === 0) throw new AppError('Admin grant not found or already revoked.', 404, 'NOT_FOUND');

  await recordAuditEvent({
    actorUserId: revokedByUserId,
    action: 'ADMIN_ROLE_REVOKED',
    resourceType: 'admin_user',
    resourceId: rows[0].user_id,
    result: 'success',
  });

  return rows[0];
}

module.exports = { listAdmins, grantAdminRole, revokeAdminRole };
