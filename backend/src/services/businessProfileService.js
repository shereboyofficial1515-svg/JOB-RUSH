const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const locationService = require('./locationService');
const { ensureWorkerProfileRow } = require('./profileService');

const EDITABLE_FIELDS = [
  'business_name',
  'description',
  'state_id',
  'lga_id',
  'area_id',
  'address',
  'landmark',
  'opening_hours',
  'contact_phone',
  'contact_email',
  'storefront_photo_url',
  'is_enabled',
];

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  return out;
}

/** Own view -- always returns the row (or null) regardless of is_enabled, so a worker can edit a draft before publishing it. */
async function getOwn(workerUserId) {
  const { rows } = await query(
    `SELECT bp.*, st.name AS state_name, l.name AS lga_name, a.name AS area_name
       FROM business_profiles bp
       LEFT JOIN states st ON st.id = bp.state_id
       LEFT JOIN lgas l ON l.id = bp.lga_id
       LEFT JOIN areas a ON a.id = bp.area_id
      WHERE bp.worker_user_id = $1`,
    [workerUserId]
  );
  if (rows.length === 0) return null;
  const media = await listMedia(workerUserId);
  return { ...rows[0], media };
}

/** Public view -- only returns anything if the business profile is explicitly enabled by its owner. */
async function getPublic(workerUserId) {
  const profile = await getOwn(workerUserId);
  if (!profile || !profile.is_enabled) return null;
  return profile;
}

async function upsert(workerUserId, input) {
  await ensureWorkerProfileRow(workerUserId);
  const fields = pickAllowed(input);

  await locationService.assertLocationAllowed({
    stateId: fields.state_id,
    lgaId: fields.lga_id,
    areaId: fields.area_id,
  });

  const existing = await query('SELECT worker_user_id FROM business_profiles WHERE worker_user_id = $1', [workerUserId]);

  if (existing.rows.length === 0) {
    if (!fields.business_name) throw new AppError('Business name is required.', 400, 'VALIDATION_ERROR');
    const columns = ['worker_user_id', ...Object.keys(fields)];
    const values = [workerUserId, ...Object.values(fields)];
    const placeholders = values.map((_, i) => `$${i + 1}`);
    await query(`INSERT INTO business_profiles (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
  } else if (Object.keys(fields).length > 0) {
    const setClauses = Object.keys(fields).map((f, i) => `${f} = $${i + 2}`);
    await query(`UPDATE business_profiles SET ${setClauses.join(', ')} WHERE worker_user_id = $1`, [
      workerUserId,
      ...Object.values(fields),
    ]);
  }

  return getOwn(workerUserId);
}

async function remove(workerUserId) {
  await query('DELETE FROM business_profiles WHERE worker_user_id = $1', [workerUserId]);
}

async function listMedia(workerUserId) {
  const { rows } = await query('SELECT * FROM business_media WHERE worker_user_id = $1 ORDER BY sort_order', [workerUserId]);
  return rows;
}

async function addMedia(workerUserId, mediaUrl) {
  const owns = await query('SELECT 1 FROM business_profiles WHERE worker_user_id = $1', [workerUserId]);
  if (owns.rows.length === 0) throw new AppError('Create a business profile before adding photos.', 400, 'NO_BUSINESS_PROFILE');

  const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM business_media WHERE worker_user_id = $1', [workerUserId]);
  if (countRows[0].count >= 10) throw new AppError('A business profile can have at most 10 additional photos.', 400, 'LIMIT_REACHED');

  const { rows } = await query(
    'INSERT INTO business_media (worker_user_id, media_url, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [workerUserId, mediaUrl, countRows[0].count]
  );
  return rows[0];
}

async function removeMedia(id, workerUserId) {
  await query('DELETE FROM business_media WHERE id = $1 AND worker_user_id = $2', [id, workerUserId]);
}

module.exports = { getOwn, getPublic, upsert, remove, listMedia, addMedia, removeMedia };
