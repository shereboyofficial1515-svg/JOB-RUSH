/**
 * JOB RUSH — shared file-size/mime-type display helpers.
 * Used by both the public worker profile and the owner's Settings CV
 * tab so a CV's real size/type is described the same, consistent way
 * in both places rather than two separate implementations drifting.
 */
const FileFormat = (function () {
  const MIME_LABELS = {
    'application/pdf': 'PDF',
    'application/msword': 'DOC',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WEBP',
    'image/gif': 'GIF',
  };

  function mimeLabel(mimeType) {
    return MIME_LABELS[mimeType] || null;
  }

  function formatFileSize(bytes) {
    if (!bytes) return null;
    const mb = bytes / (1024 * 1024);
    return mb >= 0.1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  return { MIME_LABELS, mimeLabel, formatFileSize };
})();
