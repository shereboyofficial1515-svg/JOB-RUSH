const os = require('os');
const multer = require('multer');
const { randomUUID } = require('crypto');
const AppError = require('../utils/AppError');
const env = require('../config/env');

// Memory storage: files are validated (MIME/size/signature) and
// pushed to Supabase Storage — never written to local disk, so
// there's no server-local file to worry about cleaning up or having
// executed. Still used for every upload category except portfolio
// video (image/document/voice_note, and chat/dispute-evidence media
// including their own video option) — none of those exceed 50MB.
const storage = multer.memoryStorage();

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

// Portfolio video is the one upload category that goes through
// server-side processing (see videoProcessingService), which needs a
// real file path — ffmpeg/ffprobe don't operate on an in-memory
// buffer — and needs to accept a source far larger than the 50MB
// final limit, since a large source is exactly the case that requires
// compression. Written straight to a random filename in the OS temp
// directory; never the client's own filename, which is untrusted
// input. The route handler owns deleting this file once it's done
// with it (see storageController.uploadPortfolioVideo).
const videoDiskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, os.tmpdir()),
  filename: (req, file, cb) => cb(null, `jobrush-video-src-${randomUUID()}.tmp`),
});

const videoUpload = multer({
  storage: videoDiskStorage,
  limits: { fileSize: env.VIDEO_MAX_SOURCE_BYTES, files: 1 },
});

function singleVideoFile(fieldName) {
  return (req, res, next) => {
    videoUpload.single(fieldName)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError(
            `Source video is too large (max ${Math.floor(env.VIDEO_MAX_SOURCE_BYTES / (1024 * 1024))}MB before compression).`,
            400,
            'SOURCE_FILE_TOO_LARGE'
          ));
        }
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

module.exports = { singleFile, singleVideoFile };
