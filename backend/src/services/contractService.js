const { query } = require('../config/db');
const AppError = require('../utils/AppError');
const applicationService = require('./applicationService');
const jobService = require('./jobService');
const notificationService = require('./notificationService');

/**
 * Creates a contract from a hired application. Requires the
 * application to actually be in 'hired' status — a hirer can't spin
 * up a contract (and therefore an escrow funding flow) against a
 * worker who was never actually hired, no matter what IDs they send.
 */
async function createContractFromApplication(hirerUserId, applicationId, agreedAmount) {
  const application = await applicationService.getApplicationById(applicationId);
  if (!application) throw new AppError('Application not found.', 404, 'NOT_FOUND');

  const job = await jobService.getOwnedJob(application.job_id, hirerUserId); // throws if not owned

  if (application.status !== 'hired') {
    throw new AppError('A contract can only be created for a hired application.', 400, 'NOT_HIRED');
  }

  try {
    const { rows } = await query(
      `INSERT INTO contracts (job_id, application_id, hirer_user_id, worker_user_id, agreed_amount)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [job.id, applicationId, hirerUserId, application.worker_user_id, agreedAmount]
    );
    const contract = rows[0];

    const { rows: nameRows } = await query(
      `SELECT (SELECT full_name FROM users WHERE id = $1) AS worker_name,
              (SELECT full_name FROM users WHERE id = $2) AS hirer_name`,
      [application.worker_user_id, hirerUserId]
    );
    const { worker_name: workerName, hirer_name: hirerName } = nameRows[0] || {};

    notificationService.notifyUser(application.worker_user_id, 'contract_created', {
      title: 'Contract ready',
      body: `A contract has been created for "${job.title}".`,
      data: { contractTitle: job.title, otherParty: hirerName, status: 'Active', contractId: contract.id },
    }).catch(() => {});
    notificationService.notifyUser(hirerUserId, 'contract_created', {
      title: 'Contract ready',
      body: `A contract has been created for "${job.title}".`,
      data: { contractTitle: job.title, otherParty: workerName, status: 'Active', contractId: contract.id },
    }).catch(() => {});

    return contract;
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('A contract already exists for this application.', 409, 'CONTRACT_EXISTS');
    }
    throw err;
  }
}

/** Loads a contract the caller must be a party to (hirer or worker), or throws. */
async function getOwnedContract(contractId, userId) {
  const { rows } = await query(
    'SELECT * FROM contracts WHERE id = $1 AND (hirer_user_id = $2 OR worker_user_id = $2)',
    [contractId, userId]
  );
  if (rows.length === 0) throw new AppError('Contract not found.', 404, 'NOT_FOUND');
  return rows[0];
}

async function listContractsForUser(userId) {
  const { rows } = await query(
    'SELECT * FROM contracts WHERE hirer_user_id = $1 OR worker_user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return rows;
}

async function markContractCompleted(contractId) {
  await query(`UPDATE contracts SET status = 'completed' WHERE id = $1 AND status = 'active'`, [contractId]);
}

module.exports = { createContractFromApplication, getOwnedContract, listContractsForUser, markContractCompleted };
