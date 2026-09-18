const { query } = require('../config/db');

// Columns a user may write directly via PATCH /settings. Split by the
// settings-page tab they belong to only for readability below — all
// of them live in the one `user_settings` row.
const EDITABLE_FIELDS = [
  'messaging_permission',
  'profile_visibility',
  'default_cover_note',
  'require_cover_note',
  'chat_theme',
  'chat_wallpaper',
  'chat_font_size',
  'chat_message_previews',
  'media_auto_download',
  'call_ringtone_enabled',
  'text_size',
  'high_contrast',
  'reduced_motion',
];

function pickAllowed(input, allowedFields) {
  const out = {};
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(input, field)) {
      out[field] = input[field];
    }
  }
  return out;
}

/**
 * Every user has exactly one settings row, created lazily on first
 * read/write with the schema defaults — there's no separate
 * "onboarding" step that provisions it up front.
 */
async function ensureSettingsRow(userId) {
  await query(`INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId]);
}

async function getSettings(userId) {
  await ensureSettingsRow(userId);
  const { rows } = await query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  return rows[0];
}

async function updateSettings(userId, input) {
  await ensureSettingsRow(userId);
  const updates = pickAllowed(input, EDITABLE_FIELDS);

  if (Object.keys(updates).length === 0) {
    return getSettings(userId);
  }

  const setClauses = Object.keys(updates).map((field, i) => `${field} = $${i + 2}`);
  await query(
    `UPDATE user_settings SET ${setClauses.join(', ')} WHERE user_id = $1`,
    [userId, ...Object.values(updates)]
  );
  return getSettings(userId);
}

/**
 * Real, non-fake byte totals: sums file_size across every category of
 * media the user actually owns. Rows uploaded before file_size was
 * tracked (or before a given upload flow started reporting it) count
 * as 0 bytes here rather than being estimated — an honest "we don't
 * know" reads better than a made-up number.
 */
async function getStorageUsage(userId) {
  const { rows: portfolioRows } = await query(
    `SELECT pm.media_type, COALESCE(SUM(pm.file_size), 0)::bigint AS bytes, COUNT(*)::int AS count
       FROM portfolio_media pm
       JOIN portfolios p ON p.id = pm.portfolio_id
      WHERE p.worker_user_id = $1
      GROUP BY pm.media_type`,
    [userId]
  );

  const { rows: chatRows } = await query(
    `SELECT mm.media_type, COALESCE(SUM(mm.file_size), 0)::bigint AS bytes, COUNT(*)::int AS count
       FROM message_media mm
       JOIN messages m ON m.id = mm.message_id
      WHERE m.sender_id = $1
      GROUP BY mm.media_type`,
    [userId]
  );

  const { rows: verificationRows } = await query(
    `SELECT COALESCE(SUM(vd.file_size), 0)::bigint AS bytes, COUNT(*)::int AS count
       FROM verification_documents vd
       JOIN verification_requests vr ON vr.id = vd.verification_request_id
      WHERE vr.worker_user_id = $1`,
    [userId]
  );

  const byType = { image: { bytes: 0, count: 0 }, video: { bytes: 0, count: 0 }, document: { bytes: 0, count: 0 }, voice_note: { bytes: 0, count: 0 } };
  const addRows = (rows) => {
    for (const r of rows) {
      const key = byType[r.media_type] ? r.media_type : null;
      if (!key) continue;
      byType[key].bytes += Number(r.bytes);
      byType[key].count += r.count;
    }
  };
  addRows(portfolioRows);
  addRows(chatRows);

  const verification = verificationRows[0] || { bytes: 0, count: 0 };

  return {
    photos: { bytes: byType.image.bytes, count: byType.image.count },
    videos: { bytes: byType.video.bytes, count: byType.video.count },
    documents: { bytes: byType.document.bytes + Number(verification.bytes), count: byType.document.count + verification.count },
    audio: { bytes: byType.voice_note.bytes, count: byType.voice_note.count },
    totalBytes: byType.image.bytes + byType.video.bytes + byType.document.bytes + byType.voice_note.bytes + Number(verification.bytes),
  };
}

module.exports = {
  getSettings,
  updateSettings,
  getStorageUsage,
};
