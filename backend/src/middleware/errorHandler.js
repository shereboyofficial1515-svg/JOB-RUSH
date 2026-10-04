const logger = require('../utils/logger');

/**
 * Last-resort error handler. `AppError` instances (thrown
 * deliberately for expected conditions) surface their own safe
 * message and status code. Anything else — a DB failure, a bug, an
 * unexpected exception — is logged in full server-side but shown to
 * the client only as a generic message. Stack traces, SQL errors, and
 * internal paths never reach the response body.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.isOperational) {
    return res.status(err.statusCode || 400).json({
      error: err.message,
      code: err.code || 'ERROR',
    });
  }

  // Client mistakes that the body parser / CORS layer raise as plain errors: report them as 4xx
  // (they used to surface as a 500 "Something went wrong", which looks like a server bug).
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'INVALID_JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large.', code: 'PAYLOAD_TOO_LARGE' });
  if (err.message === 'Not allowed by CORS') return res.status(403).json({ error: 'Origin not allowed.', code: 'CORS_FORBIDDEN' });

  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    error: 'Something went wrong. Please try again.',
    code: 'INTERNAL_ERROR',
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
}

module.exports = { errorHandler, notFoundHandler };
