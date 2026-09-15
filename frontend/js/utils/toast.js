/**
 * JOB RUSH — Toast notifications.
 * The spec explicitly bans alert()/confirm()/prompt() from the UI.
 * This is the one place toasts are created; every page calls
 * Toast.show(...) instead of reaching for a native dialog.
 */
const Toast = (function () {
  let region = null;

  function ensureRegion() {
    if (region) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
    return region;
  }

  function show(message, { type = 'info', duration = 4000 } = {}) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    ensureRegion().appendChild(el);

    setTimeout(() => {
      el.classList.add('is-leaving');
      let removed = false;
      const remove = () => {
        if (removed) return;
        removed = true;
        el.remove();
      };
      el.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, 400); // fallback in case animationend never fires
    }, duration);
  }

  return {
    show,
    success: (msg, opts) => show(msg, { ...opts, type: 'success' }),
    error: (msg, opts) => show(msg, { ...opts, type: 'error' }),
  };
})();
