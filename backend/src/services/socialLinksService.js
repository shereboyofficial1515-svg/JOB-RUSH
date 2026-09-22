const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const { ensureWorkerProfileRow } = require('./profileService');

const PLATFORMS = ['facebook', 'instagram', 'tiktok', 'youtube', 'website'];

/**
 * Normalizes a social link URL and rejects dangerous schemes
 * (javascript:, data:, vbscript:, etc.) — a bare `.url()` check alone
 * would accept `javascript:alert(1)` as a syntactically valid URL, so
 * this is the actual security boundary, not the zod schema. A bare
 * domain (no scheme) is treated as https:// rather than rejected,
 * since that's the overwhelmingly common way a user types one in.
 */
function normalizeSocialUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) {
    throw new AppError('A URL is required.', 400, 'VALIDATION_ERROR');
  }
  let candidate = rawUrl.trim();
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new AppError('That does not look like a valid URL.', 400, 'INVALID_URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError('Only http/https links are allowed.', 400, 'INVALID_URL_SCHEME');
  }
  if (!parsed.hostname) {
    throw new AppError('That does not look like a valid URL.', 400, 'INVALID_URL');
  }

  return parsed.toString();
}

function assertValidPlatform(platform) {
  if (!PLATFORMS.includes(platform)) {
    throw new AppError('Unsupported social platform.', 400, 'INVALID_PLATFORM');
  }
}

/** Own view — every link regardless of is_enabled, so the worker can toggle a disabled one back on. */
async function listForWorker(workerUserId) {
  const { rows } = await query(
    'SELECT * FROM worker_social_links WHERE worker_user_id = $1 ORDER BY platform',
    [workerUserId]
  );
  return rows;
}

/** Public view — only links the worker has explicitly enabled. */
async function listPublicForWorker(workerUserId) {
  const { rows } = await query(
    'SELECT platform, url FROM worker_social_links WHERE worker_user_id = $1 AND is_enabled = true ORDER BY platform',
    [workerUserId]
  );
  return rows;
}

/** Creates or replaces the one link a worker has for a given platform. */
async function upsert(workerUserId, platform, input) {
  assertValidPlatform(platform);
  await ensureWorkerProfileRow(workerUserId);

  const url = normalizeSocialUrl(input.url);
  const isEnabled = input.isEnabled !== false; // defaults to enabled when adding a new link

  const { rows } = await query(
    `INSERT INTO worker_social_links (worker_user_id, platform, url, is_enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (worker_user_id, platform)
     DO UPDATE SET url = EXCLUDED.url, is_enabled = EXCLUDED.is_enabled
     RETURNING *`,
    [workerUserId, platform, url, isEnabled]
  );
  return rows[0];
}

/** Toggles an existing link's visibility without touching its URL. */
async function setEnabled(workerUserId, platform, isEnabled) {
  assertValidPlatform(platform);
  const { rows } = await query(
    'UPDATE worker_social_links SET is_enabled = $1 WHERE worker_user_id = $2 AND platform = $3 RETURNING *',
    [!!isEnabled, workerUserId, platform]
  );
  if (rows.length === 0) throw new AppError('Social link not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function remove(workerUserId, platform) {
  assertValidPlatform(platform);
  await query('DELETE FROM worker_social_links WHERE worker_user_id = $1 AND platform = $2', [workerUserId, platform]);
}

module.exports = { PLATFORMS, listForWorker, listPublicForWorker, upsert, setEnabled, remove };
