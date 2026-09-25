/**
 * JOB RUSH — Dashboard sidebar navigation.
 * One canonical list of nav items, each tagged with which role(s) it
 * applies to — desktop sidebar and the mobile off-canvas drawer both
 * render from this same list (see components.css: the drawer is just
 * this same #sidebar-nav markup repositioned below 900px, not a
 * separate menu), so there is exactly one place that can ever drift
 * out of sync between the two.
 *
 * Previously this was two hardcoded arrays (WORKER_ITEMS/HIRER_ITEMS)
 * with no 'both' case at all — role('worker'|'hirer'|'both') ? HIRER
 * : WORKER meant a 'both' user (real accounts exist in production)
 * silently got the worker list forever, with no way to ever reach My
 * Jobs/Applicants/Contracts & Payments from the sidebar, even though
 * the backend's own requireRole() already treats 'both' as eligible
 * for either role's routes. Fixed by deriving a proper merged list
 * for 'both' from the same source items instead of picking one side.
 */
const SidebarNav = (function () {
  // roles: which account role(s) this item applies to. 'both' means
  // "show for a worker, a hirer, AND a dual-role account" (shared
  // items); a single role means "only for that role" (a dual-role
  // account sees it too, via the merge below).
  const ITEMS = [
    { key: 'overview', label: 'Overview', icon: '▣', href: 'dashboard.html', roles: ['worker', 'hirer', 'both'] },
    { key: 'applications', label: 'My applications', icon: '✉', href: 'applications.html', roles: ['worker'] },
    { key: 'portfolio', label: 'My portfolio', icon: '❖', href: 'portfolio.html', roles: ['worker'] },
    { key: 'my-jobs', label: 'My jobs', icon: '▦', href: 'my-jobs.html', roles: ['hirer'] },
    { key: 'applicants', label: 'Applicants', icon: '◈', href: 'applicants.html', roles: ['hirer'] },
    { key: 'interviews', label: 'Interviews', icon: '◉', href: 'interviews.html', roles: ['worker', 'hirer', 'both'] },
    { key: 'messages', label: 'Messages', icon: '▤', href: 'messages.html', roles: ['worker', 'hirer', 'both'] },
    { key: 'wallet', label: 'Wallet', icon: '₦', href: 'wallet.html', roles: ['worker'] },
    { key: 'contracts', label: 'Contracts & Payments', icon: '◫', href: 'contracts.html', roles: ['hirer'] },
    { key: 'referral', label: 'Referrals', icon: '⊕', href: 'referral.html', roles: ['worker', 'hirer', 'both'] },
    { key: 'pro', label: 'JOB RUSH PRO', icon: '★', href: 'pro.html', roles: ['worker'] },
    { key: 'profile', label: 'Profile', icon: '◆', href: 'profile-settings.html?tab=profile', roles: ['worker', 'hirer', 'both'] },
    { key: 'settings', label: 'Settings', icon: '⚙', href: 'profile-settings.html?tab=account', roles: ['worker', 'hirer', 'both'] },
    { key: 'support', label: 'Support', icon: '❓', href: 'support.html', roles: ['worker', 'hirer', 'both'] },
    { key: 'visit-site', label: 'Visit JOB RUSH site', icon: '↗', href: '../index.html', roles: ['worker', 'hirer', 'both'] },
  ];

  function itemsForRole(role) {
    // A 'both' account gets the UNION of worker-only and hirer-only
    // items (plus the shared ones) -- not just whichever items happen
    // to be explicitly tagged 'both' in ITEMS above. Every item here
    // is tagged 'worker', 'hirer', or all three, so this is
    // deliberately "everything" rather than a third distinct filter
    // value that would need updating every time an item is added.
    if (role === 'both') return ITEMS.slice();
    const effectiveRole = role === 'hirer' ? 'hirer' : 'worker';
    return ITEMS.filter((i) => i.roles.includes(effectiveRole));
  }

  /**
   * @param {{ role: string }} user
   * @param {string} [activeKey] defaults to inferring from the current filename
   */
  function render(user, activeKey) {
    const mount = document.getElementById('sidebar-nav');
    if (!mount) return;

    const items = itemsForRole(user.role);
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
      document.dispatchEvent(new CustomEvent('jr:dropdown-opening', { detail: { mount: sidebar } }));
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

  return { render, itemsForRole };
})();
