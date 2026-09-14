/**
 * JOB RUSH — Centralized asset registry.
 * Every image/icon path in the app is referenced through this object.
 * Replacing an asset means changing a path here, not hunting through
 * every page that uses it.
 */
const ASSETS = {
  logo: 'assets/images/logo.png',
  logo512: 'assets/images/logo-512.png',
  logo256: 'assets/images/logo-256.png',
  logo160: 'assets/images/logo-160.png',
  logo96: 'assets/images/logo-96.png',
  logo48: 'assets/images/logo-48.png',

  favicon32: 'assets/icons/favicon-32.png',
  favicon16: 'assets/icons/favicon-16.png',

  defaultAvatar: 'assets/images/profile-placeholder.svg',
  portfolioPlaceholder: 'assets/images/portfolio-placeholder.svg',
  emptyState: 'assets/images/empty-state.svg',
};

// Pages live one level deep (pages/login.html) but the site root is
// where /assets actually is — this adjusts relative paths so the same
// ASSETS object works from any page without duplicating logic.
(function resolveAssetBase() {
  const isNestedPage = window.location.pathname.includes('/pages/');
  if (!isNestedPage) return;
  for (const key of Object.keys(ASSETS)) {
    ASSETS[key] = `../${ASSETS[key]}`;
  }
})();
