/**
 * JOB RUSH — Notification bell.
 * Mounted once per page (public header or dashboard topbar) via
 * NotificationBell.render(mountEl). Polls the unread count every 30s
 * so the badge stays roughly current without needing a websocket.
 */
const NotificationBell = (function () {
  let pollTimer = null;

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function notificationRowHtml(n) {
    return `
      <div class="notif-row ${n.read_at ? '' : 'is-unread'}" data-notif-id="${n.id}">
        <div class="notif-row-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-row-body">${esc(n.body)}</div>` : ''}
        <div class="notif-row-time">${timeAgo(n.created_at)}</div>
      </div>
    `;
  }

  async function loadDropdown(panel) {
    panel.innerHTML = `<div class="notif-empty text-secondary text-sm">Loading\u2026</div>`;
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
      panel.innerHTML = `<div class="notif-empty text-secondary text-sm">${err.message}</div>`;
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

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.hidden;
      dropdown.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) loadDropdown(body);
    });

    document.addEventListener('click', (e) => {
      if (!mount.contains(e.target)) {
        dropdown.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
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
