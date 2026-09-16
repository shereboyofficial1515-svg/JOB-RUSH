/**
 * Paystack integration. PAYSTACK_SECRET_KEY never leaves this file —
 * every payment/transfer action funnels through here so the secret
 * has exactly one place it can be used from.
 */
const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');

const BASE_URL = 'https://api.paystack.co';

function assertConfigured() {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new AppError('Payments are not configured on this server yet.', 503, 'PAYSTACK_NOT_CONFIGURED');
  }
}

async function paystackRequest(path, { method = 'GET', body } = {}) {
  assertConfigured();
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || !json || json.status === false) {
    throw new AppError(
      json?.message || 'Payment provider request failed.',
      502,
      'PAYSTACK_REQUEST_FAILED'
    );
  }
  return json.data;
}

/**
 * Initializes a transaction for the hirer to fund escrow. Amount must
 * be provided in kobo (smallest currency unit) — the caller is
 * responsible for converting Naira to kobo before calling this.
 */
async function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  return paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      amount: amountKobo,
      reference,
      callback_url: callbackUrl,
      metadata,
    },
  });
}

/**
 * Independently verifies a transaction against Paystack's own
 * records — this is the only source of truth for "did this payment
 * actually succeed," never the frontend's redirect or a client claim.
 */
async function verifyTransaction(reference) {
  return paystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`);
}

/** Creates a transfer recipient. The raw account number is used here and nowhere else. */
async function createTransferRecipient({ name, accountNumber, bankCode }) {
  return paystackRequest('/transferrecipient', {
    method: 'POST',
    body: {
      type: 'nuban',
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: 'NGN',
    },
  });
}

async function initiateTransfer({ amountKobo, recipientCode, reference, reason }) {
  return paystackRequest('/transfer', {
    method: 'POST',
    body: {
      source: 'balance',
      amount: amountKobo,
      recipient: recipientCode,
      reference,
      reason,
    },
  });
}

async function initiateRefund({ transactionReference, amountKobo, reason }) {
  return paystackRequest('/refund', {
    method: 'POST',
    body: {
      transaction: transactionReference,
      amount: amountKobo,
      customer_note: reason,
    },
  });
}

/**
 * Verifies the `x-paystack-signature` header using HMAC-SHA512 over
 * the raw request body with the secret key. The webhook route MUST
 * use a raw-body parser for this path so `rawBody` is the exact bytes
 * Paystack signed — a re-serialized JSON body will not match.
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!env.PAYSTACK_SECRET_KEY || !signatureHeader) return false;
  const expected = crypto.createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const givenBuf = Buffer.from(signatureHeader, 'utf8');
  if (expectedBuf.length !== givenBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, givenBuf);
}

function nairaToKobo(nairaAmount) {
  return Math.round(Number(nairaAmount) * 100);
}

/**
 * Initializes a transaction with a Paystack plan attached — a
 * successful charge against a plan is what causes Paystack to create
 * the recurring subscription server-side and start auto-billing.
 */
async function initializeSubscriptionTransaction({ email, planCode, reference, callbackUrl, metadata }) {
  return paystackRequest('/transaction/initialize', {
    method: 'POST',
    body: {
      email,
      plan: planCode,
      reference,
      callback_url: callbackUrl,
      metadata,
    },
  });
}

/** Cancels a Paystack-managed subscription so it stops auto-renewing. */
async function disableSubscription({ subscriptionCode, emailToken }) {
  return paystackRequest('/subscription/disable', {
    method: 'POST',
    body: { code: subscriptionCode, token: emailToken },
  });
}

/** Re-enables a previously disabled Paystack-managed subscription so it resumes auto-renewing. */
async function enableSubscription({ subscriptionCode, emailToken }) {
  return paystackRequest('/subscription/enable', {
    method: 'POST',
    body: { code: subscriptionCode, token: emailToken },
  });
}

/**
 * Creates a recurring billing plan on Paystack (e.g. "JOB RUSH PRO —
 * ₦4,000/month"). This is a one-time setup call, not something the
 * app runs per-subscriber — the resulting plan_code is what every
 * subscriber's transaction gets initialized against afterwards
 * (see initializeSubscriptionTransaction). Returns the created plan,
 * including its plan_code.
 */
async function createPlan({ name, amountKobo, interval = 'monthly', description }) {
  return paystackRequest('/plan', {
    method: 'POST',
    body: { name, amount: amountKobo, interval, description },
  });
}

/** Lists existing Paystack plans — used to check whether one already exists before creating a duplicate. */
async function listPlans() {
  return paystackRequest('/plan');
}

/**
 * Updates a plan's price at Paystack. This is the actual source of
 * truth for what a subscriber is charged — initializeSubscriptionTransaction
 * passes only the plan code, never an amount, so changing our local
 * price setting does nothing to real billing unless the plan itself
 * is updated too.
 */
async function updatePlan(planCodeOrId, { amountKobo }) {
  return paystackRequest(`/plan/${encodeURIComponent(planCodeOrId)}`, {
    method: 'PUT',
    body: { amount: amountKobo },
  });
}

module.exports = {
  initializeTransaction,
  initializeSubscriptionTransaction,
  verifyTransaction,
  createTransferRecipient,
  initiateTransfer,
  initiateRefund,
  disableSubscription,
  enableSubscription,
  createPlan,
  listPlans,
  updatePlan,
  verifyWebhookSignature,
  nairaToKobo,
};
