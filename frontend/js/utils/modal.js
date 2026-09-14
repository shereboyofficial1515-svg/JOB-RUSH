/**
 * JOB RUSH — Modal utility.
 * Minimal accessible modal: closes on backdrop click or Escape,
 * returns focus to the trigger on close. Used instead of any native
 * dialog per spec section 72.
 */
const Modal = (function () {
  let activeBackdrop = null;
  let lastFocused = null;

  function open({ title, bodyHtml, onMount }) {
    close(); // only one at a time

    lastFocused = document.activeElement;
    document.body.style.overflow = 'hidden';

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-header">
          <h3 id="modal-title" style="margin-bottom:0;">${title}</h3>
          <button class="modal-close" aria-label="Close" data-action="close-modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    backdrop.querySelector('[data-action="close-modal"]').addEventListener('click', close);

    document.addEventListener('keydown', escHandler);

    document.body.appendChild(backdrop);
    activeBackdrop = backdrop;

    if (onMount) onMount(backdrop.querySelector('.modal'));

    const firstInput = backdrop.querySelector('input, textarea, select, button');
    if (firstInput) firstInput.focus();
  }

  function escHandler(e) {
    if (e.key === 'Escape') close();
  }

  function close() {
    if (!activeBackdrop) return;
    activeBackdrop.remove();
    activeBackdrop = null;
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escHandler);
    if (lastFocused) lastFocused.focus();
  }

  return { open, close };
})();
