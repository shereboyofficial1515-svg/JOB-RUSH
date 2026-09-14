const { randomUUID } = require('crypto');
const { getSupabaseClient } = require('../config/supabase');
const { validateFile } = require('../utils/fileValidation');
const AppError = require('../utils/AppError');

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
};

const LIMITS = {
  image: { allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], maxSizeBytes: 8 * 1024 * 1024 },
  video: { allowedMimeTypes: ['video/mp4'], maxSizeBytes: 100 * 1024 * 1024 },
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
  });

  if (error) {
    throw new AppError('File upload failed. Please try again.', 502, 'STORAGE_UPLOAD_FAILED');
  }

  let publicUrl = null;
  if (bucket.public) {
    const { data } = supabase.storage.from(bucket.name).getPublicUrl(storagePath);
    publicUrl = data?.publicUrl || null;
  }

  return { storagePath, publicUrl, bucket: bucket.name, sizeBytes: buffer.length };
}

async function uploadPortfolioImage(workerUserId, file) {
  return uploadToBucket({
    bucket: BUCKETS.PORTFOLIO_MEDIA,
    ownerUserId: workerUserId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: 'image',
  });
}

async function uploadPortfolioVideo(workerUserId, file) {
  return uploadToBucket({
    bucket: BUCKETS.PORTFOLIO_MEDIA,
    ownerUserId: workerUserId,
    buffer: file.buffer,
    mimeType: file.mimeType,
    limitProfile: 'video',
  });
}

async function uploadProfilePicture(userId, file) {
  return uploadToBucket({
    bucket: BUCKETS.PROFILE_PICTURES,
    ownerUserId: userId,
    buffer: file.buffer,
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

async function deleteObject(bucketKey, storagePath) {
  const bucket = BUCKETS[bucketKey];
  if (!bucket) throw new AppError('Unknown bucket.', 400, 'INVALID_BUCKET');
  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(bucket.name).remove([storagePath]);
  if (error) {
    throw new AppError('Could not delete file.', 502, 'STORAGE_DELETE_FAILED');
  }
}

module.exports = {
  BUCKETS,
  uploadPortfolioImage,
  uploadPortfolioVideo,
  uploadProfilePicture,
  uploadVerificationDocument,
  uploadChatMedia,
  uploadDisputeEvidence,
  getSignedUrl,
  deleteObject,
};
