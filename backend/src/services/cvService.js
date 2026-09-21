const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const storageService = require('../services/storageService');
const { ensureWorkerProfileRow } = require('./profileService');

const EDITABLE_FIELDS = ['cv_type', 'storage_path', 'file_name', 'mime_type', 'file_size', 'visibility'];

function pickAllowed(input) {
  const out = {};
  for (const field of EDITABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(input, field)) out[field] = input[field];
  }
  return out;
}

async function getRow(workerUserId) {
  const { rows } = await query('SELECT * FROM worker_cv WHERE worker_user_id = $1', [workerUserId]);
  return rows[0] || null;
}

/** The owner always sees their own CV in full, regardless of its visibility setting, with a signed link if it's an uploaded file. */
async function getOwn(workerUserId) {
  const row = await getRow(workerUserId);
  if (!row) return null;
  const signedUrl = row.cv_type === 'uploaded_file' && row.storage_path
    ? await storageService.getSignedUrl('CV_DOCUMENTS', row.storage_path, 300)
    : null;
  return { ...row, signedUrl };
}

/**
 * A hirer counts as "verified" using the same email/phone verification
 * Job Rush already tracks on every account — there's no separate
 * hirer-verification-badge system the way workers have one, so this
 * reuses that real signal instead of inventing a new flag.
 */
async function isVerifiedHirer(viewerUser) {
  if (!viewerUser || viewerUser.role !== 'hirer') return false;
  const { rows } = await query(
    'SELECT email_verified_at, phone_verified_at FROM users WHERE id = $1',
    [viewerUser.id]
  );
  const u = rows[0];
  return !!(u && (u.email_verified_at || u.phone_verified_at));
}

/**
 * What another user (possibly anonymous) may see of a worker's CV.
 * `private` never leaves this function as anything but `null`, no
 * matter who's asking — the caller cannot distinguish "no CV" from
 * "CV exists but is private", which is the point.
 */
async function getForViewer(workerUserId, viewerUser) {
  const row = await getRow(workerUserId);
  if (!row) return null;
  if (row.visibility === 'private') return null;
  if (row.visibility === 'verified_hirers_only') {
    const allowed = viewerUser && (viewerUser.id === workerUserId || (await isVerifiedHirer(viewerUser)));
    if (!allowed) return null;
  }

  const signedUrl = row.cv_type === 'uploaded_file' && row.storage_path
    ? await storageService.getSignedUrl('CV_DOCUMENTS', row.storage_path, 300)
    : null;
  return {
    cvType: row.cv_type,
    fileName: row.file_name,
    mimeType: row.mime_type,
    visibility: row.visibility,
    signedUrl,
  };
}

/** Upload/replace — upserts the single CV row a worker has, deleting the previous file (if any) once the new one is safely stored. */
async function upsert(workerUserId, input) {
  await ensureWorkerProfileRow(workerUserId);
  const fields = pickAllowed(input);
  const existing = await getRow(workerUserId);

  const { rows } = await query(
    `INSERT INTO worker_cv (worker_user_id, cv_type, storage_path, file_name, mime_type, file_size, visibility)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::cv_visibility_setting, 'private'))
     ON CONFLICT (worker_user_id) DO UPDATE SET
       cv_type = EXCLUDED.cv_type,
       storage_path = EXCLUDED.storage_path,
       file_name = EXCLUDED.file_name,
       mime_type = EXCLUDED.mime_type,
       file_size = EXCLUDED.file_size,
       visibility = COALESCE($7::cv_visibility_setting, worker_cv.visibility)
     RETURNING *`,
    [
      workerUserId,
      fields.cv_type || 'uploaded_file',
      fields.storage_path || null,
      fields.file_name || null,
      fields.mime_type || null,
      fields.file_size || null,
      fields.visibility || null,
    ]
  );

  // Best-effort — an orphaned old file is a storage-cost concern, not
  // a correctness one, and must never block the new CV from saving.
  if (existing?.storage_path && existing.storage_path !== rows[0].storage_path) {
    storageService.deleteObject('CV_DOCUMENTS', existing.storage_path).catch(() => {});
  }

  return rows[0];
}

/** Visibility-only update — the "CV privacy" control, without re-uploading anything. */
async function updateVisibility(workerUserId, visibility) {
  const { rows } = await query(
    'UPDATE worker_cv SET visibility = $2 WHERE worker_user_id = $1 RETURNING *',
    [workerUserId, visibility]
  );
  if (rows.length === 0) throw new AppError('No CV to update yet — upload or build one first.', 404, 'NOT_FOUND');
  return rows[0];
}

async function remove(workerUserId) {
  const existing = await getRow(workerUserId);
  if (!existing) return;
  await query('DELETE FROM worker_cv WHERE worker_user_id = $1', [workerUserId]);
  if (existing.storage_path) {
    storageService.deleteObject('CV_DOCUMENTS', existing.storage_path).catch(() => {});
  }
}

module.exports = { getOwn, getForViewer, upsert, updateVisibility, remove };
