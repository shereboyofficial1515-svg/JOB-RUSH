const AppError = require('./AppError');

/**
 * Minimal magic-byte sniffing so a file's actual content is checked
 * against what it claims to be (MIME type / extension), not just
 * trusted. This is not exhaustive, but it blocks the common trick of
 * renaming an executable/script to a .jpg or .pdf extension.
 */
const SIGNATURES = {
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // 'RIFF'; WEBP marker checked separately below
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'video/mp4': [[0x66, 0x74, 0x79, 0x70]], // 'ftyp' box, checked at offset 4 below
  'application/msword': [[0xd0, 0xcf, 0x11, 0xe0]],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [[0x50, 0x4b, 0x03, 0x04]],
  'audio/mpeg': [
    [0x49, 0x44, 0x33], // ID3
    [0xff, 0xfb],
  ],
};

function matchesSignature(buffer, mimeType) {
  if (mimeType === 'image/webp') {
    return (
      buffer.length > 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mimeType === 'video/mp4') {
    return buffer.length > 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp';
  }

  const candidates = SIGNATURES[mimeType];
  if (!candidates) return true; // no known signature to check — fall back to MIME/extension checks only

  return candidates.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

const EXTENSION_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'video/mp4': 'mp4',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'audio/mpeg': 'mp3',
};

/**
 * Validates an uploaded file against an allowed MIME set and size
 * ceiling, and checks the actual bytes match the claimed type.
 * Returns the safe extension to use for the stored filename — the
 * user-supplied filename/extension is never trusted or reused.
 */
function validateFile({ buffer, mimeType, sizeBytes }, { allowedMimeTypes, maxSizeBytes }) {
  if (!buffer || sizeBytes === 0) {
    throw new AppError('The uploaded file is empty.', 400, 'EMPTY_FILE');
  }
  if (sizeBytes > maxSizeBytes) {
    throw new AppError(
      `File exceeds the maximum allowed size of ${Math.round(maxSizeBytes / (1024 * 1024))}MB.`,
      400,
      'FILE_TOO_LARGE'
    );
  }
  if (!allowedMimeTypes.includes(mimeType)) {
    throw new AppError(
      `File type "${mimeType}" is not allowed here.`,
      400,
      'INVALID_FILE_TYPE'
    );
  }
  if (!matchesSignature(buffer, mimeType)) {
    throw new AppError(
      'The file content does not match its declared type.',
      400,
      'FILE_SIGNATURE_MISMATCH'
    );
  }

  return EXTENSION_BY_MIME[mimeType] || 'bin';
}

module.exports = { validateFile };
