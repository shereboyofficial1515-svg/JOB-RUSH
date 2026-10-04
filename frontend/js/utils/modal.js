/**
 * JOB RUSH — Modal utility (the one modal implementation in the app).
 *
 * Presentation adapts to the screen: a centred dialog on desktop, a
 * bottom sheet on phones (variant 'auto', the default). Every modal gets
 * the same structure, focus trap, Escape / Android-back handling and
 * scroll restore, so callers only supply content.
 *
 *   Modal.open({
 *     title, bodyHtml, onMount(modalEl), onClose,
 *     variant: 'auto' | 'sheet' | 'dialog',   // 'sheet' is bottom sheet on phones, dialog on desktop
 *     dismissOnBackdrop: true,   // set false for forms and financial / destructive steps:
 *                                // then a stray tap outside or Escape can't throw away input
 *                                // or cancel a confirmation (X, Cancel and Back still can)
 *     initialFocus: '#selector', // defaults to the first field in the body
 *     footerHtml,                // optional action row pinned under the scrolling body, so
 *                                // Save / Continue buttons are always on screen however long the body is
 *   })
 *   Modal.confirm({ title, message, confirmLabel, cancelLabel, danger }) -> Promise<boolean>
 *
 * Android's hardware back button (and browser Back) closes the topmost
 * modal instead of navigating away from the page behind it.
 */
const Modal = (function () {
  let activeBackdrop = null;
  let lastFocused = null;
  let activeOnClose = null;
  let dismissOnBackdrop = true;
  let historyPushed = false;
  let ignoreNextPop = false;

  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function prefersSheet() {
    return window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
  }

  function open({ title, bodyHtml, onMount, onClose, variant = 'auto', dismissOnBackdrop: dismissible = true, initialFocus, footerHtml }) {
    // Opening a modal while another is open replaces it rather than
    // stacking a second backdrop; the browser-history entry is reused.
    if (activeBackdrop) closeNow({ keepHistory: true });

    activeOnClose = onClose || null;
    dismissOnBackdrop = dismissible;
    lastFocused = document.activeElement;
    ScrollLock.acquire('modal');

    const asSheet = variant !== 'dialog' && prefersSheet();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop' + (asSheet ? ' modal-backdrop--sheet' : '');
    backdrop.innerHTML = `
      <div class="modal${asSheet ? ' modal--sheet' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
        ${asSheet ? '<div class="modal-handle" aria-hidden="true"></div>' : ''}
        <div class="modal-header">
          <h3 id="modal-title" style="margin-bottom:0;">${title}</h3>
          <button type="button" class="modal-close" aria-label="Close" data-action="close-modal">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && dismissOnBackdrop) close();
    });
    // Every modal has the header's X button with this same data-action,
    // and many callers also put their own "Cancel" button with it in
    // bodyHtml — wire every match, not just the first.
    backdrop.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
      btn.addEventListener('click', () => close());
    });

    document.addEventListener('keydown', keyHandler);

    document.body.appendChild(backdrop);
    activeBackdrop = backdrop;

    if (!historyPushed) {
      window.history.pushState({ jrModal: true }, '');
      historyPushed = true;
    }

    const modalEl = backdrop.querySelector('.modal');
    if (onMount) onMount(modalEl);

    const target = (initialFocus && backdrop.querySelector(initialFocus))
      || backdrop.querySelector('.modal-body input:not([type="hidden"]), .modal-body textarea, .modal-body select')
      || backdrop.querySelector('.modal-body button, .modal-body a[href], .modal-footer button, .modal-footer a[href]')
      || backdrop.querySelector('.modal-close');
    if (target) target.focus();
  }

  function keyHandler(e) {
    if (!activeBackdrop) return;
    if (e.key === 'Escape') {
      if (dismissOnBackdrop) close();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep keyboard focus inside the dialog.
    const items = [...activeBackdrop.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (items.length === 0) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !activeBackdrop.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !activeBackdrop.contains(document.activeElement))) {
      e.preventDefault();
      first.focus();
    }
  }

  // Android hardware back / browser Back: close the modal, don't leave the page.
  window.addEventListener('popstate', () => {
    if (ignoreNextPop) { ignoreNextPop = false; return; }
    if (activeBackdrop) {
      historyPushed = false;
      closeNow({ keepHistory: true });
    } else {
      historyPushed = false;
    }
  });
  // A page restored from the back-forward cache must not come back with a
  // stale modal or scroll lock.
  window.addEventListener('pageshow', (e) => { if (e.persisted && activeBackdrop) closeNow({ keepHistory: true }); });

  function close() {
    closeNow({ keepHistory: false });
  }

  /**
   * Plays the reverse of the open animation (.is-closing, animations.css)
   * before removing the node. Listening for animationend (with a timeout
   * fallback) means it takes ~0ms when reduced motion zeroes the duration.
   */
  function closeNow({ keepHistory }) {
    if (!activeBackdrop) return;
    const backdrop = activeBackdrop;
    const onClose = activeOnClose;
    activeBackdrop = null;
    activeOnClose = null;
    ScrollLock.release('modal');
    document.removeEventListener('keydown', keyHandler);

    if (historyPushed && !keepHistory && window.history.state && window.history.state.jrModal) {
      ignoreNextPop = true;
      historyPushed = false;
      window.history.back();
    }

    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    if (onClose) onClose();

    backdrop.classList.add('is-closing');
    let removed = false;
    const remove = () => {
      if (removed) return;
      removed = true;
      backdrop.remove();
    };
    backdrop.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 400); // fallback in case animationend never fires
  }

  /**
   * Standard confirmation. Resolves true only on the confirm button;
   * every other way out (Cancel, X, Back, Escape) resolves false. Not
   * dismissible by tapping outside, so a stray tap can't answer for the
   * user. Destructive confirmations focus Cancel, not the danger button.
   */
  function confirm({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      let settled = false;
      const settle = (value) => { if (!settled) { settled = true; resolve(value); } };
      open({
        title,
        bodyHtml: `
          <div class="modal-message">${message}</div>
          <div class="modal-actions modal-actions--stacked">
            <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-modal-confirm>${confirmLabel}</button>
            <button type="button" class="btn btn-ghost" data-action="close-modal" data-modal-cancel>${cancelLabel}</button>
          </div>`,
        dismissOnBackdrop: false,
        initialFocus: danger ? '[data-modal-cancel]' : '[data-modal-confirm]',
        onMount: (el) => {
          el.querySelector('[data-modal-confirm]').addEventListener('click', () => {
            settle(true);
            close();
          });
        },
        onClose: () => settle(false),
      });
    });
  }

  return { open, close, confirm };
})();
