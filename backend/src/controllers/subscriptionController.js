const subscriptionService = require('../services/subscriptionService');
const asyncHandler = require('../utils/asyncHandler');

const initiate = asyncHandler(async (req, res) => {
  const result = await subscriptionService.initiateSubscription(req.user.id, {
    payerEmail: req.user.email,
    callbackUrl: req.body.callbackUrl,
  });
  res.status(201).json(result);
});

const verify = asyncHandler(async (req, res) => {
  const result = await subscriptionService.finalizeInitialPayment(req.params.reference);
  res.status(200).json(result);
});

const getOwn = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.getOwnSubscription(req.user.id);
  res.status(200).json({ subscription });
});

const getOwnPaymentHistory = asyncHandler(async (req, res) => {
  const payments = await subscriptionService.listOwnPaymentHistory(req.user.id);
  res.status(200).json({ payments });
});

const cancel = asyncHandler(async (req, res) => {
  const subscription = await subscriptionService.cancelOwnSubscription(req.user.id);
  res.status(200).json({ subscription });
});

// --- Admin ---
const listForAdmin = asyncHandler(async (req, res) => {
  const subscriptions = await subscriptionService.listSubscriptionsForAdmin(req.query.status);
  res.status(200).json({ subscriptions });
});

const revenue = asyncHandler(async (req, res) => {
  const summary = await subscriptionService.getRevenueSummary();
  res.status(200).json({ summary });
});

const suspend = asyncHandler(async (req, res) => {
  await subscriptionService.suspendSubscription(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ message: 'Subscription suspended.' });
});

module.exports = { initiate, verify, getOwn, getOwnPaymentHistory, cancel, listForAdmin, revenue, suspend };
