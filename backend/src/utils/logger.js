/**
 * Minimal structured logger. Swap the transport for a real logging
 * service (e.g. pino + a log drain) in production, but never log
 * passwords, OTP codes, tokens, or full card/session secrets.
 */
function log(level, message, meta = {}) {
  const entry = { level, message, ...meta, timestamp: new Date().toISOString() };
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : 'log'](JSON.stringify(entry));
}

module.exports = {
  info: (message, meta) => log('info', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  error: (message, meta) => log('error', message, meta),
};
