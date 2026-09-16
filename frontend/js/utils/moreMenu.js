/**
 * JOB RUSH — "More actions" overflow menu.
 * A small accessible dropdown for card action rows that would
 * otherwise force several text buttons into one cramped row (or off
 * the edge of the card on mobile). One menu open at a time, closes on
 * outside click, Escape, or picking an item.
 */
const MoreMenu = (function () {
  let activePanel = null;
  let activeCloser = null;

  function closeActive() {
    if (activeCloser) activeCloser();
  }

  /**
   * @param {HTMLElement} mount - element to render the trigger+panel into
   * @param {{label?: string, items: {label: string, icon?: string, danger?: boolean, onClick: () => void}[]}} opts
   */
  function attach(mount, { label = 'More actions', items }) {
    mount.classList.add('more-menu-wrap');
    mount.innerHTML = `
      <button type="button" class="btn btn-ghost icon-btn more-menu-btn" aria-label="${label}" aria-haspopup="true" aria-expanded="false" title="${label}">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>
    `;
    const btn = mount.querySelector('.more-menu-btn');

    function close() {
      const panel = mount.querySelector('.more-menu-panel');
      if (panel) panel.remove();
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onOutsideClick);
      document.removeEventListener('keydown', onEsc);
      if (activePanel === mount) {
        activePanel = null;
        activeCloser = null;
      }
    }

    function onOutsideClick(e) {
      if (!mount.contains(e.target)) close();
    }
    function onEsc(e) {
      if (e.key === 'Escape') close();
    }

    function open() {
      closeActive();
      const panel = document.createElement('div');
      panel.className = 'more-menu-panel dropdown-panel';
      panel.setAttribute('role', 'menu');
      panel.innerHTML = items
        .map(
          (item, i) =>
            `<button type="button" class="more-menu-item ${item.danger ? 'is-danger' : ''}" role="menuitem" data-index="${i}">${item.icon || ''}<span>${item.label}</span></button>`
        )
        .join('');
      mount.appendChild(panel);
      btn.setAttribute('aria-expanded', 'true');

      panel.querySelectorAll('.more-menu-item').forEach((el, i) => {
        el.addEventListener('click', () => {
          close();
          items[i].onClick();
        });
      });

      activePanel = mount;
      activeCloser = close;
      document.addEventListener('click', onOutsideClick);
      document.addEventListener('keydown', onEsc);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (mount.querySelector('.more-menu-panel')) close();
      else open();
    });
  }

  return { attach };
})();
