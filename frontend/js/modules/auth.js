/**
 * JOB RUSH — Auth module.
 * Wraps the /api/auth endpoints so pages call Auth.login(...) etc.
 * rather than constructing requests inline.
 */
const Auth = (function () {
  // Where this file was served from, so on-demand modules resolve correctly
  // from any page depth (index.html, pages/*.html).
  const SCRIPT_BASE = (function () {
    try { return document.currentScript.src.replace(/auth\.js(\?.*)?$/, ''); } catch { return ''; }
  })();

  function loadScript(url) {
    return new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = url;
      el.async = false; // downloads in parallel, still EXECUTES in insertion order
      el.onload = resolve;
      el.onerror = resolve; // a failed optional module must never block the page
      document.head.appendChild(el);
    });
  }

  // ---------- Cached session (for an instant app shell) ----------
  // Every page used to wait for GET /auth/me (a session + user lookup, ~1s on
  // the live service) before it could draw the sidebar, bottom nav or header.
  // The last verified user is now kept for the life of the tab (sessionStorage:
  // gone when the tab/app session ends) and used to draw the shell immediately,
  // while the server re-verifies the session in the background. The httpOnly
  // cookie stays the only authority: every API call is still authenticated by
  // it, a 401 from any of them (or from the background check) signs the person
  // out of the UI, and no token is ever stored here.
  const USER_CACHE_KEY = 'jr.user.v1';

  function readCachedUser() {
    try {
      const raw = sessionStorage.getItem(USER_CACHE_KEY);
      const user = raw ? JSON.parse(raw) : null;
      return user && user.id ? user : null;
    } catch { return null; }
  }
  function cacheUser(user) {
    try { sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(user)); } catch { /* storage unavailable */ }
  }
  function clearCachedUser() {
    try { sessionStorage.removeItem(USER_CACHE_KEY); } catch { /* storage unavailable */ }
  }

  // "This tab recently learned the visitor is signed out." Lets public pages
  // draw their header at once instead of waiting a round trip to be told
  // "401" again on every page (that was ~1s of blank header for every
  // anonymous visitor). Short-lived, and never used by pages that REQUIRE a
  // session: those always verify.
  const ANON_KEY = 'jr.anon.v1';
  const ANON_TTL_MS = 5 * 60 * 1000;
  function markAnonymous() { try { sessionStorage.setItem(ANON_KEY, String(Date.now())); } catch { /* ignore */ } }
  function clearAnonymous() { try { sessionStorage.removeItem(ANON_KEY); } catch { /* ignore */ } }
  function recentlyAnonymous() {
    try { return Date.now() - Number(sessionStorage.getItem(ANON_KEY) || 0) < ANON_TTL_MS; } catch { return false; }
  }

  /** Synchronous best guess for drawing a header: the user, null (known signed out), or undefined (not known yet). */
  function peekUser() {
    const cached = readCachedUser();
    if (cached) return cached;
    return recentlyAnonymous() ? null : undefined;
  }

  let verifyPromise = null;
  /**
   * One verification per page load, shared by every caller. Resolves to
   * { status: 'ok', user } | { status: 'anonymous' } | { status: 'unreachable' }.
   * A network failure is NOT "signed out": it keeps whatever is cached.
   */
  function verifySession() {
    if (verifyPromise) return verifyPromise;
    verifyPromise = (async () => {
      const attempts = 3;
      for (let i = 0; i < attempts; i++) {
        try {
          const result = await API.get('/auth/me');
          if (result.user) { cacheUser(result.user); clearAnonymous(); return { status: 'ok', user: result.user }; }
          clearCachedUser();
          markAnonymous();
          return { status: 'anonymous' };
        } catch (err) {
          const isNetworkError = err instanceof API.ApiError && err.status === 0;
          if (!isNetworkError) { clearCachedUser(); markAnonymous(); return { status: 'anonymous' }; }
          if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
        }
      }
      return { status: 'unreachable' };
    })();
    return verifyPromise;
  }

  let redirectingToLogin = false;
  function redirectToLogin(loginHref) {
    if (redirectingToLogin) return;
    redirectingToLogin = true;
    clearCachedUser();
    const href = loginHref || (window.location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html');
    window.location.href = `${href}?returnTo=${encodeURIComponent(window.location.pathname)}`;
  }

  /**
   * Runtime modules every signed-in page gets without each page listing
   * script tags: the connectivity banner everywhere, and — only inside the
   * native app — the native bridge helper, BiometricService and the app
   * lock. On the plain web the native modules are never even downloaded.
   */
  let runtimeReady = null;
  function ensureRuntimeModules() {
    if (runtimeReady) return runtimeReady;
    runtimeReady = (async () => {
      const loads = [];
      if (typeof Connectivity === 'undefined') loads.push(loadScript(`${SCRIPT_BASE}../utils/connectivity.js`));
      if (typeof Realtime === 'undefined') loads.push(loadScript(`${SCRIPT_BASE}realtime.js`));
      if (typeof ShellStatus === 'undefined') loads.push(loadScript(`${SCRIPT_BASE}shellStatus.js`));
      await Promise.all(loads);
      if (typeof Connectivity !== 'undefined') Connectivity.start();

      const cap = window.Capacitor;
      const inApp = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
      if (inApp) {
        // Downloaded in parallel, executed in this order (see loadScript).
        await Promise.all(['native.js', 'biometric.js', 'appLock.js'].map((file) => loadScript(`${SCRIPT_BASE}${file}`)));
      }
    })();
    return runtimeReady;
  }

  async function enforceLock(user) {
    await ensureRuntimeModules();
    if (typeof AppLock !== 'undefined') await AppLock.guard(user);
  }

  // A password login just proved who the user is, so don't immediately
  // ask for a biometric scan on top of it.
  function markFreshLogin() {
    try {
      sessionStorage.setItem('jr.lock.unlocked', '1');
      sessionStorage.removeItem('jr.lock.leftAt');
    } catch { /* storage unavailable */ }
  }

  async function register({ fullName, email, phone, password, role, referralCode }) {
    return API.post('/auth/register', { fullName, email, phone, password, role, referralCode });
  }

  async function requestOtp({ destination, channel, purpose }) {
    return API.post('/auth/otp/request', { destination, channel, purpose });
  }

  async function verifyOtp({ destination, purpose, code }) {
    return API.post('/auth/otp/verify', { destination, purpose, code });
  }

  async function login({ identifier, password }) {
    clearCachedUser(); // never carry a previous account's shell into this one
    const result = await API.post('/auth/login', { identifier, password });
    // A 2FA challenge isn't a completed login yet; only a real session counts.
    if (result && !result.requiresTwoFactor) {
      markFreshLogin();
      if (result.user) { cacheUser(result.user); clearAnonymous(); }
      if (typeof Accessibility !== 'undefined') Accessibility.syncWithServer(true); // this account's appearance settings
    }
    return result;
  }

  async function verifyTwoFactorLogin({ challengeToken, code }) {
    clearCachedUser();
    const result = await API.post('/auth/2fa/verify-login', { challengeToken, code });
    markFreshLogin();
    if (result && result.user) cacheUser(result.user);
    if (typeof Accessibility !== 'undefined') Accessibility.syncWithServer(true);
    return result;
  }

  async function logout() {
    clearCachedUser();
    return API.post('/auth/logout');
  }

  /**
   * Shared logout confirmation, used by every page's logout button
   * instead of logging out immediately on click. Uses the app's own
   * Modal system (never window.confirm — inconsistent styling and
   * blocks the render thread). Redirects regardless of whether the
   * API call itself succeeds — once the person has confirmed they
   * want out, leaving them stranded on an authenticated screen because
   * of a network blip is worse than a client-side-only logout.
   */
  function confirmLogout(redirectTo) {
    Modal.open({
      title: 'Log out?',
      bodyHtml: `
        <p class="text-secondary">Are you sure you want to log out of your JOB RUSH account?</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
          <button type="button" class="btn btn-danger" id="confirm-logout-btn">Log out</button>
        </div>
      `,
      onMount: () => {
        document.getElementById('confirm-logout-btn').addEventListener('click', async () => {
          clearCachedUser();
          document.dispatchEvent(new CustomEvent('jr:auth-logout'));
          try {
            await logout();
          } catch {
            // Best-effort — proceed to redirect below even if this failed.
          } finally {
            window.location.href = redirectTo;
          }
        });
      },
    });
  }

  /**
   * A NETWORK_ERROR (status 0 — request never reached the server: a
   * cold Render dyno waking up, the WebView's network stack not ready
   * yet a beat after app launch, a dropped connection) is not the same
   * fact as "no session." Treating them identically was logging out
   * users with a perfectly valid cookie whenever the first request
   * after opening the app happened to fail transiently. Retry briefly
   * before giving up, and only a real answer from the server (200 with
   * a user, or an actual 401/etc "unauthenticated") is trusted.
   */
  async function getCurrentUser() {
    // Cached user (this tab already verified the session): answer immediately
    // and re-check in the background; a lost session is handled there.
    const cached = readCachedUser();
    if (cached) {
      verifySession().then((result) => {
        if (result.status === 'anonymous') document.dispatchEvent(new CustomEvent('jr:session-lost'));
        else if (result.status === 'ok' && JSON.stringify(result.user) !== JSON.stringify(cached)) {
          document.dispatchEvent(new CustomEvent('jr:user-updated', { detail: { user: result.user } }));
        }
      });
      await enforceLock(cached);
      return cached;
    }

    if (recentlyAnonymous()) {
      // Known signed out a moment ago: answer now; if the background check
      // finds a session after all (signed in from another tab), tell the page.
      verifySession().then((result) => {
        if (result.status === 'ok') document.dispatchEvent(new CustomEvent('jr:user-updated', { detail: { user: result.user } }));
      });
      return null;
    }

    const result = await verifySession();
    if (result.status === 'ok') {
      // Every page learns "who is signed in" through here — including the
      // public homepage and header, which show account state and the
      // notification bell. The biometric app lock therefore applies at
      // this one choke point, so no page can reveal account data while
      // the app is locked. (No-op on the web and for users who haven't
      // opted in.)
      await enforceLock(result.user);
      return result.user;
    }
    // 'anonymous' = a real "not signed in" answer. 'unreachable' = the server
    // could not be reached at all; callers treat both as "no user" for display,
    // but requireSession() distinguishes them before redirecting.
    return null;
  }

  /** The cached user, synchronously (null when this tab has not verified a session yet). Lets a page draw its shell in the same frame it loads. */
  function getCachedUser() {
    return readCachedUser();
  }

  async function requestPasswordReset(email) {
    return API.post('/auth/password/forgot', { email });
  }

  async function resetPassword(token, newPassword) {
    return API.post('/auth/password/reset', { token, newPassword });
  }

  /**
   * Call at the top of any page that requires a signed-in user.
   * Redirects to login (preserving where the person was headed) if
   * there is no active session — never assume the frontend's own
   * idea of "logged in" is authoritative, always re-check with /me.
   */
  // Called only after the session is confirmed and the app lock (if any) has
  // been passed, so no stream or poll starts while the lock screen is up.
  function startRealtimeServices() {
    if (typeof Realtime !== 'undefined') Realtime.start();
    if (typeof ShellStatus !== 'undefined') ShellStatus.start();
  }

  let pageRequiresSession = false;
  async function requireSession(loginPageHref) {
    pageRequiresSession = true;
    const runtime = ensureRuntimeModules(); // loads alongside the session check

    const cached = readCachedUser();
    if (cached) {
      // Instant path: the page can draw its shell and start loading data now.
      // The background check below signs the person out of the UI if the
      // server says the session is gone; it never delays the page.
      verifySession().then((result) => {
        if (result.status === 'anonymous') redirectToLogin(loginPageHref);
        else if (result.status === 'ok' && JSON.stringify(result.user) !== JSON.stringify(cached)) {
          document.dispatchEvent(new CustomEvent('jr:user-updated', { detail: { user: result.user } }));
        }
      });
      await runtime;
      if (typeof AppLock !== 'undefined') await AppLock.guard(cached);
      startRealtimeServices();
      return cached;
    }

    // First page of this tab/session: nothing is cached, so the session
    // genuinely has to be verified before anything is shown.
    const result = await verifySession();
    if (result.status !== 'ok') {
      redirectToLogin(loginPageHref);
      return null;
    }
    await runtime;
    // The biometric lock is applied before page init requests protected data.
    if (typeof AppLock !== 'undefined') await AppLock.guard(result.user);
    startRealtimeServices();
    return result.user;
  }

  // A 401 from any API call: the session is gone. Signs the UI out once --
  // but only on pages that asked for a session (requireSession). Public pages
  // such as the job list or a worker profile also call optional-auth
  // endpoints and must keep working for a signed-out visitor.
  window.addEventListener('jr:session-expired', () => {
    if (pageRequiresSession) redirectToLogin();
  });
  document.addEventListener('jr:session-lost', () => { clearCachedUser(); });

  // Back / Forward can restore a signed-in page from the browser's back-forward cache with the
  // previous screen (names, messages, balances) still in it, even after logging out. A restored
  // page that needs a session but no longer has this tab's cached sign-in is reloaded, which runs
  // the normal check and sends the visitor to the login page instead of showing stale private data.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && pageRequiresSession && !peekUserSafe()) window.location.reload();
  });
  function peekUserSafe() {
    try { return !!sessionStorage.getItem(USER_CACHE_KEY); } catch { return true; }
  }

  return {
    register,
    requestOtp,
    verifyOtp,
    login,
    verifyTwoFactorLogin,
    logout,
    confirmLogout,
    getCurrentUser,
    getCachedUser,
    peekUser,
    requestPasswordReset,
    resetPassword,
    requireSession,
  };
})();