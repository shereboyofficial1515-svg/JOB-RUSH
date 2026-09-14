const { query, withTransaction } = require('../config/db');
const AppError = require('../utils/AppError');

async function ensureWalletRow(userId, client) {
  const runner = client || { query };
  await runner.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
}

async function getWallet(userId) {
  await ensureWalletRow(userId);
  const { rows } = await query('SELECT * FROM wallets WHERE user_id = $1', [userId]);
  return rows[0];
}

/**
 * Credits a wallet. Always runs inside a transaction the caller
 * provides (or opens one itself if called standalone), locking the
 * wallet row first (`SELECT ... FOR UPDATE`) so two concurrent
 * credits/debits can't race on the same balance. Writes exactly one
 * ledger row per call — the ledger and the balance are updated
 * together or not at all.
 */
async function creditWallet({ userId, amount, category, sourceId, description }, externalClient) {
  const run = async (client) => {
    await ensureWalletRow(userId, client);
    const { rows: locked } = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = locked[0];

    const newBalance = Number(wallet.available_balance) + Number(amount);
    await client.query('UPDATE wallets SET available_balance = $2 WHERE user_id = $1', [userId, newBalance]);
    await client.query(
      `INSERT INTO wallet_transactions (wallet_user_id, type, category, amount, balance_after, source_id, description)
       VALUES ($1, 'credit', $2, $3, $4, $5, $6)`,
      [userId, category, amount, newBalance, sourceId || null, description || null]
    );
    return newBalance;
  };

  return externalClient ? run(externalClient) : withTransaction(run);
}

/**
 * Debits a wallet. Throws if the available balance is insufficient —
 * checked under the same row lock as the update, so a concurrent
 * debit can't push the balance negative between the check and the
 * write (the DB's `available_balance >= 0` CHECK constraint is the
 * final backstop even if application logic had a gap).
 */
async function debitWallet({ userId, amount, category, sourceId, description }, externalClient) {
  const run = async (client) => {
    await ensureWalletRow(userId, client);
    const { rows: locked } = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const wallet = locked[0];

    if (Number(wallet.available_balance) < Number(amount)) {
      throw new AppError('Insufficient wallet balance.', 400, 'INSUFFICIENT_BALANCE');
    }

    const newBalance = Number(wallet.available_balance) - Number(amount);
    await client.query('UPDATE wallets SET available_balance = $2 WHERE user_id = $1', [userId, newBalance]);
    await client.query(
      `INSERT INTO wallet_transactions (wallet_user_id, type, category, amount, balance_after, source_id, description)
       VALUES ($1, 'debit', $2, $3, $4, $5, $6)`,
      [userId, category, amount, newBalance, sourceId || null, description || null]
    );
    return newBalance;
  };

  return externalClient ? run(externalClient) : withTransaction(run);
}

async function getTransactionHistory(userId, { page = 1, pageSize = 50 } = {}) {
  const limit = Math.min(Math.max(pageSize, 1), 100);
  const offset = (Math.max(page, 1) - 1) * limit;
  const { rows } = await query(
    `SELECT * FROM wallet_transactions WHERE wallet_user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );
  return rows;
}

module.exports = { getWallet, creditWallet, debitWallet, getTransactionHistory };
