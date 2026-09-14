/**
 * JOB RUSH — Dashboard sidebar navigation.
 * One definition of the worker/hirer nav item lists, shared by every
 * dashboard page, so adding a new dashboard page doesn't mean copying
 * this array into yet another <script> block.
 */
const SidebarNav = (function () {
  const WORKER_ITEMS = [
    { key: 'overview', label: 'Overview', icon: '\u25A3', href: 'dashboard.html' },
    { key: 'applications', label: 'My applications', icon: '\u2709', href: 'applications.html' },
    { key: 'portfolio', label: 'My portfolio', icon: '\u2756', href: 'portfolio.html' },
    { key: 'interviews', label: 'Interviews', icon: '\u25C9', href: 'interviews.html' },
    { key: 'messages', label: 'Messages', icon: '\u25A4', href: 'messages.html' },
    { key: 'wallet', label: 'Wallet', icon: '\u20A6', href: 'wallet.html' },
    { key: 'pro', label: 'JOB RUSH PRO', icon: '\u2605', href: 'pro.html' },
    { key: 'settings', label: 'Profile settings', icon: '\u2699', href: 'profile-settings.html' },
    { key: 'security', label: 'Security', icon: '\u{1F512}', href: 'security-settings.html' },
    { key: 'support', label: 'Support', icon: '\u2753', href: 'support.html' },
    { key: 'visit-site', label: 'Visit JOB RUSH site', icon: '\u2197', href: '../index.html' },
  ];

  const HIRER_ITEMS = [
    { key: 'overview', label: 'Overview', icon: '\u25A3', href: 'dashboard.html' },
    { key: 'my-jobs', label: 'My jobs', icon: '\u25A4', href: 'my-jobs.html' },
    { key: 'applicants', label: 'Applicants', icon: '\u2709', href: 'applicants.html' },
    { key: 'interviews', label: 'Interviews', icon: '\u25C9', href: 'interviews.html' },
    { key: 'messages', label: 'Messages', icon: '\u25A4', href: 'messages.html' },
    { key: 'contracts', label: 'Contracts & Payments', icon: '\u20A6', href: 'contracts.html' },
    { key: 'settings', label: 'Profile settings', icon: '\u2699', href: 'profile-settings.html' },
    { key: 'security', label: 'Security', icon: '\u{1F512}', href: 'security-settings.html' },
    { key: 'support', label: 'Support', icon: '\u2753', href: 'support.html' },
    { key: 'visit-site', label: 'Visit JOB RUSH site', icon: '\u2197', href: '../index.html' },
  ];

  /**
   * @param {{ role: string }} user
   * @param {string} [activeKey] defaults to inferring from the current filename
   */
  function render(user, activeKey) {
    const mount = document.getElementById('sidebar-nav');
    if (!mount) return;

    const items = user.role === 'hirer' ? HIRER_ITEMS : WORKER_ITEMS;
    const currentFile = window.location.pathname.split('/').pop();
    const resolvedActive = activeKey || items.find((i) => i.href === currentFile)?.key;

    mount.innerHTML = items
      .map((i) => `<a href="${i.href}" class="${i.key === resolvedActive ? 'is-active' : ''}"><span aria-hidden="true">${i.icon}</span> ${i.label}</a>`)
      .join('');

    setupMobileDrawer();
  }

  /**
   * The dashboard sidebar is a fixed off-canvas drawer below 900px
   * (see components.css) — this injects the hamburger toggle and
   * backdrop once per page load so every dashboard page gets working
   * mobile navigation without each of the ~15 pages duplicating this
   * markup and wiring by hand.
   */
  function setupMobileDrawer() {
    const sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar || document.querySelector('.mobile-nav-toggle')) return; // already set up or no sidebar on this page

    const toggle = document.createElement('button');
    toggle.className = 'mobile-nav-toggle';
    toggle.setAttribute('aria-label', 'Open menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = `
      <svg class="mobile-nav-toggle-icon-open" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      <svg class="mobile-nav-toggle-icon-close" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" hidden><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    `;
    const openIcon = toggle.querySelector('.mobile-nav-toggle-icon-open');
    const closeIcon = toggle.querySelector('.mobile-nav-toggle-icon-close');

    const backdrop = document.createElement('div');
    backdrop.className = 'mobile-nav-backdrop';

    document.body.appendChild(toggle);
    document.body.appendChild(backdrop);

    function closeDrawer() {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Open menu');
      openIcon.hidden = false;
      closeIcon.hidden = true;
      document.body.style.overflow = '';
    }

    function openDrawer() {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close menu');
      openIcon.hidden = true;
      closeIcon.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    toggle.addEventListener('click', () => {
      const isOpen = sidebar.classList.contains('is-open');
      if (isOpen) closeDrawer(); else openDrawer();
    });
    backdrop.addEventListener('click', closeDrawer);

    // Tapping a nav link should close the drawer, not leave it open
    // behind the page the link just navigated to.
    sidebar.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeDrawer));

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  return { render, WORKER_ITEMS, HIRER_ITEMS };
})();