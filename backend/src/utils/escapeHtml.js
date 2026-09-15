/**
 * Escapes a value for safe interpolation into email HTML. Every
 * dynamic value (names, job titles, message previews, ticket
 * subjects, ...) that reaches an email template must go through this
 * — emails render in mail clients that happily execute injected
 * markup, and unlike the frontend's own sanitize.js this runs
 * server-side where the templates are actually built.
 */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
