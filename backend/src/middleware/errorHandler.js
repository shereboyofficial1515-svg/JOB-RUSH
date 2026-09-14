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
