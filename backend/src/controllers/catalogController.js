const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Public, read-only view of active categories/skills — the same
 * tables adminCategoryService manages, just filtered to what's
 * actually usable right now and with no admin auth required. Workers
 * need this to pick their own skills on their profile, and job
 * posting needs it to tag jobs — nothing here writes anything.
 */
const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, slug, parent_category_id FROM categories WHERE is_active = true ORDER BY sort_order, name'
  );
  res.status(200).json({ categories: rows });
});

const listSkills = asyncHandler(async (req, res) => {
  const { rows } = await query(
    'SELECT id, name, slug, category_id FROM skills WHERE is_active = true ORDER BY name'
  );
  res.status(200).json({ skills: rows });
});

/**
 * Public headline numbers for the homepage hero -- real counts only. The
 * same visibility rules as the public worker search (active, not
 * deactivated, public profile, not marked unavailable), so the number on
 * the homepage matches what a visitor can actually find. Cached for 5
 * minutes at the edge (see the /api cache policy in server.js).
 */
const stats = asyncHandler(async (req, res) => {
  const [people, jobs, fee] = await Promise.all([
    query(`SELECT COUNT(*)::int AS professionals,
                  COUNT(*) FILTER (WHERE wp.verification_status = 'approved')::int AS verified
             FROM worker_profiles wp
             JOIN users u ON u.id = wp.user_id
             LEFT JOIN user_settings us ON us.user_id = wp.user_id
            WHERE wp.availability_status != 'unavailable' AND u.account_status = 'active'
              AND u.deactivated_at IS NULL AND COALESCE(us.profile_visibility, 'public') = 'public'`),
    query(`SELECT COUNT(*)::int AS open_jobs FROM jobs WHERE status = 'open' AND hidden = false`),
    query('SELECT platform_fee_percent FROM platform_settings WHERE id = 1'),
  ]);
  res.status(200).json({
    professionals: people.rows[0].professionals,
    verifiedProfessionals: people.rows[0].verified,
    openJobs: jobs.rows[0].open_jobs,
    platformFeePercent: Number(fee.rows[0]?.platform_fee_percent ?? 10),
  });
});

module.exports = { listCategories, listSkills, stats };
