/**
 * Thrown deliberately by controllers/services for expected failure
 * cases (bad input, wrong credentials, locked account, etc). The
 * error handler treats these as safe to show `message` for; anything
 * else gets a generic message so raw internals never leak.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

module.exports = AppError;
