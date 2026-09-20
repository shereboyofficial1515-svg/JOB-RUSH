const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ensureWorkerProfileRow } = require('./profileService');
const referralService = require('./referralService');

const EDITABLE_FIELDS = ['name', 'description', 'pricing_type', 'price', 'price_currency', 'duration_estimate', 'is_active'];
const QUOTE_ONLY_TYPES = ['negotiable', 'contact_for_quote'];

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  return out;
}

/** A price only means something for pricing types that quote one -- mirrors the DB CHECK constraint so a bad request fails with a clear message instead of a raw constraint-violation error. */
function normalizePricing(fields) {
  if (QUOTE_ONLY_TYPES.includes(fields.pricing_type)) {
    fields.price = null;
  } else if (fields.pricing_type && fields.price === undefined) {
    // pricing_type changed away from quote-only but no price was supplied — leave existing price untouched by not forcing null.
  }
  return fields;
}

async function listForWorker(workerUserId, { activeOnly = false } = {}) {
  const conditions = ['worker_user_id = $1'];
  if (activeOnly) conditions.push('is_active = true');
  const { rows } = await query(
    `SELECT * FROM professional_services WHERE ${conditions.join(' AND ')} ORDER BY sort_order, created_at`,
    [workerUserId]
  );
  return rows;
}

async function assertOwnedByWorker(id, workerUserId) {
  const { rows } = await query('SELECT * FROM professional_services WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
  if (rows.length === 0) throw new AppError('Service not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function create(workerUserId, input) {
  const fields = normalizePricing(pickAllowed(input));
  if (!fields.name) throw new AppError('Service name is required.', 400, 'VALIDATION_ERROR');
  if (QUOTE_ONLY_TYPES.includes(fields.pricing_type)) fields.price = null;

  await ensureWorkerProfileRow(workerUserId);

  const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM professional_services WHERE worker_user_id = $1', [workerUserId]);
  if (countRows[0].count >= 20) throw new AppError('A profile can list at most 20 services.', 400, 'LIMIT_REACHED');

  const columns = ['worker_user_id', ...Object.keys(fields), 'sort_order'];
  const values = [workerUserId, ...Object.values(fields), countRows[0].count];
  const placeholders = values.map((_, i) => `$${i + 1}`);

  const { rows } = await query(
    `INSERT INTO professional_services (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values
  );

  if (rows[0].is_active) {
    referralService.markActivityCompleted(workerUserId, 'service_published').catch(() => {});
  }

  return rows[0];
}

async function update(id, workerUserId, input) {
  const current = await assertOwnedByWorker(id, workerUserId);
  const fields = normalizePricing(pickAllowed(input));
  const effectivePricingType = fields.pricing_type || current.pricing_type;
  if (QUOTE_ONLY_TYPES.includes(effectivePricingType)) fields.price = null;

  if (Object.keys(fields).length === 0) return current;

  const setClauses = Object.keys(fields).map((f, i) => `${f} = $${i + 3}`);
  const { rows } = await query(
    `UPDATE professional_services SET ${setClauses.join(', ')} WHERE id = $1 AND worker_user_id = $2 RETURNING *`,
    [id, workerUserId, ...Object.values(fields)]
  );
  return rows[0];
}

async function remove(id, workerUserId) {
  await assertOwnedByWorker(id, workerUserId);
  await query('DELETE FROM professional_services WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
}

module.exports = { listForWorker, create, update, remove };
