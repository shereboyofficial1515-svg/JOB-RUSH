const { escapeHtml } = require('../utils/escapeHtml');
const {
  colors,
  renderHeader,
  renderButton,
  renderSecurityNotice,
  renderFooter,
  wrapEmailDocument,
} = require('./components');

/**
 * baseEmailTemplate — the one place every JOB RUSH email is composed.
 * Individual templates (see templates.js) build `contentHtml` and
 * hand everything else here; nothing duplicates the header/accent
 * bar/footer HTML per email.
 *
 * The reference design's left-side blue accent bar is implemented as
 * a static colored table cell — email clients have unreliable/absent
 * CSS animation support, so per spec section 3 this never depends on
 * motion to look intentional. It just is a vertical bar, always.
 *
 * @param {object} opts
 * @param {string} opts.subject           Used only as the <title> fallback for preview panes.
 * @param {string} opts.preheader         Inbox preview text — must differ from subject/heading.
 * @param {string} opts.heading           Large heading under the header.
 * @param {string} [opts.greeting]        e.g. "Hello Ada,". Omitted if not given (never "Hello undefined").
 * @param {string} opts.bodyHtml          Pre-built paragraph/section HTML for the main message.
 * @param {string} [opts.statusHtml]      Output of renderStatusBadge(), placed above the heading.
 * @param {string} [opts.infoCardHtml]    Output of renderInfoCard().
 * @param {{label,url}} [opts.primaryAction]
 * @param {{label,url}} [opts.secondaryAction]
 * @param {string} [opts.securityNote]    Small muted text below the actions (expiry/ignore notices).
 * @param {string} [opts.unsubscribeUrl]  Omit entirely for auth/security emails — see templates.js.
 */
function baseEmailTemplate({
  subject,
  preheader,
  heading,
  greeting,
  bodyHtml,
  statusHtml = '',
  infoCardHtml = '',
  primaryAction,
  secondaryAction,
  securityNote,
  unsubscribeUrl,
}) {
  const content = `
  <tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <!-- Static accent bar (see function doc — deliberately not animated) -->
          <td width="6" bgcolor="${colors.accentGold}" style="width:6px; font-size:0; line-height:0;">&nbsp;</td>
          <td class="jr-px" style="padding:32px;">
            ${statusHtml}
            <h1 style="margin:0 0 16px; font-family:Arial,Helvetica,sans-serif; font-size:24px; line-height:32px; font-weight:700; color:${colors.primaryNavy};">${escapeHtml(heading)}</h1>
            ${greeting ? `<p style="margin:0 0 12px; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:${colors.text};">${escapeHtml(greeting)}</p>` : ''}
            <div style="font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:${colors.text};">${bodyHtml}</div>
            ${infoCardHtml}
            ${primaryAction ? renderButton({ ...primaryAction, variant: 'primary' }) : ''}
            ${secondaryAction ? renderButton({ ...secondaryAction, variant: 'secondary' }) : ''}
            ${renderSecurityNotice(securityNote)}
            <p style="margin:24px 0 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:24px; color:${colors.text};">Regards,<br/>The JOB RUSH Team</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;

  const bodyHtmlFull = renderHeader() + content + renderFooter({ unsubscribeUrl, showUnsubscribe: !!unsubscribeUrl });

  return wrapEmailDocument({ preheader, subjectForTitle: subject, bodyHtml: bodyHtmlFull });
}

/**
 * Plain-text counterpart to baseEmailTemplate. Every multipart email
 * Resend sends needs both a text and an HTML body — some clients
 * (and most spam filters) treat HTML-only mail with suspicion, and a
 * text body is the only thing screen readers fall back to if the
 * HTML fails to render at all.
 *
 * `lines` is an array of paragraph strings; falsy entries are
 * dropped, so a template can pass `data.someOptionalField &&
 * 'Field: ' + data.someOptionalField` without ever printing
 * "Field: undefined".
 */
function buildPlainText({ greeting, lines = [], infoLines = [], primaryAction, secondaryText }) {
  const parts = [];
  if (greeting) parts.push(greeting);
  parts.push(...lines.filter(Boolean));
  if (infoLines.filter(Boolean).length) parts.push(infoLines.filter(Boolean).join('\n'));
  if (primaryAction?.label && primaryAction?.url) {
    parts.push(`${primaryAction.label}:\n${primaryAction.url}`);
  }
  if (secondaryText) parts.push(secondaryText);
  parts.push('Regards,\nThe JOB RUSH Team');
  return parts.filter(Boolean).join('\n\n');
}

module.exports = { baseEmailTemplate, buildPlainText };
