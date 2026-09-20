/**
 * JOB RUSH — Profile picture verification badge.
 * A single reusable component wrapping an avatar <img> with a small
 * status dot attached to its corner, instead of every page building
 * its own badge markup. Driven entirely by real account fields the
 * backend already returns (verification_status, is_pro) — never by
 * anything the frontend can set on its own, so a user cannot fake a
 * badge by editing the page.
 *
 * PRO takes priority when both are true: a PRO account is also
 * typically verified, and showing both dots stacked would be visual
 * noise for no added information the PRO badge doesn't already imply
 * more prominently.
 */
const AvatarBadge = (function () {
  const VERIFIED_SVG = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#07162A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const PRO_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#FFFFFF"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"/></svg>`;

  /**
   * @param {string} imgHtml - a complete <img ...> tag string for the avatar.
   * @param {{ verified?: boolean, isPro?: boolean, size?: 'sm'|'md'|'lg' }} status
   * @returns {string} the avatar wrapped with a positioned status dot, or the plain imgHtml if neither applies.
   */
  function wrap(imgHtml, { verified = false, isPro = false, size = 'md' } = {}) {
    if (!isPro && !verified) return imgHtml;
    const badge = isPro
      ? `<span class="avatar-badge avatar-badge-pro" title="PRO member">${PRO_SVG}</span>`
      : `<span class="avatar-badge avatar-badge-verified" title="Verified">${VERIFIED_SVG}</span>`;
    return `<span class="avatar-badge-wrap avatar-badge-wrap-${size}">${imgHtml}${badge}</span>`;
  }

  return { wrap };
})();
