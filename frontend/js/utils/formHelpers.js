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

  return { showError, clearErrors, setLoading, applyApiValidationErrors };
})();
