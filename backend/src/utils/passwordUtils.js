const bcrypt = require('bcrypt');
const env = require('../config/env');

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, env.BCRYPT_SALT_ROUNDS);
}

async function verifyPassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Basic strength check. Real-world policy can be tuned, but this
 * enforces a floor server-side regardless of what the frontend does.
 */
function isPasswordStrongEnough(plainPassword) {
  if (typeof plainPassword !== 'string' || plainPassword.length < 8) return false;
  const hasLetter = /[a-zA-Z]/.test(plainPassword);
  const hasNumber = /[0-9]/.test(plainPassword);
  return hasLetter && hasNumber;
}

module.exports = { hashPassword, verifyPassword, isPasswordStrongEnough };
