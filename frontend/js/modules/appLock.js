/**
 * JOB RUSH — App lock (biometric unlock on launch / return).
 *
 * When a signed-in user has opted in (Settings → Account & security →
 * Biometric login), the app asks the OS to authenticate them:
 *   - on a cold start (the app process was gone), and
 *   - on returning after being away longer than LOCK_AFTER_BACKGROUND_MS.
 * Moving between pages inside the app, or briefly switching away, does not
 * re-prompt. The prompt is the OS's own (BiometricService); the screen below
 * is only a branded holder for it, never a fake scan.
 *
 * Security model (also in mobile/BIOMETRICS.md): this is a *local* privacy
 * gate over an already-authenticated session — it keeps someone who picks up
 * an unlocked phone out of the app. The httpOnly session cookie is still the
 * real credential and the server still authorises every request; unlocking
 * here sends nothing to the server. "Use password instead" ends the session
 * and goes to the normal login screen, so biometrics are never the only way
 * back in.
 *
 * Only active inside the native app (Native.isNative()); on the web it does
 * nothing. Loaded on demand by auth.js.
 */
const AppLock = (function () {
  // Tunables live here, not scattered through the code.
  const CONFIG = {
    LOCK_AFTER_BACKGROUND_MS: 60 * 1000, // away for more than a minute -> lock on return
    AUTO_PROMPT_DELAY_MS: 250,           // let the lock screen paint before the OS sheet opens
    EXEMPT_PAGES: ['call-room.html'],    // answering a call must not wait on a scan
  };
  const KEY_UNLOCKED = 'jr.lock.unlocked';
  const KEY_LEFT_AT = 'jr.lock.leftAt';

  let overlay = null;
  let pending = null;
  let currentUser = null;
  let listenersInstalled = false;

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
    remove(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } },
  };

  function markUnlocked() {
    store.set(KEY_UNLOCKED, '1');
    store.remove(KEY_LEFT_AT);
  }

  function clear() {
    store.remove(KEY_UNLOCKED);
    store.remove(KEY_LEFT_AT);
  }

  function isExemptPage() {
    return CONFIG.EXEMPT_PAGES.includes(window.location.pathname.split('/').pop());
  }

  function needsUnlock() {
    if (store.get(KEY_UNLOCKED) !== '1') return true; // cold start
    const leftAt = Number(store.get(KEY_LEFT_AT));
    return !!leftAt && Date.now() - leftAt > CONFIG.LOCK_AFTER_BACKGROUND_MS;
  }

  function loginHref() {
    return window.location.pathname.includes('/pages/') ? 'login.html' : 'pages/login.html';
  }

  // ---------- Lock screen ----------
  const FINGERPRINT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>';
  const FACE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H5a2 2 0 0 0-2 2v2M17 3h2a2 2 0 0 1 2 2v2M7 21H5a2 2 0 0 1-2-2v-2M17 21h2a2 2 0 0 0 2-2v-2"/><path d="M9 9v1.5M15 9v1.5M12 9v4h-1M9 16c1.5 1.3 4.5 1.3 6 0"/></svg>';

  async function usePassword() {
    clear();
    document.dispatchEvent(new CustomEvent('jr:auth-logout'));
    try { await API.post('/auth/logout'); } catch { /* proceed to login regardless */ }
    window.location.href = loginHref();
  }

  function showLock(caps) {
    if (pending) return pending;
    pending = new Promise((resolve) => {
      // Face icon only when face is the only biometric; phones with both (the
      // usual case) show the fingerprint icon, which is also the primary sensor.
      const isFace = /face/i.test(caps.label) && !/fingerprint/i.test(caps.label);
      // "Unlock with fingerprint" / "Use face unlock" — never "Unlock with face unlock".
      const action = caps.label && caps.label !== 'biometrics'
        ? (/unlock/i.test(caps.label) ? `Use ${caps.label}` : `Unlock with ${caps.label}`)
        : 'Unlock with your fingerprint or face';
      overlay = document.createElement('div');
      overlay.className = 'app-lock';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Job Rush is locked');
      overlay.innerHTML = `
        <img src="/assets/images/logo-96.png" alt="" width="72" height="72" />
        <h1>Welcome back</h1>
        <p>Job Rush is locked. ${action} to continue.</p>
        <button type="button" class="app-lock-unlock" id="app-lock-unlock" aria-label="${action}">${isFace ? FACE_ICON : FINGERPRINT_ICON}</button>
        <div class="app-lock-message" id="app-lock-message" role="status" aria-live="polite"></div>
        <button type="button" class="btn-link-light" id="app-lock-password">Use password instead</button>
      `;
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      document.body.appendChild(overlay);

      const unlockBtn = overlay.querySelector('#app-lock-unlock');
      const message = overlay.querySelector('#app-lock-message');
      let attempting = false;

      async function attempt() {
        if (attempting || !overlay) return;
        attempting = true;
        unlockBtn.disabled = true;
        message.textContent = '';
        const result = await BiometricService.authenticate({
          reason: 'Unlock Job Rush',
          subtitle: 'Confirm it’s you to open the app',
          allowDeviceCredential: true,
          cancelTitle: 'Cancel',
        });
        attempting = false;
        unlockBtn.disabled = false;
        if (!overlay) return;
        if (result.ok) {
          markUnlocked();
          overlay.remove();
          overlay = null;
          pending = null;
          document.body.style.overflow = previousOverflow;
          resolve();
          return;
        }
        if (result.outcome === 'cancelled' || result.outcome === 'fallback') {
          message.textContent = 'Unlock cancelled. Tap the button to try again, or use your password.';
        } else if (result.outcome === 'failed') {
          message.textContent = 'That didn’t match. Try again.';
        } else if (result.outcome === 'locked_out') {
          message.textContent = 'Too many attempts. Wait a moment, or use your password.';
        } else if (result.outcome === 'not_enrolled' || result.outcome === 'unavailable') {
          message.textContent = 'Biometric unlock isn’t available right now. Use your password to continue.';
        } else {
          message.textContent = 'We couldn’t verify you. Try again or use your password.';
        }
        unlockBtn.focus();
      }

      unlockBtn.addEventListener('click', attempt);
      overlay.querySelector('#app-lock-password').addEventListener('click', usePassword);
      unlockBtn.focus();
      setTimeout(attempt, CONFIG.AUTO_PROMPT_DELAY_MS);
    });
    return pending;
  }

  // ---------- Background / resume tracking ----------
  function installListeners() {
    if (listenersInstalled) return;
    listenersInstalled = true;
    const stamp = () => store.set(KEY_LEFT_AT, String(Date.now()));
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'hidden') {
        stamp();
        return;
      }
      if (!currentUser || isExemptPage() || !BiometricService.isEnabled(currentUser.id)) return;
      if (needsUnlock()) showLock(await BiometricService.getCapabilities());
    });
    window.addEventListener('pagehide', stamp);
    document.addEventListener('jr:auth-logout', clear);
  }

  /**
   * Called by Auth.requireSession once the session is confirmed. Resolves
   * immediately when no lock applies; otherwise resolves after a successful
   * unlock (the page's own init waits for it, so protected data isn't
   * requested while the screen is locked).
   */
  async function guard(user) {
    if (!user || isExemptPage()) return;
    if (!BiometricService.isSupportedHere() || !BiometricService.isEnabled(user.id)) return;
    currentUser = user;
    installListeners();
    const caps = await BiometricService.getCapabilities();
    // Never lock someone out of a device that can't authenticate at all.
    if (caps.state !== 'available' && !caps.deviceIsSecure) return;
    if (!needsUnlock()) return;
    await showLock(caps);
  }

  return { guard, markUnlocked, clear, CONFIG };
})();
