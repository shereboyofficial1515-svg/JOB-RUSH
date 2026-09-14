const { query } = require('../config/db');

async function getSettings() {
  const { rows } = await query('SELECT * FROM platform_settings WHERE id = 1');
  return rows[0];
}

async function updateFeePercent(newPercent, adminUserId) {
  const { rows } = await query(
    `UPDATE platform_settings SET platform_fee_percent = $1, updated_by = $2, updated_at = now() WHERE id = 1 RETURNING *`,
    [newPercent, adminUserId]
  );
  return rows[0];
}

module.exports = { getSettings, updateFeePercent };
