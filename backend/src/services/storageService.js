const fs = require('fs/promises');
const { randomUUID } = require('crypto');
const { getSupabaseClient } = require('../config/supabase');
const { validateFile } = require('../utils/fileValidation');
const { resizeImage } = require('./imageProcessingService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const MAX_VIDEO_DURATION_SECONDS = 120;

// A profile photo is never displayed larger than ~120px anywhere in
// the app; a portfolio image needs to hold up in a full-page/lightbox
// view, so it keeps a much larger ceiling, plus its own small
// thumbnail (below) for grid/card contexts.
const AVATAR_MAX_DIMENSION_PX = 400;
const PORTFOLIO_IMAGE_MAX_DIMENSION_PX = 1600;
const THUMBNAIL_MAX_DIMENSION_PX = 400;

// Supabase's own project-wide storage limit (Settings > Storage),
// independent of anything this app validates — an upload under our
// own LIMITS below can still be rejected by Supabase itself if it
// exceeds this. Confirmed empirically against the live project: 50MB
// succeeds, 51MB fails with EntityTooLarge/413.
const SUPABASE_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * Bucket policy in one place. `public: true` buckets are readable by
 * anyone with the URL (portfolio media, profile pictures — meant to
 * be shown publicly per spec section 46). `public: false` buckets
 * (verification documents, and later chat media) require a signed
 * URL issued after an ownership/admin check — never a public URL.
 */
const BUCKETS = {
  PORTFOLIO_MEDIA: { name: 'portfolio-media', public: true },
  PROFILE_PICTURES: { name: 'profile-pictures', public: true },
  VERIFICATION_DOCUMENTS: { name: 'verification-documents', public: false },
  CHAT_MEDIA: { name: 'chat-media', public: false },
  DISPUTE_EVIDENCE: { name: 'dispute-evidence', public: false },
  CV_DOCUMENTS: { name: 'cv-documents', public: false },
};

const LIMITS = {
  image: { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxSizeBytes: 8 * 1024 * 1024 },
  // Was 100MB — silently unreachable, since Supabase itself rejects
  // anything over SUPABASE_MAX_UPLOAD_BYTES (50MB) regardless of what
  // we allow here. Capped to match reality so an oversized video is
  // rejected immediately with a clear message instead of failing
  // opaquely after the whole file has already been uploaded to us.
  video: { allowedMimeTypes: ['video/mp4'], maxSizeBytes: SUPABASE_MAX_UPLOAD_BYTES },
  document: {
    allowedMimeTypes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    maxSizeBytes: 15 * 1024 * 1024,
  },
  voice_note: { allowedMimeTypes: ['audio/mpeg'], maxSizeBytes: 10 * 1024 * 1024 },
};

/**
 * Uploads a validated buffer to a bucket under a caller-controlled
 * prefix (always the authenticated user's own ID — never a
 * client-supplied path) with a randomly generated filename. The
 * original filename is discarded entirely; nothing user-supplied
 * ever becomes part of the stored path.
 */
async function uploadToBucket({ bucket, ownerUserId, buffer, mimeType, limitProfile }) {
  const limits = LIMITS[limitProfile];
  if (!limits) throw new AppError('Unsupported upload category.', 400, 'INVALID_UPLOAD_CATEGORY');

  const extension = validateFile({ buffer, mimeType, sizeBytes: buffer.length }, limits);
  const safeFilename = `${randomUUID()}.${extension}`;
  const storagePath = `${ownerUserId}/${safeFilename}`;

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket.name).upload(storagePath, buffer, {
    contentType: mimeType,
    upsert: false,
    // Every object gets a random, never-reused filename and is never
    // overwritten in place (upsert: false) — the content at a given
    // path is permanently immutable, so a year-long cache is always
    // safe and never risks serving stale content after an edit.
    cacheControl: '31536000',
  });

  if (error) {
    logger.error('Supabase Storage upload failed', {
      bucket: bucket.name,
      sizeBytes: buffer.length,
      supabaseError: error.message,
      supabaseStatusCode: error.statusCode,
      supabaseCode: error.code,
    });

    // "Retry" would never help here — Supabase's own project-wide
    // storage limit rejected the object outright, independent of the
    // per-category limits above. Told to the user plainly instead of
    // the generic "please try again" every other storage failure gets.
    if (error.statusCode === '413' || error.code === 'EntityTooLarge') {
      throw new AppError(
        `This file is too large. Please upload a file under ${Math.floor(SUPABASE_MAX_UPLOAD_BYTES / (1024 * 1024))}MB.`,
        400,
        'FILE_TOO_LARGE'
      );
    }
    throw new AppError('File upload failed. Please try again.', 502, 'STORAGE_UPLOAD_FAILED');
  }

  let publicUrl = null;
  if (bucket.public) {
    const { data } = supabase.storage.from(bucket.name).getPublicUrl(storagePath);
    publicUrl = data?.publicUrl || null;
  }

  return { storagePath, publicUrl, bucket: bucket.name, sizeBytes: buffer.length };
}

/**
 * Portfolio photos get two uploads: the image itself capped to a
 * generous "full view" ceiling (still much smaller than a typical
 * unedited phone photo, which is routinely 3000px+), and a small
 * thumbnail for grid/card contexts — reusing the same
 * thumbnail_storage_path column video posters already use, since a
 * portfolio_media row is either a video or an image, never both.
 */
async function uploadPortfolioImage(workerUserId, file) {
  const [mainBuffer, thumbBuffer] = await Promise.all([
    resizeImage(file.buffer, file.mimeType, PORTFOLIO_IMAGE_MAX_DIMENSION_PX),
    resizeImage(file.buffer, file.mimeType, THUMBNAIL_MAX_DIMENSION_PX),
  ]);

  const [main, thumbnail] = await Promise.all([
    uploadToBucket({
      bucket: BUCKETS.PORTFOLIO_MEDIA,
      ownerUserId: workerUserId,
      buffer: mainBuffer,
      mimeType: file.mimeType,
      limitProfile: 'image',
    }),
    uploadToBucket({
      bucket: BUCKETS.PORTFOLIO_MEDIA,
      ownerUserId: workerUserId,
      buffer: thumbBuffer,
      mimeType: file.mimeType,
      limitProfile: 'image',
    }),
  ]);

  return { ...main, thumbnailStoragePath: thumbnail.storagePath, thumbnailUrl: thumbnail.publicUrl };
}

/**
 * Uploads the FINAL processed video produced by videoProcessingService
 * — always a real MP4/H.264 file by this point (verified via ffprobe,
 * either because the source already was one or because it was just
 * transcoded into one), so the mimeType passed to uploadToBucket is
 * always the literal 'video/mp4' this function hands storagePath's
 * validateFile, never whatever the original browser upload claimed.
 * Duration/dimension validation already happened against the real
 * decoded stream in videoProcessingService — this function's job is
 * only to move verified bytes into the bucket.
 */
async function uploadProcessedPortfolioVideo(workerUserId, videoFilePath) {
  const buffer = await fs.readFile(videoFilePath);
  return uploadToBucket({
    bucket: BUCKETS.PORTFOLIO_MEDIA,
    ownerUserId: workerUserId,
    buffer,
    mimeType: 'video/mp4',
    limitProfile: 'video',
  });
}

/** The poster frame generated alongside a processed video — a small JPEG, uploaded to the same public bucket as ordinary portfolio images. */
async function uploadPortfolioVideoThumbnail(workerUserId, thumbnailFilePath) {
  const buffer = await fs.readFile(thumbnailFilePath);
  return uploadToBucket({
    bucket: BUCKETS.PORTFOLIO_MEDIA,
    ownerUserId: workerUserId,
    buffer,
    mimeType: 'image/jpeg',
    limitProfile: 'image',
  });
}

/**
 * A profile photo is never shown larger than ~120px anywhere in the
 * app (messaging, search cards, the profile page itself), so it only
 * needs the one resized version — no separate thumbnail column exists
 * for it, and none is needed at this size.
 */
async function uploadProfilePicture(userId, file) {
  const resized = await resizeImage(file.buffer, file.mimeType, AVATAR_MAX_DIMENSION_PX);
  return uploadToBucket({
    bucket: BUCKETS.PROFILE_PICTURES,
    ownerUserId: userId,
    buffer: resized,
    mimeType: file.mimeType,
    limitProfile: 'image',
  });
}

/**
 * Verification documents go to a private bucket — the returned value
 * intentionally has no publicUrl. Only `storagePath` is handed back,
 * for the caller to pass into verificationService.submitVerification.
 */
async function uploadVerificationDocument(workerUserId, file) {
  const result = await uploadToBucket({
    bucket: BUCKETS.VERIFICATION_DOCUMENTS,
    ownerUserId: workerUserId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: file.mimeType.startsWith('image/') ? 'image' : 'document',
  });
  return { storagePath: result.storagePath, sizeBytes: result.sizeBytes };
}

/**
 * A worker's CV/résumé — private bucket, same access pattern as
 * verification documents (only `storagePath` is returned, never a
 * public URL; access is a signed URL issued after the visibility/
 * ownership check in cvService). Accepts the same document types as
 * verification (PDF/DOC/DOCX) plus images, since a scanned/photographed
 * CV is an explicitly supported upload option.
 */
async function uploadCvDocument(workerUserId, file) {
  const result = await uploadToBucket({
    bucket: BUCKETS.CV_DOCUMENTS,
    ownerUserId: workerUserId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: file.mimeType.startsWith('image/') ? 'image' : 'document',
  });
  return { storagePath: result.storagePath, sizeBytes: result.sizeBytes };
}

/**
 * Chat media (images, video, documents, voice notes) — private
 * bucket, same as verification documents. Only participants in the
 * conversation the message belongs to may ever resolve a signed URL
 * for it (enforced in messageController, not here).
 */
async function uploadChatMedia(userId, file, mediaCategory) {
  const result = await uploadToBucket({
    bucket: BUCKETS.CHAT_MEDIA,
    ownerUserId: userId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: mediaCategory,
  });
  return { storagePath: result.storagePath };
}

/** Dispute evidence — private bucket, same access pattern as chat media/verification docs. */
async function uploadDisputeEvidence(userId, file, mediaCategory) {
  const result = await uploadToBucket({
    bucket: BUCKETS.DISPUTE_EVIDENCE,
    ownerUserId: userId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: mediaCategory,
  });
  return { storagePath: result.storagePath };
}

/**
 * Issues a short-lived signed URL for a private object. Callers MUST
 * have already authorized the request (e.g. requireAdmin) before
 * calling this — this function itself does not check who is asking.
 */
async function getSignedUrl(bucketKey, storagePath, expiresInSeconds = 300) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket || bucket.public) {
    throw new AppError('Signed URLs are only for private buckets.', 400, 'INVALID_BUCKET');
  }
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage
    .from(bucket.name)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data) {
    throw new AppError('Could not generate access link for this file.', 502, 'SIGNED_URL_FAILED');
  }
  return data.signedUrl;
}

/**
 * Public URL for an object in a public bucket, computed the same way
 * `uploadToBucket` computes it at upload time — so callers that only
 * have a stored `storage_path` (e.g. portfolio media loaded back out
 * of the database) can still render a usable URL without re-uploading.
 */
function getPublicUrlForPath(bucketKey, storagePath) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket || !bucket.public) {
    throw new AppError('Public URLs are only for public buckets.', 400, 'INVALID_BUCKET');
  }
  const supabase = getSupabaseClient();
  const { data } = supabase.storage.from(bucket.name).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

async function deleteObject(bucketKey, storagePath) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket) throw new AppError('Unknown bucket.', 400, 'INVALID_BUCKET');
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket.name).remove([storagePath]);
  if (error) {
    throw new AppError('Could not delete file.', 502, 'STORAGE_DELETE_FAILED');
  }
}

/**
 * Removes every file a user has ever uploaded, across every bucket —
 * called on account deletion (both the self-service Settings flow and
 * the Facebook Data Deletion callback). Every upload in this app is
 * written to `<bucket>/<ownerUserId>/<randomFilename>` (see
 * uploadToBucket above), so a user's entire footprint in a bucket is
 * exactly the objects under their own `<userId>/` prefix — this lists
 * and removes by prefix instead of needing to join back through
 * portfolio_media/message_media/verification_documents to find each
 * path individually. Best-effort per bucket: one bucket failing to
 * list/delete doesn't stop the others from being cleaned, and the
 * caller (authService) doesn't let a storage failure block the
 * account-level deletion itself from completing.
 */
async function deleteAllUserFiles(userId) {
  const supabase = getSupabaseClient();

  for (const bucket of Object.values(BUCKETS)) {
    try {
      const { data: files, error: listError } = await supabase.storage.from(bucket.name).list(userId);
      if (listError) {
        logger.error('Could not list user files for deletion', { bucket: bucket.name, userId, error: listError.message });
        continue;
      }
      if (!files || files.length === 0) continue;

      const paths = files.map((f) => `${userId}/${f.name}`);
      const { error: removeError } = await supabase.storage.from(bucket.name).remove(paths);
      if (removeError) {
        logger.error('Could not delete user files', { bucket: bucket.name, userId, count: paths.length, error: removeError.message });
      }
    } catch (err) {
      logger.error('Unexpected error deleting user files from bucket', { bucket: bucket.name, userId, error: err.message });
    }
  }
}

module.exports = {
  BUCKETS,
  MAX_VIDEO_DURATION_SECONDS,
  uploadPortfolioImage,
  uploadProcessedPortfolioVideo,
  uploadPortfolioVideoThumbnail,
  uploadProfilePicture,
  uploadVerificationDocument,
  uploadCvDocument,
  uploadChatMedia,
  uploadDisputeEvidence,
  getSignedUrl,
  getPublicUrlForPath,
  deleteObject,
  deleteAllUserFiles,
};
