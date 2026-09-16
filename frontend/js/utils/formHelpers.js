/**
 * JOB RUSH — Form helpers.
 * Small shared utilities for inline field errors and button loading
 * states, so every form does this the same way instead of each page
 * reinventing it.
 */
const FormHelpers = (function () {
  function showError(fieldEl, message) {
    fieldEl.classList.add('has-error');
    const errorEl = fieldEl.querySelector('.field-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }
    const input = fieldEl.querySelector('input, select, textarea');
    if (input) input.focus();
  }

  function clearErrors(formEl) {
    formEl.querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    formEl.querySelectorAll('.field-error').forEach((e) => { e.hidden = true; e.textContent = ''; });
  }

  /**
   * Shows a transient success message under a field (e.g. "Copied",
   * "Saved") using the same [hidden]-toggle-triggers-animation trick
   * as showError — see .field-success in animations.css.
   */
  function showSuccess(fieldEl, message, { duration = 2500 } = {}) {
    let successEl = fieldEl.querySelector('.field-success');
    if (!successEl) {
      successEl = document.createElement('div');
      successEl.className = 'field-success';
      successEl.hidden = true;
      fieldEl.appendChild(successEl);
    }
    successEl.textContent = message;
    successEl.hidden = false;
    clearTimeout(successEl._hideTimer);
    successEl._hideTimer = setTimeout(() => { successEl.hidden = true; }, duration);
  }

  /**
   * Adds a show/hide eye-icon button to every password input inside
   * `root` (defaults to the whole document) — every auth screen calls
   * this once on init instead of duplicating the toggle markup.
   *
   * The button is wrapped around the input itself, not just appended
   * into the surrounding .field — .field also contains the <label>
   * and (once shown) a .field-error message, so positioning the
   * button at 50% of .field's own height put it off-center by however
   * tall the label happened to be, and shifted again the moment an
   * error appeared under the input. Anchoring to a wrapper that
   * contains only the input keeps the button centered on the input
   * alone regardless of label length, error state, text-size setting,
   * or viewport width.
   */
  function wirePasswordToggles(root = document) {
    root.querySelectorAll('input[type="password"]').forEach((input) => {
      const field = input.closest('.field');
      if (!field || input.parentElement.classList.contains('password-input-wrap')) return;

      const wrap = document.createElement('div');
      wrap.className = 'password-input-wrap';
      input.replaceWith(wrap);
      wrap.appendChild(input);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle-btn';
      btn.setAttribute('aria-label', 'Show password');
      btn.innerHTML = eyeIcon(false);
      wrap.appendChild(btn);

      btn.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = eyeIcon(!showing);
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      });
    });
  }

  function eyeIcon(open) {
    return open
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function setLoading(buttonEl, isLoading) {
    buttonEl.disabled = isLoading;
    buttonEl.classList.toggle('btn-loading', isLoading);
  }

  /** Maps API validation `details` (field, message pairs) onto matching .field elements by id/name. */
  function applyApiValidationErrors(formEl, details) {
    for (const { field, message } of details || []) {
      const input = formEl.querySelector(`[name="${field}"]`);
      const fieldEl = input?.closest('.field');
      if (fieldEl) showError(fieldEl, message);
    }
  }

  return { showError, showSuccess, clearErrors, setLoading, applyApiValidationErrors, wirePasswordToggles };
})();
