/**
 * Wraps an async route/controller so rejected promises are passed to
 * Express's error-handling middleware instead of crashing the process
 * or hanging the request.
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
