/**
 * JOB RUSH — Notification bell.
 * Mounted once per page (public header or dashboard topbar) via
 * NotificationBell.render(mountEl). Polls the unread count every 30s
 * so the badge stays roughly current without needing a websocket.
 */
const NotificationBell = (function () {
  let pollTimer = null;

  // Notification type -> { icon, tone }. One consistent event model: the type decides the icon, the
  // colour and where a tap goes. No emoji: they render differently per device.
  const TYPE_META = {
    new_message: { icon: 'message', tone: 'info' },
    call_missed: { icon: 'phone', tone: 'danger' },
    application_submitted: { icon: 'document', tone: 'info' },
    application_received: { icon: 'document', tone: 'info' },
    application_status_changed: { icon: 'document', tone: 'info' },
    job_invitation: { icon: 'briefcase', tone: 'info' },
    contract_created: { icon: 'document', tone: 'info' },
    review_received: { icon: 'star', tone: 'gold' },
    interview_scheduled: { icon: 'calendar', tone: 'info' },
    interview_response: { icon: 'calendar', tone: 'info' },
    interview_reminder: { icon: 'calendar', tone: 'gold' },
    interview_cancelled: { icon: 'calendar', tone: 'danger' },
    escrow_funded: { icon: 'wallet', tone: 'success' },
    escrow_released: { icon: 'wallet', tone: 'success' },
    withdrawal_requested: { icon: 'wallet', tone: 'info' },
    withdrawal_approved: { icon: 'wallet', tone: 'success' },
    withdrawal_rejected: { icon: 'wallet', tone: 'danger' },
    dispute_opened: { icon: 'shield', tone: 'danger' },
    dispute_resolved: { icon: 'shield', tone: 'info' },
    verification_approved: { icon: 'shield', tone: 'success' },
    verification_rejected: { icon: 'shield', tone: 'danger' },
    subscription_activated: { icon: 'star', tone: 'gold' },
    subscription_renewed: { icon: 'star', tone: 'gold' },
    subscription_expiring: { icon: 'star', tone: 'gold' },
    subscription_expired: { icon: 'star', tone: 'danger' },
    subscription_cancelled: { icon: 'star', tone: 'danger' },
    new_device_login: { icon: 'shield', tone: 'danger' },
    account_deactivated: { icon: 'shield', tone: 'danger' },
    referral_new_signup: { icon: 'link', tone: 'info' },
    referral_qualified: { icon: 'check', tone: 'success' },
    referral_milestone_reached: { icon: 'star', tone: 'gold' },
    referral_reward_approved: { icon: 'wallet', tone: 'success' },
    referral_reward_paid: { icon: 'wallet', tone: 'success' },
    referred_welcome: { icon: 'user', tone: 'info' },
    announcement: { icon: 'bell', tone: 'info' },
  };

  /**
   * Professional timestamps in the person's own timezone: "Just now", "2 min ago", "3 hr ago",
   * "Yesterday", the weekday for the last week, "Oct 3", and "Oct 3, 2026" for another year.
   */
  function timeAgo(dateStr, now = new Date()) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return '';
    const sec = Math.max(0, (now.getTime() - d.getTime()) / 1000);
    if (sec < 60) return 'Just now';
    if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
    const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
    if (dayDiff === 0) return `${Math.floor(sec / 3600)} hr ago`;
    if (dayDiff === 1) return 'Yesterday';
    if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  /** Where tapping a notification goes: the specific conversation, application, interview or wallet, not just the list. */
  function targetFor(n) {
    const d = n.data || {};
    if (d.conversationId) return `/pages/messages.html?conversation=${encodeURIComponent(d.conversationId)}`;
    switch (n.type) {
      case 'application_received': return d.jobId ? `/pages/applicants.html?jobId=${encodeURIComponent(d.jobId)}` : '/pages/applicants.html';
      case 'application_submitted':
      case 'application_status_changed': return '/pages/applications.html';
      case 'job_invitation': return d.jobId ? `/pages/job-detail.html?id=${encodeURIComponent(d.jobId)}` : '/pages/jobs.html';
      case 'interview_scheduled': case 'interview_response': case 'interview_reminder': case 'interview_cancelled': return '/pages/interviews.html';
      case 'contract_created': case 'dispute_opened': case 'dispute_resolved': case 'escrow_funded': return '/pages/contracts.html';
      case 'escrow_released': case 'withdrawal_requested': case 'withdrawal_approved': case 'withdrawal_rejected': return '/pages/wallet.html';
      case 'subscription_activated': case 'subscription_renewed': case 'subscription_expiring': case 'subscription_expired': case 'subscription_cancelled': return '/pages/pro.html';
      case 'verification_approved': case 'verification_rejected': return '/pages/profile-settings.html?tab=profile';
      case 'new_device_login': return '/pages/profile-settings.html?tab=sessions';
      case 'referral_new_signup': case 'referral_qualified': case 'referral_milestone_reached': case 'referral_reward_approved': case 'referral_reward_paid': return '/pages/referral.html';
      default: return null;
    }
  }

  /**
   * Collapses a run of "new message" notifications from the same conversation into one row
   * ("3 new messages"). Calls and everything else are never merged, so a missed call always stays visible.
   */
  function groupNotifications(list) {
    const out = [];
    for (const n of list) {
      const last = out[out.length - 1];
      const convo = n.type === 'new_message' && n.data && n.data.conversationId;
      if (convo && last && last.type === 'new_message' && last.data && last.data.conversationId === convo) {
        last.ids.push(n.id);
        last.count += 1;
        if (!n.read_at) last.read_at = null;
        continue;
      }
      out.push({ ...n, ids: [n.id], count: 1 });
    }
    return out;
  }

  function notificationRowHtml(n) {
    const meta = TYPE_META[n.type] || { icon: 'bell', tone: 'info' };
    const icon = typeof Icons !== 'undefined' && Icons[meta.icon] ? Icons[meta.icon] : '';
    const ids = n.ids || [n.id];
    const grouped = (n.count || 1) > 1;
    const title = grouped ? `${n.count} new messages` : n.title;
    const href = targetFor(n);
    const when = timeAgo(n.created_at);
    return `
      <div class="notif-row notif-tone-${meta.tone} ${n.read_at ? '' : 'is-unread'}" data-notif-id="${ids[0]}" data-notif-ids="${ids.join(',')}" ${href ? `data-href="${esc(href)}" role="link"` : ''} tabindex="0">
        <span class="notif-row-icon" aria-hidden="true">${icon}</span>
        <div class="notif-row-main">
          <div class="notif-row-title"><span>${esc(title)}</span>${n.read_at ? '' : '<span class="notif-dot" role="img" aria-label="Unread"></span>'}</div>
          ${n.body ? `<div class="notif-row-body">${esc(n.body)}</div>` : ''}
          <time class="notif-row-time" datetime="${esc(new Date(n.created_at).toISOString())}" title="${esc(new Date(n.created_at).toLocaleString())}">${esc(when)}</time>
        </div>
      </div>
    `;
  }

  /** Renders a batch (grouped) and returns the HTML. */
  function rowsHtml(list) {
    return groupNotifications(list).map(notificationRowHtml).join('');
  }

  /**
   * Click / Enter on a row: marks it (and every notification merged into it) read, then goes to where it
   * points. Reading a notification never touches a call's state; calls follow the server's call status.
   */
  function wireRows(root, onRead) {
    root.querySelectorAll('.notif-row').forEach((row) => {
      if (row.dataset.wired) return;
      row.dataset.wired = '1';
      const activate = async () => {
        const ids = (row.dataset.notifIds || row.dataset.notifId || '').split(',').filter(Boolean);
        const wasUnread = row.classList.contains('is-unread');
        row.classList.remove('is-unread');
        const dot = row.querySelector('.notif-dot'); if (dot) dot.remove();
        const go = () => { if (row.dataset.href) window.location.href = row.dataset.href; };
        if (!wasUnread) { go(); return; }
        try {
          await Promise.all(ids.map((id) => API.post(`/notifications/${id}/read`)));
          if (onRead) onRead();
        } catch { /* the row already looks read; the next refresh reconciles */ }
        go();
      };
      row.addEventListener('click', activate);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } });
    });
  }

  async function loadDropdown(panel) {
    panel.innerHTML = `<div class="notif-empty text-secondary text-sm">Loading…</div>`;
    try {
      const { notifications } = await API.get('/notifications?pageSize=15');
      panel.innerHTML = notifications.length
        ? rowsHtml(notifications)
        : `<div class="notif-empty text-secondary text-sm">You're all caught up.</div>`;

      if (typeof Animate !== 'undefined') Animate.stagger(panel, { max: 6, stepMs: 30 });
      wireRows(panel, refreshBadge);
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

  function paintBadge(count) {
    if (!badgeEl) return;
    badgeEl.textContent = count > 9 ? '9+' : String(count);
    badgeEl.hidden = count === 0;
    document.dispatchEvent(new CustomEvent('jr:unread-notifications', { detail: { count } }));

    // A restrained pop only when the count actually climbed (a new
    // notification arrived) — never on every poll, and never when
    // it's dropping because the user just read something.
    if (count > previousUnreadCount && !badgeEl.hidden) {
      badgeEl.classList.remove('icon-pop');
      void badgeEl.offsetWidth; // restart the animation if it's already mid-play
      badgeEl.classList.add('icon-pop');
    }
    previousUnreadCount = count;
  }

  // Signed-in app pages share ONE poller for the bell and the Messages badge
  // (ShellStatus). Pages that render a bell without it (the public header)
  // keep this module's own light poll.
  const sharedPoller = () => typeof ShellStatus !== 'undefined' && ShellStatus.isStarted();
  let unsubscribeShared = null;

  async function refreshBadge() {
    if (!badgeEl) return;
    if (sharedPoller()) { ShellStatus.refresh(true); return; }
    try {
      const { count } = await API.get('/notifications/unread-count');
      paintBadge(count);
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
          <a class="notif-dropdown-footer" href="${window.location.pathname.includes('/pages/') ? '' : 'pages/'}notifications.html">View all notifications</a>
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

    if (unsubscribeShared) unsubscribeShared();
    if (sharedPoller()) {
      unsubscribeShared = ShellStatus.subscribe((status) => paintBadge(status.notifications));
    } else {
      refreshBadge();
      clearInterval(pollTimer);
      pollTimer = setInterval(refreshBadge, 30000);
    }
  }

  return { render, refresh: refreshBadge, rowHtml: notificationRowHtml, rowsHtml, wireRows, timeAgo, groupNotifications, targetFor };
})();
