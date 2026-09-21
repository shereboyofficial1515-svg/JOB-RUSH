/**
 * JOB RUSH — Auth module.
 * Wraps the /api/auth endpoints so pages call Auth.login(...) etc.
 * rather than constructing requests inline.
 */
const Auth = (function () {
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
    return API.post('/auth/login', { identifier, password });
  }

  async function verifyTwoFactorLogin({ challengeToken, code }) {
    return API.post('/auth/2fa/verify-login', { challengeToken, code });
  }

  async function logout() {
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
    const attempts = 3;
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await API.get('/auth/me');
        return result.user;
      } catch (err) {
        const isNetworkError = err instanceof API.ApiError && err.status === 0;
        if (!isNetworkError) return null; // a real "unauthenticated" answer from the server
        if (i < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 600 * (i + 1)));
      }
    }
    return null; // exhausted retries — genuinely unreachable, not treated as a false logout by callers
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
  async function requireSession(loginPageHref) {
    const user = await getCurrentUser();
    if (!user) {
      const returnTo = encodeURIComponent(window.location.pathname);
      window.location.href = `${loginPageHref}?returnTo=${returnTo}`;
      return null;
    }
    return user;
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
    requestPasswordReset,
    resetPassword,
    requireSession,
  };
})();