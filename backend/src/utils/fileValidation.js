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
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/zip': 'zip',
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

/**
 * Content-based type detection for chat attachments. The client-declared
 * MIME type is NOT trusted: what a file is comes from its bytes, and the
 * route's category (image / voice_note / document) only states what the
 * sender *intends* -- the upload is rejected unless the bytes agree.
 *
 * Returns { mimeType, extension } or throws. For legacy OLE2 containers
 * (.doc and .xls share one signature) the declared MIME is only used to
 * pick between those two labels; both are download-only attachments.
 */
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const startsWith = (buf, sig, offset = 0) => buf.length >= offset + sig.length && sig.every((b, i) => buf[offset + i] === b);
const ascii = (buf, from, to) => buf.slice(from, to).toString('latin1');

function detectKind(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return { kind: 'image', mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'image', mimeType: 'image/png', extension: 'png' };
  if (ascii(buffer, 0, 4) === 'GIF8') return { kind: 'image', mimeType: 'image/gif', extension: 'gif' };
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WEBP') return { kind: 'image', mimeType: 'image/webp', extension: 'webp' };
  if (ascii(buffer, 0, 4) === '%PDF') return { kind: 'document', mimeType: 'application/pdf', extension: 'pdf' };
  if (startsWith(buffer, OLE2)) return { kind: 'ole' };
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const haystack = buffer.toString('latin1');
    if (haystack.includes('word/document.xml')) return { kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', extension: 'docx' };
    if (haystack.includes('xl/workbook.xml')) return { kind: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx' };
    return { kind: 'document', mimeType: 'application/zip', extension: 'zip' };
  }
  if (ascii(buffer, 0, 4) === 'OggS') return { kind: 'audio', mimeType: 'audio/ogg', extension: 'ogg' };
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return { kind: 'audio', mimeType: 'audio/webm', extension: 'webm' };
  // AAC in ADTS framing: 0xFFF1 / 0xFFF9 (layer bits are always 00 there).
  if (buffer[0] === 0xff && (buffer[1] & 0xf6) === 0xf0) return { kind: 'audio', mimeType: 'audio/aac', extension: 'aac' };
  // MPEG audio: an ID3 tag, or an 11-bit frame sync with a layer that is not "reserved".
  if (ascii(buffer, 0, 3) === 'ID3' || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 0x06) !== 0)) {
    return { kind: 'audio', mimeType: 'audio/mpeg', extension: 'mp3' };
  }
  if (ascii(buffer, 0, 4) === 'RIFF' && ascii(buffer, 8, 12) === 'WAVE') return { kind: 'audio', mimeType: 'audio/wav', extension: 'wav' };
  if (ascii(buffer, 4, 8) === 'ftyp') return { kind: 'mp4' };
  return { kind: 'unknown' };
}

const CHAT_CATEGORY_KINDS = {
  image: ['image'],
  voice_note: ['audio', 'mp4'],
  document: ['document', 'ole'],
  video: ['mp4'],
};

function detectChatFile(buffer, category, declaredMime = '') {
  if (!buffer || buffer.length === 0) throw new AppError('The uploaded file is empty.', 400, 'EMPTY_FILE');
  const allowedKinds = CHAT_CATEGORY_KINDS[category];
  if (!allowedKinds) throw new AppError('Invalid chat media category.', 400, 'INVALID_CATEGORY');

  const detected = detectKind(buffer);
  if (!allowedKinds.includes(detected.kind)) {
    throw new AppError('The file content does not match the type of attachment being sent.', 400, 'FILE_SIGNATURE_MISMATCH');
  }

  if (detected.kind === 'ole') {
    const declared = String(declaredMime).split(';')[0].trim().toLowerCase();
    return declared === 'application/vnd.ms-excel'
      ? { mimeType: 'application/vnd.ms-excel', extension: 'xls' }
      : { mimeType: 'application/msword', extension: 'doc' };
  }
  if (detected.kind === 'mp4') {
    return category === 'video'
      ? { mimeType: 'video/mp4', extension: 'mp4' }
      : { mimeType: 'audio/mp4', extension: 'm4a' }; // AAC-in-MP4 voice recording (Android MediaRecorder)
  }
  return { mimeType: detected.mimeType, extension: detected.extension };
}

/** Display-only file name: no path parts, no control characters, bounded length. */
function sanitizeDisplayFileName(name) {
  const base = String(name || '').split(/[\\/]/).pop() || '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]+/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  if (cleaned.length <= 120) return cleaned;
  const dot = cleaned.lastIndexOf('.');
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : '';
  return cleaned.slice(0, 120 - ext.length) + ext;
}

module.exports = { validateFile, detectChatFile, detectKind, sanitizeDisplayFileName };
