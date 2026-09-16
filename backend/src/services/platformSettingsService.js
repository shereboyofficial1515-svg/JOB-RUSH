const { query } = require('../config/db');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const paystackService = require('./paystackService');

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

/**
 * Updates the PRO price in both places that matter: our own settings
 * row (what the app displays and records against new subscriptions)
 * and the actual Paystack plan (what a subscriber is really charged
 * — see paystackService.updatePlan). Updating only the local row
 * would make the admin UI lie about the real price.
 */
async function updateProPrice(newPriceNgn, adminUserId) {
  if (!env.PAYSTACK_PRO_PLAN_CODE) {
    throw new AppError('PRO subscriptions are not configured on this server yet.', 503, 'PRO_NOT_CONFIGURED');
  }
  await paystackService.updatePlan(env.PAYSTACK_PRO_PLAN_CODE, { amountKobo: newPriceNgn * 100 });

  const { rows } = await query(
    `UPDATE platform_settings SET pro_monthly_price_ngn = $1, updated_by = $2, updated_at = now() WHERE id = 1 RETURNING *`,
    [newPriceNgn, adminUserId]
  );
  return rows[0];
}

/** Current PRO price in Naira — subscriptionService reads this instead of the env var so admins can change it without a deploy. */
async function getProMonthlyPriceNgn() {
  const settings = await getSettings();
  return settings.pro_monthly_price_ngn;
}

module.exports = { getSettings, updateFeePercent, updateProPrice, getProMonthlyPriceNgn };
