const env = require('../config/env');

/**
 * Single source of truth for everything an email template needs that
 * isn't event-specific content: colors, sender identity, company/
 * legal info, logo, and social links. Templates import this instead
 * of hard-coding any of it, so the whole system can be re-branded
 * (new logo, new domain, new legal URLs) by changing environment
 * variables in one place.
 *
 * Anything not yet configured is an empty string / omitted, never an
 * invented placeholder value (no fake address, no fake social URL) —
 * template components hide a section entirely when its value is
 * empty rather than print "undefined" or a made-up default.
 */
// Matches the live app's actual brand identity (frontend/css/tokens.css:
// --color-primary-navy / --color-primary-gold) rather than an unrelated
// blue palette invented for email only. textOnAccent mirrors the app's
// own --text-on-gold convention: gold is a light color, so text drawn on
// it must be the dark navy, never white.
const COLORS = {
  primaryNavy: '#001020',
  accentGold: '#F0B000',
  textOnAccent: '#001020',
  lightGold: '#FDF6E3',
  text: '#1F2937',
  mutedText: '#667085',
  border: '#E5E7EB',
  white: '#FFFFFF',
  success: '#168A4A',
  successBg: '#E7F6EC',
  warning: '#B7791F',
  warningBg: '#FDF3E3',
  error: '#C62828',
  errorBg: '#FCEAEA',
  neutralBg: '#F3F4F6',
};

function parseFromHeader(raw) {
  // "JOB RUSH <noreply@jobrush.ng>" -> { name: 'JOB RUSH', address: 'noreply@jobrush.ng' }
  const match = /^(.*?)\s*<([^>]+)>$/.exec(raw || '');
  if (match) return { name: match[1].trim(), address: match[2].trim() };
  return { name: '', address: raw || '' };
}

const parsedDefault = parseFromHeader(env.RESEND_FROM_EMAIL);

const FROM_NAME = env.EMAIL_FROM_NAME || parsedDefault.name || env.EMAIL_BRAND_NAME;
const FROM_ADDRESS = env.EMAIL_FROM_ADDRESS || parsedDefault.address;

/** Builds a "Name <address>" header for a given category, falling back to the default sender. */
function senderFor(category) {
  const overrides = {
    security: env.EMAIL_SECURITY_FROM,
    support: env.EMAIL_SUPPORT_FROM,
  };
  const address = overrides[category] || FROM_ADDRESS;
  return address ? `${FROM_NAME} <${address}>` : env.RESEND_FROM_EMAIL;
}

const SOCIAL_LINKS = [
  { key: 'facebook', label: 'Facebook', url: env.SOCIAL_FACEBOOK_URL },
  { key: 'twitter', label: 'Twitter', url: env.SOCIAL_TWITTER_URL },
  { key: 'linkedin', label: 'LinkedIn', url: env.SOCIAL_LINKEDIN_URL },
  { key: 'instagram', label: 'Instagram', url: env.SOCIAL_INSTAGRAM_URL },
].filter((s) => !!s.url);

module.exports = {
  colors: COLORS,
  brandName: env.EMAIL_BRAND_NAME,
  fromName: FROM_NAME,
  fromAddress: FROM_ADDRESS,
  replyTo: env.EMAIL_REPLY_TO || undefined,
  senderFor,
  companyName: env.COMPANY_NAME || env.EMAIL_BRAND_NAME,
  companyAddress: env.COMPANY_ADDRESS,
  logoUrl: env.LOGO_URL,
  appBaseUrl: env.APP_BASE_URL,
  privacyUrl: env.PRIVACY_POLICY_URL,
  termsUrl: env.TERMS_URL,
  contactUrl: env.CONTACT_URL || `${env.APP_BASE_URL}/pages/support.html`,
  socialLinks: SOCIAL_LINKS,
  unsubscribeSecret: env.UNSUBSCRIBE_SECRET || env.SESSION_SECRET,
};
