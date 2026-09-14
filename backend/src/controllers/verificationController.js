const verificationService = require('../services/verificationService');
const storageService = require('../services/storageService');
const asyncHandler = require('../utils/asyncHandler');

/** POST /api/verification/submit — worker only, own account */
const submit = asyncHandler(async (req, res) => {
  const request = await verificationService.submitVerification(req.user.id, req.body.documents);
  res.status(201).json({ request });
});

/** GET /api/verification/me */
const getOwnStatus = asyncHandler(async (req, res) => {
  const request = await verificationService.getOwnLatestVerification(req.user.id);
  res.status(200).json({ request });
});

/** GET /api/admin/verification/pending — verification_admin or super_admin only */
const listPending = asyncHandler(async (req, res) => {
  const requests = await verificationService.listPendingVerifications();
  res.status(200).json({ requests });
});

/**
 * GET /api/admin/verification/:id/documents — admin-only, never
 * exposed to the worker. Returns short-lived signed URLs, not raw
 * storage paths, so a leaked response body can't be used to fetch
 * the private object directly or indefinitely.
 */
const getDocuments = asyncHandler(async (req, res) => {
  const documents = await verificationService.getVerificationDocuments(req.params.id);
  const withSignedUrls = await Promise.all(
    documents.map(async (doc) => ({
      id: doc.id,
      documentType: doc.document_type,
      uploadedAt: doc.uploaded_at,
      signedUrl: await storageService.getSignedUrl('VERIFICATION_DOCUMENTS', doc.storage_path, 300),
    }))
  );
  res.status(200).json({ documents: withSignedUrls });
});

/** POST /api/admin/verification/:id/approve */
const approve = asyncHandler(async (req, res) => {
  const request = await verificationService.approveVerification(req.params.id, req.user.id);
  res.status(200).json({ request });
});

/** POST /api/admin/verification/:id/reject */
const reject = asyncHandler(async (req, res) => {
  const request = await verificationService.rejectVerification(req.params.id, req.user.id, req.body);
  res.status(200).json({ request });
});

module.exports = { submit, getOwnStatus, listPending, getDocuments, approve, reject };
