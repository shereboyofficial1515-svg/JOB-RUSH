/**
 * Minimal User-Agent parser for the "active sessions" settings screen
 * — just enough to show "Chrome on Windows (Desktop)" instead of a raw
 * UA string. Not a replacement for a real UA-parsing library if this
 * ever needs to be more precise; scoped deliberately to what the
 * sessions UI actually needs to display.
 */
function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return { browser: 'Unknown browser', os: 'Unknown OS', deviceType: 'unknown' };
  }
  const ua = userAgent;

  // iPhone/iPad UAs legitimately include "like Mac OS X" as a
  // compatibility string, so the iOS check must run before the
  // macOS one or every iPhone gets misreported as a Mac.
  let os = 'Unknown OS';
  if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown browser';
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = 'Safari';

  let deviceType = 'desktop';
  if (/mobile/i.test(ua) && !/ipad|tablet/i.test(ua)) deviceType = 'mobile';
  else if (/ipad|tablet/i.test(ua)) deviceType = 'tablet';

  return { browser, os, deviceType };
}

module.exports = { parseUserAgent };
