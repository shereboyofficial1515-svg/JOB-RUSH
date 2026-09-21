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

    // The bell (logged-in only) always stays visible in the header row.
    // The buttons move into the mobile nav drawer below 860px (see
    // components.css) instead of squeezing into that row next to the
    // brand and hamburger, which used to wrap the brand text and
    // overlap it with the bell.
    // .mobile-cta stays visible in the collapsed mobile header (see
    // components.css) instead of disappearing into the hamburger drawer
    // entirely — logged-out visitors should see at a glance that they
    // can sign up, not have to open a menu to discover it. Only one
    // button gets this treatment so the header row doesn't wrap/overlap
    // the way it did when both auth buttons sat in the row (see below).
    const authButtonsHtml = user
      ? `<a href="${pageHref('dashboard')}" class="btn btn-secondary btn-sm">Dashboard</a>
         <button class="btn btn-ghost btn-sm" data-action="logout">Log out</button>`
      : `<a href="${pageHref('login')}" class="btn btn-ghost btn-sm">Log in</a>
         <a href="${pageHref('register')}" class="btn btn-primary btn-sm mobile-cta">Sign Up</a>`;

    const themeToggleHtml = `
      <button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Switch to dark mode">
        <svg class="theme-toggle-icon-sun" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <svg class="theme-toggle-icon-moon" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" hidden><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
      </button>`;

    const actionsHtml = themeToggleHtml + (user ? `<div id="notif-bell-mount"></div>` : '') + authButtonsHtml;

    mount.innerHTML = `
      <header class="site-header">
        <div class="container">
          <a href="${homeHref()}" class="brand">
            <img src="${ASSETS.logo96}" alt="JOB RUSH" width="40" height="40" />
            <span>JOB RUSH</span>
          </a>
          <nav class="main-nav" aria-label="Primary">
            ${navHtml}
            <div class="nav-mobile-actions">${authButtonsHtml}</div>
          </nav>
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
      <div class="main-nav-backdrop" data-action="close-nav"></div>
    `;

    // Logout appears twice — once in the header, once duplicated into
    // the mobile nav drawer (see components.css/.nav-mobile-actions) —
    // only one is ever visible at a given viewport width, but both
    // need the click handler.
    mount.querySelectorAll('[data-action="logout"]').forEach((logoutBtn) => {
      logoutBtn.addEventListener('click', () => Auth.confirmLogout(homeHref()));
    });

    const toggleBtn = mount.querySelector('[data-action="toggle-nav"]');
    const nav = mount.querySelector('.main-nav');
    const backdrop = mount.querySelector('.main-nav-backdrop');
    if (toggleBtn && nav) {
      const openIcon = toggleBtn.querySelector('.nav-toggle-icon-open');
      const closeIcon = toggleBtn.querySelector('.nav-toggle-icon-close');

      function setNavOpen(isOpen) {
        nav.classList.toggle('is-open', isOpen);
        if (backdrop) backdrop.classList.toggle('is-open', isOpen);
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
        toggleBtn.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        openIcon.hidden = isOpen;
        closeIcon.hidden = !isOpen;
      }

      toggleBtn.addEventListener('click', () => setNavOpen(!nav.classList.contains('is-open')));
      if (backdrop) backdrop.addEventListener('click', () => setNavOpen(false));

      // Navigating via a link (or tapping Log out) should leave the
      // menu closed rather than visually stuck open — behind whichever
      // page loads next, or behind the logout confirmation modal.
      nav.querySelectorAll('a, button').forEach((el) => el.addEventListener('click', () => setNavOpen(false)));
    }

    const notifMount = mount.querySelector('#notif-bell-mount');
    if (notifMount && typeof NotificationBell !== 'undefined') {
      NotificationBell.render(notifMount);
    }

    const themeToggle = mount.querySelector('[data-action="toggle-theme"]');
    if (themeToggle && typeof Accessibility !== 'undefined') {
      const sunIcon = themeToggle.querySelector('.theme-toggle-icon-sun');
      const moonIcon = themeToggle.querySelector('.theme-toggle-icon-moon');
      const syncIcon = () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        sunIcon.hidden = isDark;
        moonIcon.hidden = !isDark;
        themeToggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
      };
      syncIcon();
      themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        Accessibility.setSiteTheme(isDark ? 'light' : 'dark');
        syncIcon();
      });
      // The OS-level listener in accessibility.js updates data-theme
      // directly on <html> when following "system" — observe it so the
      // icon stays correct without this module needing its own listener.
      new MutationObserver(syncIcon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }

    // Android's WebView (like desktop Chrome) can restore this exact
    // page from its back-forward cache on a history navigation —
    // hardware back, or the on-screen back arrow — without re-running
    // this script. That restores whatever the header looked like the
    // moment the page was left, which goes stale the instant the
    // session changes in between (log out on another page, log in as
    // someone else, a session expiring). `pageshow` fires again on a
    // bfcache restore with `event.persisted === true` — a plain fresh
    // load also fires it, but with `persisted` false, so this only
    // ever does extra work on the restore case, never on a normal
    // load (which already rendered with a correct `user` a moment
    // ago). One listener per mount, not per render, since this
    // function re-renders itself into the same mount below.
    if (!mount.dataset.bfcacheGuard) {
      mount.dataset.bfcacheGuard = 'true';
      window.addEventListener('pageshow', async (event) => {
        if (!event.persisted) return;
        const freshUser = await Auth.getCurrentUser();
        renderHeader(mount, { activeLink, user: freshUser });
      });
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
                <li><a href="${pageHref('documentation')}">Help Center</a></li>
                <li><a href="${pageHref('support')}">Support</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h4>Legal</h4>
              <ul>
                <li><a href="/privacy">Privacy Policy</a></li>
                <li><a href="/terms">Terms of Service</a></li>
                <li><a href="/data-deletion">Data Deletion</a></li>
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