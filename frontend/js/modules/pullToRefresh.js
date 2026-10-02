/**
 * JOB RUSH — Pull-to-refresh.
 *
 * A real touch gesture: pull down from the very top of the page, see an
 * indicator, release past the threshold, and the page re-fetches its own
 * data through the callback it registered — no window.location.reload(),
 * so the session, open navigation state and any typed-but-unsaved form
 * content survive. A page opts in with PullToRefresh.init({ onRefresh }).
 *
 * Architecture notes:
 *  - The Android app is a Capacitor WebView pointing at the live site and
 *    has no native SwipeRefreshLayout, so this is the only implementation
 *    there (there is nothing to compete with). In mobile Chrome the
 *    browser has its own pull-to-refresh; `overscroll-behavior-y:
 *    contain` (html.ptr-enabled, components.css) turns that off on opted-
 *    in pages so exactly one gesture fires.
 *  - It only arms when the *page* is at the top. If the touch starts
 *    inside anything that scrolls on its own (chat thread, modal, drawer,
 *    notification panel, a textarea, a long dropdown) it stays out of the
 *    way, so pulling there scrolls that element instead of refreshing.
 *  - One refresh at a time; a hung request is cut off after TIMEOUT_MS
 *    and shown as "Couldn't refresh" with a retry rather than spinning
 *    forever. A visually-hidden "Refresh this page" button gives
 *    keyboard / assistive-tech users the same action.
 */
const PullToRefresh = (function () {
  const THRESHOLD = 72;
  const MAX_PULL = 120;
  const DAMPING = 0.5;
  const TIMEOUT_MS = 15000;
  const HOLD_Y = 14; // resting position of the indicator while refreshing

  let onRefresh = null;
  let isEnabled = () => true;
  let refreshing = false;
  let installed = false;

  let indicator = null;
  let iconEl = null;
  let labelEl = null;
  let retryBtn = null;
  let hideTimer = null;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let pulling = false;
  let distance = 0;

  function scrollTop() {
    return (document.scrollingElement || document.documentElement).scrollTop;
  }

  // True when this touch began somewhere a downward drag should scroll or
  // interact with that thing rather than refresh the page.
  function startsInsideOwnScroller(target) {
    if (!(target instanceof Element)) return true;
    if (target.closest('input, textarea, select, [contenteditable="true"], .modal, dialog, .notif-dropdown, .dashboard-sidebar, [data-no-ptr]')) return true;
    for (let el = target; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && el.scrollHeight > el.clientHeight + 1) return true;
    }
    return false;
  }

  function ensureIndicator() {
    if (indicator) return;
    indicator = document.createElement('div');
    indicator.className = 'ptr-indicator';
    indicator.setAttribute('role', 'status');
    indicator.setAttribute('aria-live', 'polite');
    indicator.innerHTML = `<span class="ptr-icon" aria-hidden="true"></span><span class="ptr-label"></span><button type="button" class="btn btn-ghost btn-sm ptr-retry" hidden>Try again</button>`;
    document.body.appendChild(indicator);
    iconEl = indicator.querySelector('.ptr-icon');
    labelEl = indicator.querySelector('.ptr-label');
    retryBtn = indicator.querySelector('.ptr-retry');
    retryBtn.addEventListener('click', () => refresh());
  }

  const REFRESH_ICON = () => (typeof Icons !== 'undefined' && Icons.refresh) || '↻';

  function place(y, { animate = false, opacity = 1 } = {}) {
    indicator.classList.toggle('is-animating', animate);
    indicator.style.transform = `translate(-50%, ${y}px)`;
    indicator.style.opacity = String(opacity);
  }

  function setState(state, text) {
    labelEl.textContent = text;
    indicator.dataset.state = state;
    iconEl.innerHTML = REFRESH_ICON();
    iconEl.classList.toggle('ptr-spin', state === 'refreshing');
    iconEl.style.transform = state === 'pulling' || state === 'ready' ? `rotate(${state === 'ready' ? 180 : Math.min(distance / THRESHOLD, 1) * 180}deg)` : '';
    retryBtn.hidden = state !== 'error';
    indicator.classList.toggle('has-action', state === 'error');
  }

  function hide() {
    clearTimeout(hideTimer);
    if (!indicator) return;
    place(-70, { animate: true, opacity: 0 });
  }

  function withTimeout(promise) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Refresh timed out')), TIMEOUT_MS);
      promise.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
  }

  async function refresh() {
    if (refreshing || !onRefresh) return; // one refresh at a time, however it was triggered
    refreshing = true;
    clearTimeout(hideTimer);
    ensureIndicator();
    setState('refreshing', 'Refreshing…');
    place(HOLD_Y, { animate: true });
    try {
      await withTimeout(Promise.resolve(onRefresh()));
      setState('done', 'Updated');
      hideTimer = setTimeout(hide, 800);
    } catch {
      setState('error', 'Couldn’t refresh');
      place(HOLD_Y, { animate: true });
      hideTimer = setTimeout(hide, 8000);
    } finally {
      refreshing = false;
    }
  }

  function onTouchStart(e) {
    tracking = false;
    pulling = false;
    distance = 0;
    if (!onRefresh || refreshing || e.touches.length !== 1) return;
    if (document.body.style.overflow === 'hidden') return; // modal or drawer is open
    if (scrollTop() > 0) return;
    if (!isEnabled()) return;
    if (startsInsideOwnScroller(e.target)) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    tracking = true;
  }

  function onTouchMove(e) {
    if (!tracking) return;
    const dy = e.touches[0].clientY - startY;
    const dx = e.touches[0].clientX - startX;

    if (!pulling) {
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) { tracking = false; return; } // horizontal swipe
      if (dy < -4) { tracking = false; return; } // scrolling down the page, not pulling
      if (dy < 8) return;
      if (scrollTop() > 0) { tracking = false; return; }
      pulling = true;
      ensureIndicator();
    }

    if (scrollTop() > 0) { pulling = false; tracking = false; hide(); return; }

    if (e.cancelable) e.preventDefault();
    distance = Math.min(MAX_PULL, Math.max(0, dy * DAMPING));
    const ready = distance >= THRESHOLD;
    setState(ready ? 'ready' : 'pulling', ready ? 'Release to refresh' : 'Pull to refresh');
    place(distance - 56, { opacity: Math.min(1, distance / 40) });
  }

  function onTouchEnd() {
    if (!tracking && !pulling) return;
    const shouldRefresh = pulling && distance >= THRESHOLD;
    tracking = false;
    pulling = false;
    if (shouldRefresh) refresh();
    else if (indicator && !refreshing) hide();
    distance = 0;
  }

  function installA11yButton() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ptr-a11y-btn btn btn-secondary btn-sm';
    btn.textContent = 'Refresh this page';
    btn.addEventListener('click', () => refresh());
    document.body.appendChild(btn);
  }

  function init(options) {
    onRefresh = options.onRefresh;
    isEnabled = options.enabled || (() => true);
    if (installed) return;
    installed = true;
    document.documentElement.classList.add('ptr-enabled');
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true });
    installA11yButton();
  }

  // Loaders check this in their catch so a failed refresh throws (and the
  // indicator says so) instead of replacing good on-screen data with an
  // error message.
  return { init, refresh, isRefreshing: () => refreshing };
})();
