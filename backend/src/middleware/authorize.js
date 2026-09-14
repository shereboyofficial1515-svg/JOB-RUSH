const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Restricts access to users whose `role` includes one of the allowed
 * values. 'both' satisfies a check for either 'worker' or 'hirer'.
 * Must run after `authenticate`.
 *
 * Usage: router.post('/jobs', authenticate, requireRole('hirer'), ...)
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'));
    }
    const userRole = req.user.role;
    const satisfies = allowedRoles.some((r) => userRole === r || userRole === 'both');
    if (!satisfies) {
      return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Restricts access to admin accounts, optionally to specific admin
 * roles (e.g. 'super_admin', 'finance_admin'). Looks up admin status
 * fresh from the database on every request — admin privilege is never
 * cached on the session/user object client-side or otherwise trusted
 * from anywhere but this table.
 *
 * Usage: router.post('/admin/verify', authenticate, requireAdmin('verification_admin'), ...)
 */
function requireAdmin(...allowedAdminRoles) {
  return asyncHandler(async (req, res, next) => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401, 'UNAUTHENTICATED');
    }

    const { rows } = await query(
      `SELECT au.admin_role, au.requires_2fa, COALESCE(tf.enabled, false) AS two_factor_enabled
         FROM admin_users au
         LEFT JOIN user_two_factor tf ON tf.user_id = au.user_id
        WHERE au.user_id = $1 AND au.revoked_at IS NULL`,
      [req.user.id]
    );
    const adminRecord = rows[0];

    if (!adminRecord) {
      throw new AppError('Administrator access required.', 403, 'FORBIDDEN');
    }

    // Enforced here, not just at login: an admin whose role requires
    // 2FA but hasn't enrolled is blocked from every admin action until
    // they do, not just nudged once at sign-in.
    if (adminRecord.requires_2fa && !adminRecord.two_factor_enabled) {
      throw new AppError(
        'Two-factor authentication is required for this role. Set it up under account security before continuing.',
        403,
        'TWO_FACTOR_REQUIRED'
      );
    }

    if (
      allowedAdminRoles.length > 0 &&
      adminRecord.admin_role !== 'super_admin' &&
      !allowedAdminRoles.includes(adminRecord.admin_role)
    ) {
      throw new AppError('You do not have permission to perform this administrative action.', 403, 'FORBIDDEN');
    }

    req.adminRole = adminRecord.admin_role;
    next();
  });
}

/**
 * Ensures the authenticated user owns the resource identified by
 * `paramName` in req.params, using `ownerColumn` in `table`. Prevents
 * IDOR by never trusting a matching ID alone — the row must actually
 * belong to req.user.id.
 *
 * Usage: router.get('/wallet/:userId', authenticate, requireOwnership({...}), ...)
 */
function requireSelfParam(paramName = 'userId') {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHENTICATED'));
    }
    if (req.params[paramName] !== req.user.id) {
      return next(new AppError('You do not have access to this resource.', 403, 'FORBIDDEN'));
    }
    next();
  };
}

module.exports = { requireRole, requireAdmin, requireSelfParam };
