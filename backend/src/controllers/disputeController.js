const disputeService = require('../services/disputeService');
const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

const open = asyncHandler(async (req, res) => {
  const dispute = await disputeService.openDispute(req.user.id, req.body);
  res.status(201).json({ dispute });
});

const getById = asyncHandler(async (req, res) => {
  const dispute = await disputeService.getOwnedDispute(req.params.id, req.user.id);
  res.status(200).json({ dispute });
});

const listOwn = asyncHandler(async (req, res) => {
  const disputes = await disputeService.listOwnDisputes(req.user.id);
  res.status(200).json({ disputes });
});

const addEvidence = asyncHandler(async (req, res) => {
  const evidence = await disputeService.addEvidence(req.params.id, req.user.id, req.body);
  res.status(201).json({ evidence });
});

const listEvidence = asyncHandler(async (req, res) => {
  const evidence = await disputeService.listEvidence(req.params.id, req.user.id);
  res.status(200).json({ evidence });
});

// --- Admin ---
const listForAdmin = asyncHandler(async (req, res) => {
  const disputes = await disputeService.listDisputesForAdmin(req.query.status);
  res.status(200).json({ disputes });
});

const getForAdmin = asyncHandler(async (req, res) => {
  const dispute = await disputeService.getDisputeForAdmin(req.params.id);
  res.status(200).json({ dispute });
});

/** Admin bypasses the participant check by construction — gated by requireAdmin on the route, not getOwnedDispute. */
const listEvidenceForAdmin = asyncHandler(async (req, res) => {
  const { rows } = await query('SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at', [
    req.params.id,
  ]);
  res.status(200).json({ evidence: rows });
});

const updateStatus = asyncHandler(async (req, res) => {
  const dispute = await disputeService.updateDisputeStatus(req.params.id, req.user.id, req.body.status);
  res.status(200).json({ dispute });
});

const resolve = asyncHandler(async (req, res) => {
  const dispute = await disputeService.resolveDispute(req.params.id, req.user.id, req.body);
  res.status(200).json({ dispute });
});

const reject = asyncHandler(async (req, res) => {
  const dispute = await disputeService.rejectDispute(req.params.id, req.user.id, req.body.reason);
  res.status(200).json({ dispute });
});

module.exports = {
  open,
  getById,
  listOwn,
  addEvidence,
  listEvidence,
  listForAdmin,
  getForAdmin,
  listEvidenceForAdmin,
  updateStatus,
  resolve,
  reject,
};
