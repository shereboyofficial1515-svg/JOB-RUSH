const storageService = require('../services/storageService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');

function fileFromRequest(req) {
  return {
    buffer: req.file.buffer,
    mimeType: req.file.mimetype,
    sizeBytes: req.file.size,
  };
}

/** POST /api/storage/portfolio/image — worker only */
const uploadPortfolioImage = asyncHandler(async (req, res) => {
  const result = await storageService.uploadPortfolioImage(req.user.id, fileFromRequest(req));
  res.status(201).json(result);
});

/** POST /api/storage/portfolio/video — worker only */
const uploadPortfolioVideo = asyncHandler(async (req, res) => {
  const result = await storageService.uploadPortfolioVideo(req.user.id, fileFromRequest(req));
  res.status(201).json(result);
});

/** POST /api/storage/profile-picture — worker or hirer */
const uploadProfilePicture = asyncHandler(async (req, res) => {
  const result = await storageService.uploadProfilePicture(req.user.id, fileFromRequest(req));
  res.status(201).json(result);
});

/**
 * POST /api/storage/verification-document — worker only
 * Returns only `storagePath` (private bucket) — no public URL is
 * ever generated for this category.
 */
const uploadVerificationDocument = asyncHandler(async (req, res) => {
  const documentType = req.body?.documentType;
  if (!documentType || typeof documentType !== 'string') {
    throw new AppError('documentType is required.', 400, 'MISSING_DOCUMENT_TYPE');
  }
  const result = await storageService.uploadVerificationDocument(req.user.id, fileFromRequest(req));
  res.status(201).json({ ...result, documentType });
});

/** POST /api/storage/chat/:mediaCategory — any authenticated user, category in {image,video,document,voice_note} */
const uploadChatMedia = asyncHandler(async (req, res) => {
  const category = req.params.mediaCategory;
  if (!['image', 'video', 'document', 'voice_note'].includes(category)) {
    throw new AppError('Invalid chat media category.', 400, 'INVALID_CATEGORY');
  }
  const result = await storageService.uploadChatMedia(req.user.id, fileFromRequest(req), category);
  res.status(201).json(result);
});

/** POST /api/storage/dispute-evidence/:mediaCategory — either party to the dispute */
const uploadDisputeEvidence = asyncHandler(async (req, res) => {
  const category = req.params.mediaCategory;
  if (!['image', 'video', 'document'].includes(category)) {
    throw new AppError('Invalid evidence category.', 400, 'INVALID_CATEGORY');
  }
  const result = await storageService.uploadDisputeEvidence(req.user.id, fileFromRequest(req), category);
  res.status(201).json(result);
});

module.exports = {
  uploadPortfolioImage,
  uploadPortfolioVideo,
  uploadProfilePicture,
  uploadVerificationDocument,
  uploadChatMedia,
  uploadDisputeEvidence,
};
