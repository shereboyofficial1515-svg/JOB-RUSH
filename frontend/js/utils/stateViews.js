/**
 * JOB RUSH — Loading / empty / error state views.
 *
 * One consistent presentation (components.css .state-view) for the three
 * states every data screen has, so pages stop hand-rolling
 * `<p>${err.message}</p>` and so users never see raw technical text
 * ("Failed to fetch", a status code, "Internal server error").
 *
 *   StateView.skeleton(container, { rows: 3 })
 *   StateView.empty(container, { icon, title, message, action: { label, href | onClick } })
 *   StateView.error(container, error, { retry: () => load(), title: 'Unable to load wallet' })
 *   StateView.messageFor(error) -> a short, user-safe sentence
 *
 * Technical detail goes to the console for debugging only.
 */
const StateView = (function () {
  const ICONS = {
    wallet: '<path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2"/><path d="M3 7v11a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3"/><path d="M21 10h-5a2 2 0 0 0 0 4h5z"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>',
    wifiOff: '<path d="M2 8.8a15 15 0 0 1 4-2.3M22 8.8a15 15 0 0 0-8.3-3.7M5 12.9a10 10 0 0 1 5-2.7M19 12.9a10 10 0 0 0-2.4-1.9M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    bank: '<path d="M3 10 12 4l9 6"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function icon(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.inbox}</svg>`;
  }

  function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  /**
   * Maps any error to a sentence safe to show. Messages the server wrote
   * for people (validation, 400/403/404 with a code) pass through; network
   * failures, timeouts and 5xx collapse to a calm generic line.
   */
  function messageFor(err) {
    if (isOffline() || (err && err.status === 0)) return 'Check your internet connection and try again.';
    const status = err && err.status;
    if (status === 429) return 'Too many requests right now. Please wait a moment and try again.';
    if (status && status >= 500) return 'Something went wrong on our side. Please try again in a moment.';
    if (status >= 400 && status < 500 && err.message && !/^(TypeError|Error|AxiosError)/.test(err.message)) return err.message;
    return 'We couldn’t load this right now. Please try again.';
  }

  function skeleton(container, { rows = 3 } = {}) {
    container.innerHTML = Array.from({ length: rows }, () => `
      <div class="skeleton-row" aria-hidden="true">
        <div class="skeleton" style="width:40px; height:40px; flex:none;"></div>
        <div style="flex:1; min-width:0;">
          <div class="skeleton" style="height:14px; width:60%; margin-bottom:8px;"></div>
          <div class="skeleton" style="height:12px; width:35%;"></div>
        </div>
        <div class="skeleton" style="height:14px; width:56px;"></div>
      </div>`).join('') + '<span class="visually-hidden" role="status">Loading…</span>';
  }

  function empty(container, { icon: iconName = 'inbox', title, message, action } = {}) {
    container.innerHTML = `
      <div class="state-view">
        <div class="state-view-icon">${icon(iconName)}</div>
        <h3>${esc(title)}</h3>
        ${message ? `<p>${esc(message)}</p>` : ''}
        ${action ? (action.href
          ? `<a class="btn btn-primary btn-sm" href="${esc(action.href)}">${esc(action.label)}</a>`
          : `<button type="button" class="btn btn-primary btn-sm" data-state-action>${esc(action.label)}</button>`) : ''}
      </div>`;
    const btn = container.querySelector('[data-state-action]');
    if (btn && action && action.onClick) btn.addEventListener('click', action.onClick);
  }

  function error(container, err, { retry, title = 'Unable to load this', compact = false } = {}) {
    if (err) console.error('[JOB RUSH]', err); // technical detail stays in the console
    const offline = isOffline() || (err && err.status === 0);
    container.innerHTML = `
      <div class="state-view state-view--error${compact ? ' state-view--compact' : ''}" role="alert">
        <div class="state-view-icon">${icon(offline ? 'wifiOff' : 'alert')}</div>
        <h3>${esc(offline ? 'You’re offline' : title)}</h3>
        <p>${esc(messageFor(err))}</p>
        ${retry ? '<button type="button" class="btn btn-secondary btn-sm" data-state-retry>Try again</button>' : ''}
      </div>`;
    const btn = container.querySelector('[data-state-retry]');
    if (btn && retry) btn.addEventListener('click', retry);
  }

  return { skeleton, empty, error, messageFor, icon };
})();
