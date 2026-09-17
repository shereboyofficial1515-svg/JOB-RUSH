const multer = require('multer');
const AppError = require('../utils/AppError');

// Memory storage: files are validated (MIME/size/signature) and
// pushed to Supabase Storage — never written to local disk, so
// there's no server-local file to worry about cleaning up or having
// executed.
const storage = multer.memoryStorage();

// Matches the largest limit across upload categories (video, 50MB —
// also Supabase's own project-wide storage ceiling, so nothing bigger
// could ever be stored regardless); storageService enforces the
// tighter, category-specific limits (image/video/document) after this.
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 1 },
});

function singleFile(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return next(new AppError(`Upload error: ${err.message}`, 400, 'UPLOAD_ERROR'));
      }
      if (err) return next(err);
      if (!req.file) {
        return next(new AppError('No file was uploaded.', 400, 'NO_FILE'));
      }
      next();
    });
  };
}

module.exports = { singleFile };
