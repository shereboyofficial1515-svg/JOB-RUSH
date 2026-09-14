/**
 * JOB RUSH — HTML sanitization.
 * Every piece of user-controlled data (job titles, names, messages,
 * bios, reviews, cover notes, ticket text, etc.) that gets interpolated
 * into an innerHTML template literal MUST pass through esc() first.
 * Without this, a job title like `<img src=x onerror=alert(document.cookie)>`
 * would execute as real HTML the moment any page renders that job card.
 *
 * This does NOT need to wrap static markup the app itself generates
 * (class names, fixed labels, IDs) — only values that originated from
 * a user (including other users, via the API) and are being placed
 * inside HTML content or attributes.
 */
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
