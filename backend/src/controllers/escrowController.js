const escrowService = require('../services/escrowService');
const subscriptionService = require('../services/subscriptionService');
const paystackService = require('../services/paystackService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const initiateFunding = asyncHandler(async (req, res) => {
  const result = await escrowService.initiateEscrowFunding(req.user.id, {
    contractId: req.body.contractId,
    payerEmail: req.user.email,
    callbackUrl: req.body.callbackUrl,
  });
  res.status(201).json(result);
});

/**
 * GET /api/escrow/verify/:reference
 * Manual fallback for when the hirer is redirected back from
 * Paystack before the webhook has landed. Calls the same idempotent
 * finalizeFunding used by the webhook, so whichever arrives first
 * "wins" and the second is a no-op.
 */
const verifyFunding = asyncHandler(async (req, res) => {
  const result = await escrowService.finalizeFunding(req.params.reference);
  res.status(200).json(result);
});

const releaseEscrow = asyncHandler(async (req, res) => {
  const escrow = await escrowService.releaseEscrow(req.params.id, req.user.id);
  res.status(200).json({ escrowTransaction: escrow });
});

/** Admin-only (finance_admin/super_admin) — see routes. */
const refundEscrow = asyncHandler(async (req, res) => {
  const escrow = await escrowService.refundEscrow(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ escrowTransaction: escrow });
});

const getForContract = asyncHandler(async (req, res) => {
  const escrowTransactions = await escrowService.getEscrowForContract(req.params.contractId, req.user.id);
  res.status(200).json({ escrowTransactions });
});

/**
 * POST /api/escrow/webhook
 * The single shared Paystack webhook endpoint for this platform —
 * Paystack only supports one webhook URL per account, so both escrow
 * funding events and PRO subscription events land here and are
 * dispatched to their respective services. Mounted with a raw-body
 * parser (see server.js) so `req.body` here is a Buffer, not parsed
 * JSON — required for signature verification to match what Paystack
 * actually signed.
 */
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = req.body; // Buffer, thanks to express.raw() on this route only

  if (!paystackService.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Rejected Paystack webhook with invalid signature');
    throw new AppError('Invalid signature.', 401, 'INVALID_SIGNATURE');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new AppError('Invalid payload.', 400, 'INVALID_PAYLOAD');
  }

  await escrowService.handleWebhookEvent(event);
  await subscriptionService.handleWebhookEvent(event).catch((err) => {
    logger.error('Subscription webhook handling failed', { event: event.event, error: err.message });
  });

  // Paystack expects a fast 200 regardless of internal outcome, or it
  // will keep retrying — internal failures are logged, not surfaced here.
  res.status(200).json({ received: true });
});

module.exports = { initiateFunding, verifyFunding, releaseEscrow, refundEscrow, getForContract, webhook };
