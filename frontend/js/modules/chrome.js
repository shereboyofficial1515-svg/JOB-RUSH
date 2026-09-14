/**
 * JOB RUSH — Header & footer components.
 * Single source of the site chrome so the logo, nav links, and
 * footer only exist in one place. Pages call Chrome.renderHeader()
 * and Chrome.renderFooter() into a mount element rather than
 * hand-copying this markup.
 */
const Chrome = (function () {
  function isNestedPage() {
    return window.location.pathname.includes('/pages/');
  }

  function homeHref() {
    return isNestedPage() ? '../index.html' : 'index.html';
  }

  function pageHref(name) {
    return isNestedPage() ? `${name}.html` : `pages/${name}.html`;
  }

  /**
   * @param {HTMLElement} mount
   * @param {{ activeLink?: string, user?: { fullName: string, role: string } | null }} opts
   */
  function renderHeader(mount, opts = {}) {
    const { activeLink = '', user = null } = opts;

    const navLinks = [
      { key: 'find-work', label: 'Find Work', href: pageHref('jobs') },
      { key: 'find-talent', label: 'Find Talent', href: pageHref('search') },
      { key: 'pro', label: 'JOB RUSH PRO', href: pageHref('pro') },
      { key: 'how-it-works', label: 'How It Works', href: `${homeHref()}#how-it-works` },
    ];

    const navHtml = navLinks
      .map(
        (link) =>
          `<a href="${link.href}" class="${link.key === activeLink ? 'is-active' : ''}">${link.label}</a>`
      )
      .join('');

    const actionsHtml = user
      ? `<div id="notif-bell-mount"></div>
         <a href="${pageHref('dashboard')}" class="btn btn-secondary btn-sm">Dashboard</a>
         <button class="btn btn-ghost btn-sm" data-action="logout">Log out</button>`
      : `<a href="${pageHref('login')}" class="btn btn-ghost btn-sm">Log in</a>
         <a href="${pageHref('register')}" class="btn btn-primary btn-sm">Get Started</a>`;

    mount.innerHTML = `
      <header class="site-header">
        <div class="container">
          <a href="${homeHref()}" class="brand">
            <img src="${ASSETS.logo96}" alt="JOB RUSH" width="40" height="40" />
            <span>JOB RUSH</span>
          </a>
          <nav class="main-nav" aria-label="Primary">${navHtml}</nav>
          <div class="header-actions">${actionsHtml}</div>
          <button class="nav-toggle" aria-label="Open menu" aria-expanded="false" data-action="toggle-nav">
            <svg class="nav-toggle-icon-open" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            <svg class="nav-toggle-icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" hidden>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </header>
    `;

    const logoutBtn = mount.querySelector('[data-action="logout"]');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => Auth.confirmLogout(homeHref()));
    }

    const toggleBtn = mount.querySelector('[data-action="toggle-nav"]');
    const nav = mount.querySelector('.main-nav');
    if (toggleBtn && nav) {
      const openIcon = toggleBtn.querySelector('.nav-toggle-icon-open');
      const closeIcon = toggleBtn.querySelector('.nav-toggle-icon-close');

      function setNavOpen(isOpen) {
        nav.classList.toggle('is-open', isOpen);
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
        toggleBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        openIcon.hidden = isOpen;
        closeIcon.hidden = !isOpen;
      }

      toggleBtn.addEventListener('click', () => setNavOpen(!nav.classList.contains('is-open')));

      // Navigating via a link should leave the menu closed for
      // whichever page loads next, not visually stuck open.
      nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setNavOpen(false)));
    }

    const notifMount = mount.querySelector('#notif-bell-mount');
    if (notifMount && typeof NotificationBell !== 'undefined') {
      NotificationBell.render(notifMount);
    }
  }

  function renderFooter(mount) {
    mount.innerHTML = `
      <footer class="site-footer">
        <div class="container">
          <div class="footer-grid">
            <div>
              <div class="footer-brand">
                <img src="${ASSETS.logo48}" alt="JOB RUSH" width="36" height="36" />
                <span>JOB RUSH</span>
              </div>
              <p class="text-secondary text-sm">Find the right professional, or get found by the right customer — starting in Delta State.</p>
            </div>
            <div class="footer-col">
              <h4>For Workers</h4>
              <ul>
                <li><a href="${pageHref('jobs')}">Browse jobs</a></li>
                <li><a href="${pageHref('pro')}">JOB RUSH PRO</a></li>
                <li><a href="${pageHref('register')}">Create a profile</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h4>For Hirers</h4>
              <ul>
                <li><a href="${pageHref('search')}">Find professionals</a></li>
                <li><a href="${pageHref('register')}">Post a job</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h4>Company</h4>
              <ul>
                <li><a href="${homeHref()}#how-it-works">How it works</a></li>
                <li><a href="${pageHref('support')}">Support</a></li>
              </ul>
            </div>
          </div>
          <div class="footer-bottom">
            <span>&copy; ${new Date().getFullYear()} JOB RUSH. All rights reserved.</span>
            <span>Delta State, Nigeria</span>
          </div>
        </div>
      </footer>
    `;
  }

  return { renderHeader, renderFooter };
})();