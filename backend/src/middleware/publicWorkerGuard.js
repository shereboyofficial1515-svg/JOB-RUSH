const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { attachUserIfPresent } = require('./authenticate');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guards the PUBLIC read endpoints about one worker (experience, education, services, social links,
 * CV, business, reviews, portfolio list). Those endpoints take the worker's id from the URL and need
 * no login, so without this a person who set their profile to private, or whose account was
 * deactivated or suspended, was still fully readable by anyone who had the id. Mirrors the rule the
 * main profile endpoint applies: hidden accounts read as "not found" to everyone except the owner.
 *
 *   router.get('/worker/:userId/experience', ...publicWorkerGuard('userId'), handler)
 */
function publicWorkerGuard(param = 'userId') {
  return [
    attachUserIfPresent,
    asyncHandler(async (req, res, next) => {
      const id = req.params[param];
      const notFound = () => res.status(404).json({ error: 'Profile not found.', code: 'NOT_FOUND' });
      if (!UUID.test(id || '')) return notFound();
      if (req.user && req.user.id === id) return next();
      const { rows } = await query(
        `SELECT u.account_status, u.deactivated_at, COALESCE(us.profile_visibility, 'public') AS visibility
           FROM users u LEFT JOIN user_settings us ON us.user_id = u.id
          WHERE u.id = $1`,
        [id]
      );
      const u = rows[0];
      if (!u || u.account_status !== 'active' || u.deactivated_at || u.visibility === 'private') return notFound();
      next();
    }),
  ];
}

module.exports = { publicWorkerGuard };
