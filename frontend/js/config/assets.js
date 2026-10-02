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

  heroProfessionals: 'assets/images/hero-professionals-960.jpg',
};

/**
 * Approved editorial/marketing photography — genuine photographs of
 * real people at work, kept separate from ASSETS above (which holds
 * logos, icons, and the default *user* avatar). These are never a
 * user's profile picture; each entry carries its own alt text and
 * focal point so every page that shows it crops it the same way.
 * Add new licensed photos here, not inline in a page.
 */
const PHOTOS = {
  collaboration: {
    src: 'assets/images/hero-professionals-960.jpg',
    srcset: 'assets/images/hero-professionals-640.jpg 640w, assets/images/hero-professionals-960.jpg 960w',
    width: 960,
    height: 640,
    focus: 'center 30%',
    alt: 'Three professionals working side by side at a table, one typing on a laptop',
  },
  tradesperson: {
    src: 'assets/images/homepage-professional.jpg',
    srcset: 'assets/images/homepage-professional-640.jpg 640w, assets/images/homepage-professional.jpg 1200w',
    width: 1200,
    height: 904,
    focus: 'center 25%',
    alt: 'A Nigerian tradesman in blue work overalls with arms crossed, smiling at the camera',
  },
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
  for (const photo of Object.values(PHOTOS)) {
    photo.src = `../${photo.src}`;
    photo.srcset = photo.srcset.split(', ').map((entry) => `../${entry}`).join(', ');
  }
})();
