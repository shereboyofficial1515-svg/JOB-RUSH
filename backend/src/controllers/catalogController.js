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

module.exports = { listCategories, listSkills };
