const crypto = require('crypto');

/** Cryptographically random URL-safe token (used for session/reset tokens). */
function generateOpaqueToken(bytes = 48) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** SHA-256 hash of a token/code, hex-encoded. We only ever store this. */
function sha256Hex(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Numeric OTP code of the given length, e.g. "384920". */
function generateNumericOtp(length = 6) {
  const max = 10 ** length;
  const n = crypto.randomInt(0, max);
  return n.toString().padStart(length, '0');
}

/** Constant-time string comparison to avoid timing side-channels. */
function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  generateOpaqueToken,
  sha256Hex,
  generateNumericOtp,
  timingSafeEqualStr,
};
