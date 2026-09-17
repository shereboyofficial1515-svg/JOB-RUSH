const fs = require('fs/promises');
const storageService = require('../services/storageService');
const videoProcessingService = require('../services/videoProcessingService');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

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

/**
 * POST /api/storage/portfolio/video — worker only.
 *
 * Unlike every other upload here, this one runs the source through
 * videoProcessingService first (probe → compress if needed → verify)
 * before anything reaches Supabase — see that module for the pipeline
 * itself. req.file is a path on local disk (multer's video-specific
 * disk storage, not memoryStorage), and every temp file this handler
 * touches — the uploaded source, and whatever processing produced —
 * is deleted in the finally block whether the request succeeded or
 * failed. The source and the final video are the SAME file when no
 * compression was needed (the fast path in videoProcessingService
 * returns the source path unchanged), so cleanup dedupes by path
 * rather than risking a double-unlink.
 */
const uploadPortfolioVideo = asyncHandler(async (req, res) => {
  const sourcePath = req.file.path;
  const pathsToClean = new Set([sourcePath]);

  try {
    const processed = await videoProcessingService.processVideoForUpload(sourcePath, {
      maxDurationSeconds: storageService.MAX_VIDEO_DURATION_SECONDS,
    });
    pathsToClean.add(processed.videoPath);
    pathsToClean.add(processed.thumbnailPath);

    const [videoUpload, thumbnailUpload] = await Promise.all([
      storageService.uploadProcessedPortfolioVideo(req.user.id, processed.videoPath),
      storageService.uploadPortfolioVideoThumbnail(req.user.id, processed.thumbnailPath),
    ]);

    res.status(201).json({
      storagePath: videoUpload.storagePath,
      publicUrl: videoUpload.publicUrl,
      sizeBytes: videoUpload.sizeBytes,
      thumbnailStoragePath: thumbnailUpload.storagePath,
      thumbnailUrl: thumbnailUpload.publicUrl,
      durationSeconds: processed.metadata.durationSeconds,
      width: processed.metadata.width,
      height: processed.metadata.height,
      wasProcessed: processed.wasProcessed,
    });
  } finally {
    await Promise.all(
      [...pathsToClean].map((p) =>
        fs.unlink(p).catch((err) => {
          if (err.code !== 'ENOENT') logger.error('Failed to clean up video temp file', { path: p, error: err.message });
        })
      )
    );
  }
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
