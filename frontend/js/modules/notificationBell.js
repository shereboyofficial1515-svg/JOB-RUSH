/**
 * JOB RUSH — Notification bell.
 * Mounted once per page (public header or dashboard topbar) via
 * NotificationBell.render(mountEl). Polls the unread count every 30s
 * so the badge stays roughly current without needing a websocket.
 */
const NotificationBell = (function () {
  let pollTimer = null;

  const TYPE_ICONS = {
    new_message: '\u{1F4AC}',
    application_submitted: '\u{1F4E5}',
    interview_scheduled: '\u{1F4C5}',
    contract_created: '\u{1F4DD}',
    withdrawal_requested: '\u{1F4B0}',
    subscription_renewed: '⭐',
    referral_new_signup: '\u{1F517}',
    referral_qualified: '✅',
    referral_milestone_reached: '\u{1F3C6}',
    referral_reward_approved: '\u{1F4B5}',
    referral_reward_paid: '\u{1F4B5}',
    referred_welcome: '\u{1F44B}',
  };

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function notificationRowHtml(n) {
    const icon = TYPE_ICONS[n.type];
    return `
      <div class="notif-row ${n.read_at ? '' : 'is-unread'}" data-notif-id="${n.id}">
        <div class="notif-row-title">${icon ? `<span class="notif-row-icon" aria-hidden="true">${icon}</span>` : ''}<span>${esc(n.title)}</span></div>
        ${n.body ? `<div class="notif-row-body">${esc(n.body)}</div>` : ''}
        <div class="notif-row-time">${timeAgo(n.created_at)}</div>
      </div>
    `;
  }

  async function loadDropdown(panel) {
    panel.innerHTML = `<div class="notif-empty text-secondary text-sm">Loading…</div>`;
    try {
      const { notifications } = await API.get('/notifications?pageSize=15');
      panel.innerHTML = notifications.length
        ? notifications.map(notificationRowHtml).join('')
        : `<div class="notif-empty text-secondary text-sm">You're all caught up.</div>`;

      if (typeof Animate !== 'undefined') Animate.stagger(panel, { max: 6, stepMs: 30 });

      panel.querySelectorAll('.notif-row.is-unread').forEach((row) => {
        row.addEventListener('click', async () => {
          row.classList.remove('is-unread');
          try {
            await API.post(`/notifications/${row.dataset.notifId}/read`);
            refreshBadge();
          } catch {
            // Non-critical — the row still visually updates even if the write lags.
          }
        }, { once: true });
      });
    } catch (err) {
      panel.innerHTML = `
        <div class="notif-empty text-secondary text-sm">
          <p>${esc(err.message)}</p>
          <button type="button" class="btn btn-ghost btn-sm" id="notif-retry-btn">Retry</button>
        </div>
      `;
      const retryBtn = panel.querySelector('#notif-retry-btn');
      if (retryBtn) retryBtn.addEventListener('click', () => loadDropdown(panel));
    }
  }

  let badgeEl = null;
  let previousUnreadCount = 0;

  async function refreshBadge() {
    if (!badgeEl) return;
    try {
      const { count } = await API.get('/notifications/unread-count');
      badgeEl.textContent = count > 9 ? '9+' : String(count);
      badgeEl.hidden = count === 0;

      // A restrained pop only when the count actually climbed (a new
      // notification arrived) — never on every poll, and never when
      // it's dropping because the user just read something.
      if (count > previousUnreadCount && !badgeEl.hidden) {
        badgeEl.classList.remove('icon-pop');
        void badgeEl.offsetWidth; // restart the animation if it's already mid-play
        badgeEl.classList.add('icon-pop');
      }
      previousUnreadCount = count;
    } catch {
      badgeEl.hidden = true;
    }
  }

  function render(mount) {
    mount.innerHTML = `
      <div class="notif-bell-wrap">
        <button class="notif-bell-btn" id="notif-bell-btn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <span class="notif-badge" id="notif-badge" hidden>0</span>
        </button>
        <div class="notif-dropdown dropdown-panel" id="notif-dropdown" hidden>
          <div class="notif-dropdown-header">
            <strong>Notifications</strong>
            <button class="btn btn-ghost btn-sm" id="notif-mark-all">Mark all read</button>
          </div>
          <div class="notif-dropdown-body" id="notif-dropdown-body"></div>
        </div>
      </div>
    `;

    badgeEl = mount.querySelector('#notif-badge');
    const btn = mount.querySelector('#notif-bell-btn');
    const dropdown = mount.querySelector('#notif-dropdown');
    const body = mount.querySelector('#notif-dropdown-body');

    // The dropdown used to be `position: absolute; right: 0` against
    // its wrapper, with a hardcoded `right: -60px` nudge below 480px.
    // That's only correct when the bell sits flush against the
    // viewport's right edge (true on the public site header, false on
    // the dashboard topbar, where the bell can land anywhere
    // depending on how the row wraps) — anywhere else, a fixed offset
    // pushes a 280-340px panel's left edge past x=0. `position: fixed`
    // with a position computed from the bell's actual, current
    // getBoundingClientRect() is the only way to keep it fully
    // on-screen regardless of where the trigger ends up.
    function positionDropdown() {
      const rect = btn.getBoundingClientRect();
      const margin = 12;
      const panelWidth = Math.min(340, window.innerWidth - margin * 2);
      dropdown.style.width = `${panelWidth}px`;
      let left = rect.right - panelWidth; // default: right-align to the bell
      left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
      dropdown.style.left = `${left}px`;
      const maxTop = window.innerHeight - margin - 120; // leave room for at least a short panel
      dropdown.style.top = `${Math.min(rect.bottom + 8, Math.max(margin, maxTop))}px`;
    }

    // First back-press closes the panel instead of leaving the page —
    // same reasoning as messages.html's conversation view: a plain
    // `hidden = true` has nothing for Android's hardware back button
    // to catch, so it would skip the panel and navigate away instead.
    function openPanel() {
      document.dispatchEvent(new CustomEvent('jr:dropdown-opening', { detail: { mount } }));
      positionDropdown();
      dropdown.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      loadDropdown(body);
      window.history.pushState({ jrNotifOpen: true }, '');
    }

    function closePanel({ fromPopstate = false } = {}) {
      if (dropdown.hidden) return;
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (!fromPopstate && window.history.state?.jrNotifOpen) window.history.back();
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.hidden) openPanel();
      else closePanel();
    });

    document.addEventListener('click', (e) => {
      if (!dropdown.hidden && !mount.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dropdown.hidden) closePanel();
    });

    window.addEventListener('popstate', () => {
      if (!dropdown.hidden) closePanel({ fromPopstate: true });
    });

    window.addEventListener('resize', () => {
      if (!dropdown.hidden) positionDropdown();
    });

    // Opening any other dropdown (the "more actions" menu, a future
    // one) or the mobile nav drawer should close this one, and vice
    // versa — see the matching dispatch in moreMenu.js/sidebarNav.js.
    document.addEventListener('jr:dropdown-opening', (e) => {
      if (e.detail?.mount !== mount) closePanel();
    });
    document.addEventListener('jr:auth-logout', () => closePanel());

    // Android's WebView can restore this page from its back-forward
    // cache on a history navigation without re-running this script —
    // force the panel closed on that restore so it can't come back
    // stuck open from whatever state it was left in.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) closePanel();
    });

    mount.querySelector('#notif-mark-all').addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await API.post('/notifications/read-all');
        body.querySelectorAll('.notif-row').forEach((r) => r.classList.remove('is-unread'));
        refreshBadge();
      } catch (err) {
        Toast.error(err.message);
      }
    });

    refreshBadge();
    clearInterval(pollTimer);
    pollTimer = setInterval(refreshBadge, 30000);
  }

  return { render };
})();
