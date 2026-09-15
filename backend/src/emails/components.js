const branding = require('../config/emailBranding');
const { escapeHtml } = require('../utils/escapeHtml');

const { colors } = branding;

/**
 * JOB RUSH — Email component library.
 * Table-based, fully inline-styled HTML fragments, built to survive
 * Gmail/Outlook/Apple Mail/Yahoo's aggressive CSS stripping. Nothing
 * here depends on JavaScript, external stylesheets, or CSS features
 * those clients drop (flexbox/grid, most animation, custom fonts as
 * a requirement). A <style> block is included in the document wrapper
 * for the handful of clients that do honor it (mobile width tweaks),
 * but every element also carries its own inline styles as the
 * authoritative fallback.
 */

function renderLogo() {
  if (branding.logoUrl) {
    return `<img src="${escapeHtml(branding.logoUrl)}" width="40" height="40" alt="${escapeHtml(branding.brandName)}" style="display:block; border:0; border-radius:8px;" />`;
  }
  // Text placeholder, styled to read as a wordmark — swap in LOGO_URL
  // once a real asset is hosted, no template changes required.
  return `<div style="width:40px; height:40px; border-radius:8px; background:${colors.brandBlue}; color:${colors.white}; font-family:Arial,Helvetica,sans-serif; font-weight:700; font-size:18px; line-height:40px; text-align:center;">${escapeHtml(branding.brandName.charAt(0))}</div>`;
}

function renderHeader() {
  return `
  <tr>
    <td style="padding:28px 32px; border-bottom:1px solid ${colors.border};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="middle" style="width:56px;">${renderLogo()}</td>
          <td valign="middle" style="padding-left:12px;">
            <div style="font-family:Arial,Helvetica,sans-serif; font-size:18px; font-weight:700; color:${colors.primaryNavy};">${escapeHtml(branding.brandName)}</div>
          </td>
          <td valign="middle" align="right">
            <div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${colors.mutedText};">Find Jobs. Build Your Future.</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/**
 * Primary/secondary CTA button. A real <table><a> button, not a bare
 * link styled to look like one — this is the pattern that survives
 * Outlook's Word-based rendering engine.
 */
function renderButton({ label, url, variant = 'primary' }) {
  if (!label || !url) return '';
  const isPrimary = variant === 'primary';
  const bg = isPrimary ? colors.brandBlue : colors.white;
  const border = isPrimary ? colors.brandBlue : colors.border;
  const textColor = isPrimary ? colors.white : colors.brandBlue;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border-radius:8px; border:1px solid ${border};">
        <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block; padding:14px 28px; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:700; color:${textColor}; text-decoration:none; border-radius:8px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

/** Info card: a bordered table of label/value rows (job details, payment details, ...). */
function renderInfoCard({ title, rows }) {
  const validRows = (rows || []).filter((r) => r.value !== undefined && r.value !== null && r.value !== '');
  if (validRows.length === 0) return '';
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.lightBlue}; border-radius:8px; margin:20px 0;">
    <tr>
      <td style="padding:20px 24px;">
        ${title ? `<div style="font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:700; color:${colors.primaryNavy}; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:12px;">${escapeHtml(title)}</div>` : ''}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${validRows
            .map(
              (r, i) => `
          <tr>
            <td style="padding:${i === 0 ? '0' : '10px'} 0 0; font-family:Arial,Helvetica,sans-serif; font-size:13px; color:${colors.mutedText};">${escapeHtml(r.label)}</td>
          </tr>
          <tr>
            <td style="padding:2px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; font-weight:600; color:${colors.text};">${escapeHtml(r.value)}</td>
          </tr>`
            )
            .join('')}
        </table>
      </td>
    </tr>
  </table>`;
}

const STATUS_VARIANTS = {
  success: { bg: colors.successBg, fg: colors.success, dot: colors.success },
  warning: { bg: colors.warningBg, fg: colors.warning, dot: colors.warning },
  error: { bg: colors.errorBg, fg: colors.error, dot: colors.error },
  neutral: { bg: colors.neutralBg, fg: colors.mutedText, dot: colors.mutedText },
};

/** Status pill — text label always included, never color-only (accessibility requirement). */
function renderStatusBadge({ label, variant = 'neutral' }) {
  if (!label) return '';
  const v = STATUS_VARIANTS[variant] || STATUS_VARIANTS.neutral;
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;">
    <tr>
      <td bgcolor="${v.bg}" style="border-radius:999px; padding:6px 14px; font-family:Arial,Helvetica,sans-serif; font-size:13px; font-weight:700; color:${v.fg};">
        &#9679; ${escapeHtml(label)}
      </td>
    </tr>
  </table>`;
}

function renderSecurityNotice(text) {
  if (!text) return '';
  return `<p style="font-family:Arial,Helvetica,sans-serif; font-size:13px; line-height:20px; color:${colors.mutedText}; margin:20px 0 0; padding-top:16px; border-top:1px solid ${colors.border};">${escapeHtml(text)}</p>`;
}

function renderFooter({ showUnsubscribe = true, unsubscribeUrl } = {}) {
  const year = new Date().getFullYear();
  const links = [];
  if (branding.contactUrl) links.push(`<a href="${escapeHtml(branding.contactUrl)}" style="color:${colors.white}; text-decoration:underline;">Contact Us</a>`);
  if (branding.privacyUrl) links.push(`<a href="${escapeHtml(branding.privacyUrl)}" style="color:${colors.white}; text-decoration:underline;">Privacy Policy</a>`);
  if (branding.termsUrl) links.push(`<a href="${escapeHtml(branding.termsUrl)}" style="color:${colors.white}; text-decoration:underline;">Terms of Service</a>`);
  if (showUnsubscribe && unsubscribeUrl) links.push(`<a href="${escapeHtml(unsubscribeUrl)}" style="color:${colors.white}; text-decoration:underline;">Unsubscribe</a>`);

  const socialHtml = branding.socialLinks.length
    ? `<tr><td align="center" style="padding-top:14px;">
        ${branding.socialLinks
          .map(
            (s) =>
              `<a href="${escapeHtml(s.url)}" style="color:${colors.white}; text-decoration:none; font-family:Arial,Helvetica,sans-serif; font-size:12px; margin:0 8px;">${escapeHtml(s.label)}</a>`
          )
          .join('')}
      </td></tr>`
    : '';

  return `
  <tr>
    <td bgcolor="${colors.primaryNavy}" style="padding:28px 32px; border-radius:0 0 12px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td align="center" style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#C4CDD9; line-height:20px;">
            &copy; ${year} ${escapeHtml(branding.companyName)}. All rights reserved.
            ${branding.companyAddress ? `<br/>${escapeHtml(branding.companyAddress)}` : ''}
          </td>
        </tr>
        ${
          links.length
            ? `<tr><td align="center" style="padding-top:12px; font-family:Arial,Helvetica,sans-serif; font-size:12px;">${links.join(
                '&nbsp;&nbsp;|&nbsp;&nbsp;'
              )}</td></tr>`
            : ''
        }
        ${socialHtml}
      </table>
    </td>
  </tr>`;
}

/**
 * The full document wrapper: page background, centered container,
 * hidden preheader span (the gray inbox-preview text before the
 * subject is opened), box-shadow on the container (a progressive
 * enhancement — clients that ignore it just show a flat white card,
 * which still looks intentional).
 */
function wrapEmailDocument({ preheader, bodyHtml, subjectForTitle }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<title>${escapeHtml(subjectForTitle || branding.brandName)}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
  img { -ms-interpolation-mode:bicubic; border:0; }
  body { margin:0; padding:0; width:100%!important; background:${colors.neutralBg}; }
  @media screen and (max-width:640px) {
    .jr-container { width:100%!important; border-radius:0!important; }
    .jr-px { padding-left:20px!important; padding-right:20px!important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:${colors.neutralBg};">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">
    ${escapeHtml(preheader || '')}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${colors.neutralBg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="jr-container" width="680" cellpadding="0" cellspacing="0" border="0" style="width:680px; max-width:680px; background:${colors.white}; border-radius:12px; box-shadow:0 4px 24px rgba(15,39,71,0.10); overflow:hidden;">
          ${bodyHtml}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  colors,
  renderHeader,
  renderButton,
  renderInfoCard,
  renderStatusBadge,
  renderSecurityNotice,
  renderFooter,
  wrapEmailDocument,
};
