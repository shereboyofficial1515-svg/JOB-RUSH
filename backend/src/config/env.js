/**
 * Centralized environment configuration.
 * Fails fast on boot if required secrets are missing, instead of
 * silently running with an insecure default.
 */
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function requiredInProduction(name, devFallback) {
  if (process.env.NODE_ENV === 'production') {
    return required(name);
  }
  return process.env[name] || devFallback;
}

const env = {
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '4000'), 10),
  APP_BASE_URL: optional('APP_BASE_URL', 'http://localhost:4000'),
  COOKIE_DOMAIN: optional('COOKIE_DOMAIN', 'localhost'),

  DATABASE_URL: requiredInProduction('DATABASE_URL', process.env.DATABASE_URL),

  SESSION_SECRET: requiredInProduction('SESSION_SECRET', 'dev-only-insecure-secret-change-me'),
  SESSION_COOKIE_NAME: optional('SESSION_COOKIE_NAME', 'jr_session'),
  SESSION_TTL_MINUTES: parseInt(optional('SESSION_TTL_MINUTES', '43200'), 10),
  BCRYPT_SALT_ROUNDS: parseInt(optional('BCRYPT_SALT_ROUNDS', '12'), 10),

  OTP_LENGTH: parseInt(optional('OTP_LENGTH', '6'), 10),
  OTP_TTL_MINUTES: parseInt(optional('OTP_TTL_MINUTES', '10'), 10),
  OTP_MAX_ATTEMPTS: parseInt(optional('OTP_MAX_ATTEMPTS', '5'), 10),
  OTP_RESEND_COOLDOWN_SECONDS: parseInt(optional('OTP_RESEND_COOLDOWN_SECONDS', '60'), 10),

  RESEND_API_KEY: optional('RESEND_API_KEY', ''),
  RESEND_FROM_EMAIL: optional('RESEND_FROM_EMAIL', 'JOB RUSH <noreply@jobrush.ng>'),

  TERMII_API_KEY: optional('TERMII_API_KEY', ''),
  TERMII_SENDER_ID: optional('TERMII_SENDER_ID', 'JobRush'),
  TERMII_BASE_URL: optional('TERMII_BASE_URL', 'https://api.ng.termii.com'),

  LOGIN_RATE_LIMIT_WINDOW_MINUTES: parseInt(optional('LOGIN_RATE_LIMIT_WINDOW_MINUTES', '15'), 10),
  LOGIN_RATE_LIMIT_MAX_ATTEMPTS: parseInt(optional('LOGIN_RATE_LIMIT_MAX_ATTEMPTS', '8'), 10),
  ACCOUNT_LOCKOUT_THRESHOLD: parseInt(optional('ACCOUNT_LOCKOUT_THRESHOLD', '6'), 10),
  ACCOUNT_LOCKOUT_MINUTES: parseInt(optional('ACCOUNT_LOCKOUT_MINUTES', '30'), 10),

  SUPABASE_URL: optional('SUPABASE_URL', ''),
  SUPABASE_SERVICE_ROLE_KEY: optional('SUPABASE_SERVICE_ROLE_KEY', ''),

  LIVEKIT_API_KEY: optional('LIVEKIT_API_KEY', ''),
  LIVEKIT_API_SECRET: optional('LIVEKIT_API_SECRET', ''),
  LIVEKIT_URL: optional('LIVEKIT_URL', ''),

  PAYSTACK_SECRET_KEY: optional('PAYSTACK_SECRET_KEY', ''),
  PAYSTACK_PUBLIC_KEY: optional('PAYSTACK_PUBLIC_KEY', ''),
  PAYSTACK_PRO_PLAN_CODE: optional('PAYSTACK_PRO_PLAN_CODE', ''),
  PRO_MONTHLY_PRICE_NGN: parseInt(optional('PRO_MONTHLY_PRICE_NGN', '4000'), 10),

  GOOGLE_CLIENT_ID: optional('GOOGLE_CLIENT_ID', ''),
  GOOGLE_CLIENT_SECRET: optional('GOOGLE_CLIENT_SECRET', ''),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI', ''),

  GEMINI_API_KEY: optional('GEMINI_API_KEY', ''),
  GEMINI_MODEL: optional('GEMINI_MODEL', 'gemini-1.5-flash'),
};

if (env.NODE_ENV === 'production' && env.SESSION_SECRET.startsWith('dev-only')) {
  throw new Error('SESSION_SECRET must be set to a strong random value in production.');
}

module.exports = env;
