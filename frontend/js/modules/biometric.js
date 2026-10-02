/**
 * JOB RUSH — BiometricService.
 *
 * A thin, platform-neutral wrapper over the OS biometric prompt, reached
 * through the @aparajita/capacitor-biometric-auth native plugin (registered
 * on Android as "BiometricAuthNative"; Face ID / Touch ID on iOS if an iOS
 * project is added). The rest of the web app talks only to this service;
 * it never sees Android/iOS specifics.
 *
 * WHAT THIS DOES NOT DO — by design:
 *  - It never reads, stores, or transmits fingerprint/face data. The OS
 *    owns that. All the web layer ever receives is "authenticated" or an
 *    error code.
 *  - It stores exactly one local flag per user: that they opted in to
 *    biometric unlock on this device (localStorage key
 *    `jr.biometric.optin.<userId>` = "1"). No token, no credential.
 *  - A successful scan is NOT proof of authorization to the server. It
 *    only gates whether this app proceeds locally. Every protected
 *    request is still authorised by the server from the httpOnly session
 *    cookie; nothing here is ever sent to the backend.
 *
 * Public API
 *   isSupportedHere()        -> true only inside the native app with the plugin present
 *   getCapabilities(opts)    -> { state, label, ... }  (cached; one native call)
 *   authenticate(opts)       -> { ok } | { ok:false, outcome, message }
 *   isEnabled(userId) / enable(userId) / disable(userId)
 *   confirmSensitive(userId, reason) -> same shape as authenticate; ok:true+skipped when not required
 *
 * Capability states: 'available' | 'not_enrolled' | 'not_supported' |
 *   'locked_out' | 'unavailable' | 'app_update_required' | 'web'
 * Authenticate outcomes: 'cancelled' | 'failed' | 'fallback' | 'locked_out' |
 *   'not_enrolled' | 'unavailable' | 'error'
 */
const BiometricService = (function () {
  const PLUGIN_NAME = 'BiometricAuthNative';
  const OPT_IN_PREFIX = 'jr.biometric.optin.';

  // Plugin BiometryType enum values (see the plugin's definitions.d.ts).
  const TYPE_LABELS = {
    1: 'Touch ID',
    2: 'Face ID',
    3: 'fingerprint',
    4: 'face unlock',
    5: 'iris unlock',
  };

  let capabilitiesPromise = null;
  let inFlight = null;

  function plugin() {
    return typeof Native !== 'undefined' ? Native.plugin(PLUGIN_NAME) : null;
  }

  function isSupportedHere() {
    return typeof Native !== 'undefined' && Native.isNative() && !!plugin();
  }

  function labelFor(info) {
    if (!info) return 'biometrics';
    const types = Array.isArray(info.biometryTypes) && info.biometryTypes.length ? info.biometryTypes : [info.biometryType];
    const labels = [...new Set(types.map((t) => TYPE_LABELS[t]).filter(Boolean))];
    if (labels.length === 0) return 'biometrics';
    if (labels.length === 1) return labels[0];
    return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
  }

  function stateFromInfo(info) {
    if (info.isAvailable) return 'available';
    const code = info.code || '';
    if (code === 'biometryNotEnrolled') return 'not_enrolled';
    if (code === 'biometryLockout') return 'locked_out';
    if (!info.biometryType || (Array.isArray(info.biometryTypes) && info.biometryTypes.length === 0)) return 'not_supported';
    return 'unavailable';
  }

  /**
   * Detects what this device can do. Cached for the page's lifetime (one
   * native round-trip, not one per screen); pass { refresh: true } after
   * returning from the OS settings app or on resume.
   */
  function getCapabilities({ refresh = false } = {}) {
    if (!refresh && capabilitiesPromise) return capabilitiesPromise;
    capabilitiesPromise = (async () => {
      if (typeof Native === 'undefined' || !Native.isNative()) {
        return { state: 'web', label: 'biometrics', isAvailable: false };
      }
      const p = plugin();
      if (!p) {
        // An older build of the app that predates the plugin: the live site
        // updates instantly, the installed app does not.
        return { state: 'app_update_required', label: 'biometrics', isAvailable: false };
      }
      try {
        const info = await p.checkBiometry();
        const state = stateFromInfo(info);
        return {
          state,
          label: labelFor(info),
          isAvailable: state === 'available',
          deviceIsSecure: !!info.deviceIsSecure,
          platform: Native.platform(),
        };
      } catch (err) {
        console.error('[BiometricService] checkBiometry failed', err);
        return { state: 'unavailable', label: 'biometrics', isAvailable: false };
      }
    })();
    return capabilitiesPromise;
  }

  function outcomeFromError(err) {
    const code = err && err.code;
    switch (code) {
      case 'userCancel':
      case 'systemCancel':
      case 'appCancel':
        return 'cancelled';
      case 'userFallback':
        return 'fallback';
      case 'authenticationFailed':
        return 'failed';
      case 'biometryLockout':
        return 'locked_out';
      case 'biometryNotEnrolled':
      case 'passcodeNotSet':
      case 'noDeviceCredential':
        return 'not_enrolled';
      case 'biometryNotAvailable':
        return 'unavailable';
      default:
        return 'error';
    }
  }

  const MESSAGES = {
    cancelled: 'Authentication was cancelled.',
    fallback: 'Authentication was cancelled.',
    failed: 'That didn’t match. Please try again.',
    locked_out: 'Too many attempts. Biometrics are locked for a short while.',
    not_enrolled: 'No fingerprint or face is set up on this device.',
    unavailable: 'Biometric authentication isn’t available right now.',
    error: 'We couldn’t verify you. Please try again.',
  };

  /**
   * Shows the OS biometric prompt. Never throws; resolves with a result.
   * Only one prompt can be on screen — a second call while one is open
   * joins the first instead of stacking a new one.
   *   allowDeviceCredential: let the user fall back to their phone's PIN /
   *   pattern / password inside the same OS prompt.
   */
  function authenticate({ reason = 'Confirm it’s you', title = 'Job Rush', subtitle, allowDeviceCredential = false, cancelTitle = 'Cancel' } = {}) {
    if (inFlight) return inFlight;
    const p = plugin();
    if (!p || !Native.isNative()) {
      return Promise.resolve({ ok: false, outcome: 'unavailable', message: MESSAGES.unavailable });
    }
    inFlight = (async () => {
      try {
        await p.internalAuthenticate({
          reason,
          cancelTitle,
          allowDeviceCredential,
          androidTitle: title,
          androidSubtitle: subtitle || reason,
          iosFallbackTitle: allowDeviceCredential ? undefined : '',
        });
        Native.haptic('success');
        return { ok: true };
      } catch (err) {
        const outcome = outcomeFromError(err);
        if (outcome === 'failed' || outcome === 'locked_out') Native.haptic('error');
        return { ok: false, outcome, message: MESSAGES[outcome] || MESSAGES.error };
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // ---- Local opt-in (a preference, not a secret) ----
  function isEnabled(userId) {
    try { return !!userId && localStorage.getItem(OPT_IN_PREFIX + userId) === '1'; } catch { return false; }
  }
  function setOptIn(userId, on) {
    try {
      if (on) localStorage.setItem(OPT_IN_PREFIX + userId, '1');
      else localStorage.removeItem(OPT_IN_PREFIX + userId);
    } catch { /* storage unavailable: treated as not enabled */ }
  }

  /**
   * Turn biometric login on. Only after the OS has actually authenticated
   * the user right now (strict biometrics, no PIN fallback — proving a real
   * biometric exists and works) is the opt-in flag stored.
   */
  async function enable(userId) {
    const caps = await getCapabilities({ refresh: true });
    if (caps.state !== 'available') return { ok: false, outcome: caps.state, message: capabilityMessage(caps) };
    const result = await authenticate({ reason: `Confirm ${caps.label} to turn on biometric login`, subtitle: 'Turn on biometric login' });
    if (!result.ok) return result;
    setOptIn(userId, true);
    if (typeof AppLock !== 'undefined') AppLock.markUnlocked();
    return { ok: true };
  }

  /**
   * Turn it off. Requires a fresh authentication so someone holding an
   * unlocked phone can't quietly remove the protection — unless the device
   * can no longer authenticate at all (biometrics removed), in which case
   * the user must still be able to turn it off.
   */
  async function disable(userId) {
    const caps = await getCapabilities({ refresh: true });
    if (caps.state === 'available') {
      const result = await authenticate({ reason: 'Confirm to turn off biometric login', subtitle: 'Turn off biometric login', allowDeviceCredential: true });
      if (!result.ok) return result;
    }
    setOptIn(userId, false);
    return { ok: true };
  }

  /**
   * Extra local confirmation before a high-risk financial action (a
   * withdrawal, releasing escrow). Resolves { ok:true, skipped:true } when
   * the user hasn't opted in / isn't in the app — the server's own rules
   * (session, role, balance, review) still apply to every request either way.
   */
  async function confirmSensitive(userId, reason) {
    if (!isSupportedHere() || !isEnabled(userId)) return { ok: true, skipped: true, reason: 'not_required' };
    // allowDeviceCredential also covers the opted-in user who has since
    // removed their biometric: the phone's PIN/pattern is still a real OS check.
    return authenticate({ reason, subtitle: reason, allowDeviceCredential: true });
  }

  function capabilityMessage(caps) {
    switch (caps.state) {
      case 'not_enrolled': return 'Add a fingerprint or face in your phone’s Settings first, then come back.';
      case 'not_supported': return 'This device doesn’t support fingerprint or face unlock.';
      case 'locked_out': return 'Biometrics are temporarily locked on this device. Try again later.';
      case 'app_update_required': return 'Update the Job Rush app to use biometric login.';
      case 'web': return 'Biometric login is available in the Job Rush Android app.';
      default: return 'Biometric authentication isn’t available on this device right now.';
    }
  }

  return { isSupportedHere, getCapabilities, authenticate, isEnabled, enable, disable, confirmSensitive, capabilityMessage };
})();
