const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ensureWorkerProfileRow } = require('./profileService');

const EDITABLE_FIELDS = ['job_title', 'company_name', 'description', 'location', 'start_date', 'end_date', 'is_current', 'skills_used'];

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  return out;
}

async function listForWorker(workerUserId) {
  const { rows } = await query(
    'SELECT * FROM work_experience WHERE worker_user_id = $1 ORDER BY sort_order, start_date DESC NULLS LAST',
    [workerUserId]
  );
  return rows;
}

async function assertOwnedByWorker(id, workerUserId) {
  const { rows } = await query('SELECT * FROM work_experience WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
  if (rows.length === 0) throw new AppError('Work experience entry not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function create(workerUserId, input) {
  const fields = pickAllowed(input);
  if (!fields.job_title) throw new AppError('Job title is required.', 400, 'VALIDATION_ERROR');

  await ensureWorkerProfileRow(workerUserId);

  const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM work_experience WHERE worker_user_id = $1', [workerUserId]);
  const sortOrder = countRows[0].count;

  const columns = ['worker_user_id', ...Object.keys(fields), 'sort_order'];
  const values = [workerUserId, ...Object.values(fields), sortOrder];
  const placeholders = values.map((_, i) => `$${i + 1}`);

  const { rows } = await query(
    `INSERT INTO work_experience (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
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
    `UPDATE work_experience SET ${setClauses.join(', ')} WHERE id = $1 AND worker_user_id = $2 RETURNING *`,
    [id, workerUserId, ...Object.values(fields)]
  );
  return rows[0];
}

async function remove(id, workerUserId) {
  await assertOwnedByWorker(id, workerUserId);
  await query('DELETE FROM work_experience WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
}

async function reorder(workerUserId, orderedIds) {
  const existing = await listForWorker(workerUserId);
  const existingIds = new Set(existing.map((e) => e.id));
  if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
    throw new AppError('The provided order must include exactly this worker’s existing entries.', 400, 'INVALID_ORDER');
  }
  await Promise.all(orderedIds.map((id, i) => query('UPDATE work_experience SET sort_order = $1 WHERE id = $2', [i, id])));
  return listForWorker(workerUserId);
}

module.exports = { listForWorker, create, update, remove, reorder };
