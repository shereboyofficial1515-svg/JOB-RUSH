const walletService = require('../services/walletService');
const withdrawalService = require('../services/withdrawalService');
const asyncHandler = require('../utils/asyncHandler');

const getOwnWallet = asyncHandler(async (req, res) => {
  const wallet = await walletService.getWallet(req.user.id);
  res.status(200).json({ wallet });
});

const getOwnTransactions = asyncHandler(async (req, res) => {
  const transactions = await walletService.getTransactionHistory(req.user.id, req.query);
  res.status(200).json({ transactions });
});

const requestWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.requestWithdrawal(req.user.id, req.body);
  res.status(201).json({ withdrawal });
});

const listOwnWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await withdrawalService.listOwnWithdrawals(req.user.id);
  res.status(200).json({ withdrawals });
});

const getOwnWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.getOwnedWithdrawal(req.params.id, req.user.id);
  res.status(200).json({ withdrawal });
});

// --- Admin ---
const listPendingWithdrawals = asyncHandler(async (req, res) => {
  const withdrawals = await withdrawalService.listPendingWithdrawals();
  res.status(200).json({ withdrawals });
});

const approveWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.approveAndPayWithdrawal(req.params.id, req.user.id);
  res.status(200).json({ withdrawal });
});

const rejectWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await withdrawalService.rejectWithdrawal(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ withdrawal });
});

module.exports = {
  getOwnWallet,
  getOwnTransactions,
  requestWithdrawal,
  listOwnWithdrawals,
  getOwnWithdrawal,
  listPendingWithdrawals,
  approveWithdrawal,
  rejectWithdrawal,
};
