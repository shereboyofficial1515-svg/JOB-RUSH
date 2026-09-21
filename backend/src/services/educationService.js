const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ensureWorkerProfileRow } = require('./profileService');

const EDITABLE_FIELDS = [
  'institution', 'education_type', 'degree', 'field_of_study',
  'location', 'description', 'start_date', 'end_date', 'is_current', 'visibility',
];

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  return out;
}

/** All of a worker's own education entries — every visibility, since the owner sees everything about their own profile. */
async function listForWorker(workerUserId) {
  const { rows } = await query(
    'SELECT * FROM worker_education WHERE worker_user_id = $1 ORDER BY sort_order, start_date DESC NULLS LAST',
    [workerUserId]
  );
  return rows;
}

/** Public read of another worker's education — only entries the worker chose to show. */
async function listPublicForWorker(workerUserId) {
  const { rows } = await query(
    `SELECT * FROM worker_education WHERE worker_user_id = $1 AND visibility = 'public'
     ORDER BY sort_order, start_date DESC NULLS LAST`,
    [workerUserId]
  );
  return rows;
}

async function assertOwnedByWorker(id, workerUserId) {
  const { rows } = await query('SELECT * FROM worker_education WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
  if (rows.length === 0) throw new AppError('Education entry not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function create(workerUserId, input) {
  const fields = pickAllowed(input);
  if (!fields.institution) throw new AppError('Institution is required.', 400, 'VALIDATION_ERROR');

  await ensureWorkerProfileRow(workerUserId);

  const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM worker_education WHERE worker_user_id = $1', [workerUserId]);
  const sortOrder = countRows[0].count;

  const columns = ['worker_user_id', ...Object.keys(fields), 'sort_order'];
  const values = [workerUserId, ...Object.values(fields), sortOrder];
  const placeholders = values.map((_, i) => `$${i + 1}`);

  const { rows } = await query(
    `INSERT INTO worker_education (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );
  return rows[0];
}

async function update(id, workerUserId, input) {
  await assertOwnedByWorker(id, workerUserId);
  const fields = pickAllowed(input);
  if (Object.keys(fields).length === 0) return assertOwnedByWorker(id, workerUserId);

  const setClauses = Object.keys(fields).map((f, i) => `${f} = $${i + 3}`);
  const { rows } = await query(
    `UPDATE worker_education SET ${setClauses.join(', ')} WHERE id = $1 AND worker_user_id = $2 RETURNING *`,
    [id, workerUserId, ...Object.values(fields)]
  );
  return rows[0];
}

async function remove(id, workerUserId) {
  await assertOwnedByWorker(id, workerUserId);
  await query('DELETE FROM worker_education WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
}

async function reorder(workerUserId, orderedIds) {
  const existing = await listForWorker(workerUserId);
  const existingIds = new Set(existing.map((e) => e.id));
  if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
    throw new AppError('The provided order must include exactly this worker’s existing entries.', 400, 'INVALID_ORDER');
  }
  await Promise.all(orderedIds.map((id, i) => query('UPDATE worker_education SET sort_order = $1 WHERE id = $2', [i, id])));
  return listForWorker(workerUserId);
}

module.exports = { listForWorker, listPublicForWorker, create, update, remove, reorder };
