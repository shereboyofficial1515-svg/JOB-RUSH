const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const locationService = require('./locationService');
const storageService = require('./storageService');
const { ensureWorkerProfileRow, ensureHirerProfileRow } = require('./profileService');

const EDITABLE_FIELDS = [
  'business_name',
  'description',
  'state_id',
  'lga_id',
  'area_id',
  'address',
  'landmark',
  'opening_hours_structured',
  'contact_phone',
  'contact_email',
  'storefront_photo_url',
  'is_enabled',
];

/**
 * Canonical stored shape for one day: closed days carry no times, 24-hour
 * days carry none either, and unknown keys are dropped.
 */
function normalizeOpeningHours(days) {
  return days.map((d) => {
    if (!d.open) return { day: d.day, open: false };
    if (d.is24h) return { day: d.day, open: true, is24h: true };
    return { day: d.day, open: true, is24h: false, opens: d.opens, closes: d.closes, endsNextDay: !!d.endsNextDay };
  });
}

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  if (out.opening_hours_structured) {
    // Stored as JSONB (the driver would otherwise send a JS array as a
    // Postgres array), and the old free-text value is retired so the profile
    // never carries two conflicting sets of hours.
    out.opening_hours_structured = JSON.stringify(normalizeOpeningHours(out.opening_hours_structured));
    out.opening_hours = null;
  }
  return out;
}

/**
 * A business profile belongs to exactly one of worker_user_id/
 * hirer_user_id (enforced by the DB's own CHECK constraint too — this
 * just picks which column a given caller is operating as). Many
 * hirers are themselves small businesses/companies, so this isn't
 * worker-only the way it originally was.
 */
function ownerColumn(role) {
  if (role !== 'worker' && role !== 'hirer') throw new AppError('Invalid business profile owner role.', 400, 'INVALID_OWNER_ROLE');
  return role === 'worker' ? 'worker_user_id' : 'hirer_user_id';
}

/** Own view — always returns the row (or null) regardless of is_enabled, so the owner can edit a draft before publishing it. */
async function getOwn(role, userId) {
  const column = ownerColumn(role);
  const { rows } = await query(
    `SELECT bp.*, st.name AS state_name, l.name AS lga_name, a.name AS area_name
       FROM business_profiles bp
       LEFT JOIN states st ON st.id = bp.state_id
       LEFT JOIN lgas l ON l.id = bp.lga_id
       LEFT JOIN areas a ON a.id = bp.area_id
      WHERE bp.${column} = $1`,
    [userId]
  );
  if (rows.length === 0) return null;
  const media = await listMedia(rows[0].id);
  return { ...rows[0], media };
}

/**
 * Public view by owner user ID — tries both owner columns since a
 * caller looking up "this profile's business" doesn't necessarily
 * know in advance whether that user is a worker or a hirer. Only
 * returns anything if the business profile is explicitly enabled.
 */
async function getPublicByUserId(userId) {
  const { rows } = await query(
    `SELECT bp.*, st.name AS state_name, l.name AS lga_name, a.name AS area_name
       FROM business_profiles bp
       LEFT JOIN states st ON st.id = bp.state_id
       LEFT JOIN lgas l ON l.id = bp.lga_id
       LEFT JOIN areas a ON a.id = bp.area_id
      WHERE (bp.worker_user_id = $1 OR bp.hirer_user_id = $1) AND bp.is_enabled = true`,
    [userId]
  );
  if (rows.length === 0) return null;
  const media = await listMedia(rows[0].id);
  return { ...rows[0], media };
}

async function upsert(role, userId, input) {
  const column = ownerColumn(role);
  if (role === 'worker') await ensureWorkerProfileRow(userId);
  else await ensureHirerProfileRow(userId);

  const fields = pickAllowed(input);

  await locationService.assertLocationAllowed({
    stateId: fields.state_id,
    lgaId: fields.lga_id,
    areaId: fields.area_id,
  });

  const existing = await query(`SELECT id, storefront_photo_url FROM business_profiles WHERE ${column} = $1`, [userId]);

  // The photo must be one this user uploaded; a replaced or removed one is deleted from storage afterwards.
  const previousPhoto = existing.rows[0] ? existing.rows[0].storefront_photo_url : null;
  const photoChanged = Object.prototype.hasOwnProperty.call(fields, 'storefront_photo_url') && fields.storefront_photo_url !== previousPhoto;
  if (photoChanged && fields.storefront_photo_url) {
    storageService.assertOwnedPublicUrl('BUSINESS_PHOTOS', userId, fields.storefront_photo_url, 'photo');
  }

  if (existing.rows.length === 0) {
    if (!fields.business_name) throw new AppError('Business name is required.', 400, 'VALIDATION_ERROR');
    const columns = [column, ...Object.keys(fields)];
    const values = [userId, ...Object.values(fields)];
    const placeholders = values.map((_, i) => `$${i + 1}`);
    await query(`INSERT INTO business_profiles (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`, values);
  } else if (Object.keys(fields).length > 0) {
    const setClauses = Object.keys(fields).map((f, i) => `${f} = $${i + 2}`);
    await query(`UPDATE business_profiles SET ${setClauses.join(', ')} WHERE ${column} = $1`, [
      userId,
      ...Object.values(fields),
    ]);
  }

  if (photoChanged && previousPhoto) await storageService.removeOwnedPublicUrl('BUSINESS_PHOTOS', userId, previousPhoto);

  return getOwn(role, userId);
}

async function remove(role, userId) {
  const column = ownerColumn(role);
  const { rows } = await query(`DELETE FROM business_profiles WHERE ${column} = $1 RETURNING storefront_photo_url`, [userId]);
  if (rows[0] && rows[0].storefront_photo_url) await storageService.removeOwnedPublicUrl('BUSINESS_PHOTOS', userId, rows[0].storefront_photo_url);
}

async function listMedia(businessProfileId) {
  const { rows } = await query('SELECT * FROM business_media WHERE business_profile_id = $1 ORDER BY sort_order', [businessProfileId]);
  return rows;
}

async function addMedia(role, userId, mediaUrl) {
  const column = ownerColumn(role);
  const owns = await query(`SELECT id FROM business_profiles WHERE ${column} = $1`, [userId]);
  if (owns.rows.length === 0) throw new AppError('Create a business profile before adding photos.', 400, 'NO_BUSINESS_PROFILE');
  const businessProfileId = owns.rows[0].id;
  storageService.assertOwnedPublicUrl('BUSINESS_PHOTOS', userId, mediaUrl, 'photo');

  const { rows: countRows } = await query('SELECT COUNT(*)::int AS count FROM business_media WHERE business_profile_id = $1', [businessProfileId]);
  if (countRows[0].count >= 10) throw new AppError('A business profile can have at most 10 additional photos.', 400, 'LIMIT_REACHED');

  const { rows } = await query(
    'INSERT INTO business_media (business_profile_id, media_url, sort_order) VALUES ($1, $2, $3) RETURNING *',
    [businessProfileId, mediaUrl, countRows[0].count]
  );
  return rows[0];
}

async function removeMedia(id, role, userId) {
  const column = ownerColumn(role);
  const { rows } = await query(
    `DELETE FROM business_media WHERE id = $1 AND business_profile_id = (SELECT id FROM business_profiles WHERE ${column} = $2) RETURNING media_url`,
    [id, userId]
  );
  if (rows[0]) await storageService.removeOwnedPublicUrl('BUSINESS_PHOTOS', userId, rows[0].media_url);
}

module.exports = { getOwn, getPublicByUserId, upsert, remove, listMedia, addMedia, removeMedia };
