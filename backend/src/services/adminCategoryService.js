const { query } = require('../config/db');
const AppError = require('../utils/AppError');

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

async function listCategoriesForAdmin() {
  const { rows } = await query('SELECT * FROM categories ORDER BY sort_order, name');
  return rows;
}

async function createCategory({ name, parentCategoryId, sortOrder }) {
  const slug = slugify(name);
  try {
    const { rows } = await query(
      `INSERT INTO categories (name, slug, parent_category_id, sort_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, slug, parentCategoryId || null, sortOrder ?? 0]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('A category with this name already exists.', 409, 'CATEGORY_EXISTS');
    throw err;
  }
}

async function updateCategory(categoryId, { name, isActive, sortOrder, parentCategoryId }) {
  const { rows } = await query(
    `UPDATE categories SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       is_active = COALESCE($4, is_active),
       sort_order = COALESCE($5, sort_order),
       parent_category_id = COALESCE($6, parent_category_id)
     WHERE id = $1 RETURNING *`,
    [categoryId, name || null, name ? slugify(name) : null, isActive, sortOrder, parentCategoryId]
  );
  if (rows.length === 0) throw new AppError('Category not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listSkillsForAdmin() {
  const { rows } = await query('SELECT * FROM skills ORDER BY name');
  return rows;
}

async function createSkill({ name, categoryId }) {
  const slug = slugify(name);
  try {
    const { rows } = await query(
      `INSERT INTO skills (name, slug, category_id) VALUES ($1, $2, $3) RETURNING *`,
      [name, slug, categoryId || null]
    );
    return rows[0];
  } catch (err) {
    if (err.code === '23505') throw new AppError('A skill with this name already exists.', 409, 'SKILL_EXISTS');
    throw err;
  }
}

async function updateSkill(skillId, { name, isActive, categoryId }) {
  const { rows } = await query(
    `UPDATE skills SET
       name = COALESCE($2, name),
       slug = COALESCE($3, slug),
       is_active = COALESCE($4, is_active),
       category_id = COALESCE($5, category_id)
     WHERE id = $1 RETURNING *`,
    [skillId, name || null, name ? slugify(name) : null, isActive, categoryId]
  );
  if (rows.length === 0) throw new AppError('Skill not found.', 404, 'NOT_FOUND');
  return rows[0];
}

module.exports = {
  listCategoriesForAdmin,
  createCategory,
  updateCategory,
  listSkillsForAdmin,
  createSkill,
  updateSkill,
};
