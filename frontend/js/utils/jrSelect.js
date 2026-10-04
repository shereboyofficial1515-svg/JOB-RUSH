/**
 * JOB RUSH — JRSelect: the one dropdown used everywhere.
 *
 * Every native <select> on a page is upgraded to the same control. The real
 * <select> stays in the DOM (hidden), so existing code that reads `.value`, sets
 * `.value`, rebuilds `.innerHTML`, listens for `change`, or submits the form keeps
 * working unchanged; JRSelect only replaces what the person sees and touches.
 *
 *  - Trigger button showing the selected label, a clear (×) button where an empty
 *    choice exists, disabled / loading / error states.
 *  - Search box on long lists (more than SEARCH_THRESHOLD real options, or when
 *    the select has data-search="true"; data-search="false" turns it off).
 *  - Full keyboard support: ↑ ↓ Home End PageUp PageDown Enter Space Esc Tab,
 *    type-ahead on short lists. ARIA combobox / listbox pattern.
 *  - Desktop: a floating panel anchored to the trigger, flipped above when there is
 *    no room below, sized to the space left in the viewport. It is appended to
 *    <body> and sits on the --z-popover layer, so no parent's overflow or stacking
 *    context can clip it (no z-index arms race).
 *  - Phones (<= 640px): a bottom sheet with the search box on top and a scrim.
 *  - Optional per-option extras (all plain attributes on the <option>):
 *      data-image="url"   real photo / logo, shown in a small round avatar
 *      data-initials="AB" fallback when there is no image or it fails to load
 *      data-sub="text"    secondary line (e.g. "Verified · Warri")
 *    and on the <select>: data-avatar="initials" shows initials for every option;
 *    data-not-listed="Other / Not listed" adds a final choice that clears the
 *    selection, so a person whose place is missing from a list can still go on.
 *  - Opt out for a single select with data-native.
 *
 *   JRSelect.enhance(selectEl)   JRSelect.enhanceAll(root)   JRSelect.refresh(selectEl)
 */
const JRSelect = (function () {
  const SEARCH_THRESHOLD = 7;
  const RENDER_CAP = 300;
  const SHEET_MQ = '(max-width: 640px)';
  const instances = new WeakMap();
  let openInst = null;
  let uid = 0;

  const norm = (s) => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initialsOf = (label) => String(label || '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const isSheet = () => !!(window.matchMedia && window.matchMedia(SHEET_MQ).matches);
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const nativeIndex = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');

  function skip(select) {
    return select.multiple || select.size > 1 || select.hasAttribute('data-native') || instances.has(select) || select.closest('.jr-select');
  }

  function enhance(select) {
    if (!(select instanceof HTMLSelectElement) || skip(select)) return null;
    const inst = createInstance(select);
    instances.set(select, inst);
    return inst;
  }

  function enhanceAll(root) {
    (root || document).querySelectorAll('select').forEach(enhance);
  }

  function refresh(select) {
    const inst = instances.get(select);
    if (inst) inst.sync();
  }

  // ------------------------------------------------------------------
  function createInstance(select) {
    const id = select.id || `jr-sel-${++uid}`;
    const listId = `${id}-list`;
    const valueId = `${id}-value`;
    let items = [];
    let activeIdx = -1;
    let query = '';
    let notListedChosen = false;
    let typeahead = '';
    let typeaheadTimer = 0;
    let panel = null; let searchEl = null; let listEl = null; let scrimEl = null;
    let sheetMode = false;
    let historyPushed = false;

    // ----- DOM -----
    const wrap = document.createElement('div');
    wrap.className = 'jr-select';
    const cs = getComputedStyle(select);
    const minW = parseFloat(cs.minWidth);
    if (minW > 0) wrap.style.minWidth = `${minW}px`;
    if (select.style.maxWidth) wrap.style.maxWidth = select.style.maxWidth;
    select.parentNode.insertBefore(wrap, select);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'jr-select-trigger';
    trigger.id = `${id}-trigger`;
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', listId);
    trigger.innerHTML = `<span class="jr-select-avatar" hidden></span><span class="jr-select-value" id="${valueId}"></span>
      <span class="jr-select-clear" role="button" tabindex="-1" aria-label="Clear selection" hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </span>
      <svg class="jr-select-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`;
    wrap.appendChild(trigger);
    wrap.appendChild(select);
    select.classList.add('jr-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const valueEl = trigger.querySelector('.jr-select-value');
    const avatarEl = trigger.querySelector('.jr-select-avatar');
    const clearEl = trigger.querySelector('.jr-select-clear');

    function labelEl() {
      if (select.id) {
        const l = document.querySelector(`label[for="${CSS.escape(select.id)}"]`);
        if (l) return l;
      }
      const field = select.closest('.field, .settings-row, .form-group');
      return field ? field.querySelector('label') : null;
    }
    function applyLabelling() {
      const l = labelEl();
      if (l) {
        if (!l.id) l.id = `${id}-label`;
        trigger.setAttribute('aria-labelledby', `${l.id} ${valueId}`);
        if (!l.__jrSelectBound) {
          l.__jrSelectBound = true;
          l.addEventListener('click', (e) => { if (!e.target.closest('a, button')) { e.preventDefault(); if (!trigger.disabled) trigger.focus(); } });
        }
      } else if (select.getAttribute('aria-label')) {
        trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
      }
    }

    // ----- model -----
    function readItems() {
      const out = [];
      const pushOption = (o, group) => {
        out.push({
          type: 'option', value: o.value, label: o.textContent.trim(), disabled: o.disabled || (group && group.disabled),
          selected: o.selected, image: o.dataset.image || '', initials: o.dataset.initials || '', sub: o.dataset.sub || '', group: group ? group.label : '',
        });
      };
      Array.from(select.children).forEach((child) => {
        if (child.tagName === 'OPTGROUP') {
          out.push({ type: 'group', label: child.label });
          Array.from(child.children).forEach((o) => pushOption(o, child));
        } else if (child.tagName === 'OPTION') pushOption(child, null);
      });
      return out;
    }
    const realOptions = () => items.filter((i) => i.type === 'option' && i.value !== '');
    const emptyOption = () => items.find((i) => i.type === 'option' && i.value === '');
    const isLoading = () => { const r = items.filter((i) => i.type === 'option'); return r.length === 1 && /^loading/i.test(r[0].label) && r[0].value === ''; };
    const isError = () => { const r = items.filter((i) => i.type === 'option'); return r.length === 1 && /^could not load/i.test(r[0].label) && r[0].value === ''; };
    const searchable = () => {
      const pref = select.dataset.search;
      if (pref === 'false') return false;
      if (pref === 'true') return true;
      return realOptions().length > SEARCH_THRESHOLD;
    };

    function sync() {
      items = readItems();
      applyLabelling();
      const sel = items.find((i) => i.type === 'option' && i.selected);
      const hasValue = !!(sel && sel.value !== '');
      if (hasValue) notListedChosen = false;
      let text = sel ? sel.label : '';
      const placeholder = !hasValue;
      if (placeholder && notListedChosen && select.dataset.notListed) text = select.dataset.notListed;
      valueEl.textContent = text || select.getAttribute('aria-label') || '';
      trigger.classList.toggle('is-placeholder', placeholder && !(notListedChosen && select.dataset.notListed));
      trigger.classList.toggle('is-loading', isLoading());
      trigger.classList.toggle('is-error', isError());
      trigger.disabled = select.disabled;
      trigger.setAttribute('aria-disabled', select.disabled ? 'true' : 'false');
      wrap.classList.toggle('is-disabled', select.disabled);
      trigger.classList.toggle('is-invalid', !!select.closest('.field.has-error'));
      // avatar
      if (hasValue && (sel.image || select.dataset.avatar === 'initials' || sel.initials)) {
        avatarEl.hidden = false;
        avatarEl.innerHTML = avatarHtml(sel);
      } else avatarEl.hidden = true;
      // clear button
      const clearable = hasValue && !!emptyOption() && !select.required && select.dataset.clearable !== 'false' && !select.disabled;
      clearEl.hidden = !clearable;
      trigger.classList.toggle('has-clear', clearable);
      if (openInst === inst) renderList();
    }

    function avatarHtml(it) {
      const ini = esc(it.initials || initialsOf(it.label));
      if (it.image) return `<img src="${esc(it.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'jr-select-initials',textContent:'${ini}'}))">`;
      return `<span class="jr-select-initials">${ini}</span>`;
    }

    // ----- selecting -----
    function choose(value, { notListed = false } = {}) {
      nativeValue.set.call(select, value);
      notListedChosen = notListed;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
      close({ focus: true });
    }

    // ----- panel -----
    function visibleRows() {
      const q = norm(query).trim();
      const tokens = q ? q.split(/\s+/) : [];
      let rows = [];
      let lastGroup = null;
      const empty = emptyOption();
      const searching = tokens.length > 0;
      const placeholderRow = empty && !searching && !isLoading() && !isError() && !select.required;
      items.forEach((it) => {
        if (it.type === 'group') { lastGroup = it; return; }
        if (it.value === '') return; // empty option is handled separately
        if (searching) {
          const hay = norm(it.label + ' ' + it.sub);
          if (!tokens.every((t) => hay.includes(t))) return;
          const lab = norm(it.label);
          // Best first: starts with what was typed, then every word typed starts a word, then anything containing it.
          const words = lab.split(/[\s\-/(]+/);
          it.__rank = lab.startsWith(q) ? 0 : tokens.every((t) => words.some((w) => w.startsWith(t))) ? 1 : 2;
        }
        if (lastGroup && !searching && !rows.some((r) => r === lastGroup)) rows.push(lastGroup);
        rows.push(it);
      });
      if (searching) rows = rows.filter((r) => r.type === 'option').sort((a, b) => a.__rank - b.__rank);
      return { rows, placeholderRow: placeholderRow ? empty : null, searching };
    }

    function renderList() {
      if (!listEl) return;
      const { rows, placeholderRow, searching } = visibleRows();
      const html = [];
      const flat = [];
      if (isLoading()) {
        html.push('<li class="jr-select-state" role="presentation"><span class="jr-select-spinner" aria-hidden="true"></span>Loading…</li>');
      } else if (isError()) {
        html.push('<li class="jr-select-state is-error" role="presentation">Could not load this list. Close and try again.</li>');
      } else {
        if (placeholderRow) flat.push(placeholderRow);
        const shown = rows.slice(0, RENDER_CAP + rows.filter((r) => r.type === 'group').length);
        shown.forEach((r) => { if (r.type === 'option') flat.push(r); });
        const notListed = select.dataset.notListed;
        if (notListed) flat.push({ type: 'option', value: '', label: notListed, notListed: true, selected: false });

        let n = -1;
        const hasAvatars = select.dataset.avatar === 'initials' || shown.some((r) => r.image || r.initials);
        if (placeholderRow) html.push(optionHtml(placeholderRow, ++n, { placeholder: true }));
        shown.forEach((r) => {
          if (r.type === 'group') html.push(`<li class="jr-select-group" role="presentation">${esc(r.label)}</li>`);
          else html.push(optionHtml(r, ++n, { avatars: hasAvatars }));
        });
        if (rows.filter((r) => r.type === 'option').length > RENDER_CAP) html.push(`<li class="jr-select-state" role="presentation">Showing the first ${RENDER_CAP}. Keep typing to narrow it down.</li>`);
        if (!rows.some((r) => r.type === 'option') && searching) html.push(`<li class="jr-select-state" role="presentation">No matches for “${esc(query.trim())}”.</li>`);
        else if (!realOptions().length && !searching) html.push('<li class="jr-select-state" role="presentation">Nothing to choose from yet.</li>');
        if (notListed) html.push(optionHtml(flat[flat.length - 1], ++n, { notListed: true }));
      }
      listEl.innerHTML = html.join('');
      listEl.__flat = flat;
      const firstReal = flat.findIndex((f) => !f.disabled && f.value !== '');
      const selIdx = flat.findIndex((f) => f.selected && f.value !== '');
      if (searching) setActive(firstReal >= 0 ? firstReal : flat.findIndex((f) => f.notListed), { scroll: true });
      else setActive(selIdx >= 0 ? selIdx : (firstReal >= 0 ? firstReal : (flat.length ? 0 : -1)), { scroll: true });
    }

    function optionHtml(it, idx, o) {
      const cls = ['jr-select-option'];
      if (it.selected && it.value !== '') cls.push('is-selected');
      if (it.disabled) cls.push('is-disabled');
      if (o.placeholder) cls.push('is-placeholder');
      if (o.notListed) cls.push('is-not-listed');
      const av = o.avatars && !o.placeholder && !o.notListed ? `<span class="jr-select-avatar">${avatarHtml(it)}</span>` : '';
      const check = it.selected && it.value !== '' ? '<svg class="jr-select-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' : '';
      return `<li role="option" id="${id}-opt-${idx}" class="${cls.join(' ')}" data-idx="${idx}" aria-selected="${it.selected && it.value !== '' ? 'true' : 'false'}"${it.disabled ? ' aria-disabled="true"' : ''}>
        ${av}<span class="jr-select-text"><span class="jr-select-label">${esc(it.label)}</span>${it.sub ? `<span class="jr-select-sub">${esc(it.sub)}</span>` : ''}</span>${check}</li>`;
    }

    function setActive(idx, { scroll = true } = {}) {
      if (!listEl) return;
      const flat = listEl.__flat || [];
      activeIdx = idx;
      listEl.querySelectorAll('.is-active').forEach((el) => el.classList.remove('is-active'));
      const el = idx >= 0 ? listEl.querySelector(`[data-idx="${idx}"]`) : null;
      const owner = searchEl || listEl;
      if (el) {
        el.classList.add('is-active');
        owner.setAttribute('aria-activedescendant', el.id);
        if (scroll) el.scrollIntoView({ block: 'nearest' });
      } else owner.removeAttribute('aria-activedescendant');
      return flat[idx];
    }

    function move(delta) {
      const flat = listEl.__flat || [];
      if (!flat.length) return;
      let i = activeIdx;
      for (let n = 0; n < flat.length; n++) {
        i = (i + delta + flat.length) % flat.length;
        if (!flat[i].disabled) break;
      }
      setActive(i);
    }

    function pickActive() {
      const flat = (listEl && listEl.__flat) || [];
      const it = flat[activeIdx];
      if (!it || it.disabled) return;
      choose(it.value, { notListed: !!it.notListed });
    }

    function onKey(e) {
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); move(1); break;
        case 'ArrowUp': e.preventDefault(); move(-1); break;
        case 'Home': if (!searchEl || e.ctrlKey) { e.preventDefault(); setActive(0); } break;
        case 'End': if (!searchEl || e.ctrlKey) { e.preventDefault(); setActive((listEl.__flat || []).length - 1); } break;
        case 'PageDown': e.preventDefault(); for (let i = 0; i < 6; i++) move(1); break;
        case 'PageUp': e.preventDefault(); for (let i = 0; i < 6; i++) move(-1); break;
        case 'Enter': e.preventDefault(); pickActive(); break;
        case ' ': if (!searchEl) { e.preventDefault(); pickActive(); } break;
        case 'Escape': e.preventDefault(); e.stopPropagation(); close({ focus: true }); break;
        case 'Tab': e.preventDefault(); e.stopPropagation(); close({ focus: true }); break;
        default:
          if (!searchEl && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            typeahead += norm(e.key);
            clearTimeout(typeaheadTimer);
            typeaheadTimer = setTimeout(() => { typeahead = ''; }, 700);
            const flat = listEl.__flat || [];
            const start = Math.max(0, activeIdx);
            for (let n = 0; n < flat.length; n++) {
              const j = (start + (typeahead.length === 1 ? 1 : 0) + n) % flat.length;
              if (!flat[j].disabled && norm(flat[j].label).startsWith(typeahead)) { setActive(j); break; }
            }
          }
      }
    }

    function position() {
      if (!panel || sheetMode) return;
      const r = trigger.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      if (r.bottom < 0 || r.top > vh) { close({}); return; }
      const margin = 8;
      const width = Math.max(r.width, 240);
      let left = Math.min(Math.max(margin, r.left), Math.max(margin, vw - width - margin));
      panel.style.width = `${Math.min(width, vw - margin * 2)}px`;
      panel.style.left = `${left}px`;
      const below = vh - r.bottom - margin;
      const above = r.top - margin;
      const wanted = Math.min(360, panel.scrollHeight || 360);
      const placeAbove = below < Math.min(wanted, 240) && above > below;
      const avail = Math.max(140, Math.min(360, placeAbove ? above - 4 : below - 4));
      panel.style.maxHeight = `${avail}px`;
      panel.classList.toggle('is-above', placeAbove);
      if (placeAbove) { panel.style.top = 'auto'; panel.style.bottom = `${vh - r.top + 4}px`; }
      else { panel.style.bottom = 'auto'; panel.style.top = `${r.bottom + 4}px`; }
    }

    const onWinChange = (e) => { if (e && e.type === 'scroll' && panel && panel.contains(e.target)) return; position(); };
    const onDocPointer = (e) => {
      if (panel && !panel.contains(e.target) && !trigger.contains(e.target) && !(scrimEl && scrimEl.contains(e.target))) close({});
    };

    function open() {
      if (trigger.disabled || openInst === inst) return;
      if (openInst) openInst.close({});
      sync();
      sheetMode = isSheet();
      const hasSearch = searchable();
      query = '';
      activeIdx = -1;

      panel = document.createElement('div');
      panel.className = `jr-select-panel${sheetMode ? ' is-sheet' : ''}`;
      const l = labelEl();
      const title = (l && l.textContent.trim()) || select.getAttribute('aria-label') || '';
      panel.innerHTML = `
        ${sheetMode ? `<div class="jr-select-sheet-head"><span class="jr-select-sheet-title">${esc(title)}</span><button type="button" class="jr-select-sheet-close" aria-label="Close">Done</button></div>` : ''}
        ${hasSearch ? `<div class="jr-select-search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><input type="text" role="searchbox" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done" placeholder="Search…" aria-label="Search ${esc(title || 'options')}" aria-controls="${listId}" /></div>` : ''}
        <ul class="jr-select-list" role="listbox" id="${listId}" ${hasSearch ? '' : 'tabindex="0"'} aria-label="${esc(title || 'Options')}"></ul>`;
      listEl = panel.querySelector('.jr-select-list');
      searchEl = panel.querySelector('input');

      if (sheetMode) {
        scrimEl = document.createElement('div');
        scrimEl.className = 'jr-select-scrim';
        scrimEl.addEventListener('click', () => close({ focus: true }));
        document.body.appendChild(scrimEl);
        panel.querySelector('.jr-select-sheet-close').addEventListener('click', () => close({ focus: true }));
        ScrollLock.acquire('select-sheet');
        window.history.pushState({ jrSelect: true }, '');
        historyPushed = true;
      }
      document.body.appendChild(panel);

      panel.addEventListener('keydown', onKey);
      panel.addEventListener('mousedown', (e) => { if (e.target.closest('.jr-select-option')) e.preventDefault(); });
      listEl.addEventListener('click', (e) => {
        const li = e.target.closest('.jr-select-option');
        if (!li) return;
        activeIdx = Number(li.dataset.idx);
        pickActive();
      });
      listEl.addEventListener('mousemove', (e) => {
        const li = e.target.closest('.jr-select-option:not(.is-disabled)');
        if (li && Number(li.dataset.idx) !== activeIdx) setActive(Number(li.dataset.idx), { scroll: false });
      });
      if (searchEl) searchEl.addEventListener('input', () => { query = searchEl.value; renderList(); });

      openInst = inst;
      trigger.setAttribute('aria-expanded', 'true');
      renderList();
      position();
      document.addEventListener('pointerdown', onDocPointer, true);
      window.addEventListener('resize', onWinChange);
      window.addEventListener('scroll', onWinChange, true);

      const target = searchEl || listEl;
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      // On a touch screen focusing the search box raises the keyboard over the list; leave that to the person.
      if (!(sheetMode && coarse && searchEl)) target.focus({ preventScroll: true });
      requestAnimationFrame(position);
    }

    function close({ focus = false, fromPop = false } = {}) {
      if (openInst !== inst || !panel) return;
      openInst = null;
      document.removeEventListener('pointerdown', onDocPointer, true);
      window.removeEventListener('resize', onWinChange);
      window.removeEventListener('scroll', onWinChange, true);
      panel.remove();
      if (scrimEl) scrimEl.remove();
      panel = null; scrimEl = null; searchEl = null; listEl = null;
      trigger.setAttribute('aria-expanded', 'false');
      if (sheetMode) {
        ScrollLock.release('select-sheet');
        if (historyPushed && !fromPop && window.history.state && window.history.state.jrSelect) window.history.back();
        historyPushed = false;
      }
      if (focus) trigger.focus({ preventScroll: true });
    }

    // ----- wiring -----
    trigger.addEventListener('click', (e) => {
      if (e.target.closest('.jr-select-clear')) {
        e.stopPropagation();
        choose('');
        return;
      }
      if (openInst === inst) close({ focus: true }); else open();
    });
    trigger.addEventListener('keydown', (e) => {
      if (openInst === inst) return;
      if (['ArrowDown', 'ArrowUp'].includes(e.key) || (e.key === 'Enter' && false)) { e.preventDefault(); open(); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); open(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !clearEl.hidden) { e.preventDefault(); choose(''); }
    });

    select.addEventListener('change', sync);
    new MutationObserver(sync).observe(select, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label', 'aria-label'], characterData: true });
    const form = select.form;
    if (form) form.addEventListener('reset', () => setTimeout(sync, 0));
    // Code that assigns select.value / selectedIndex directly (no event) must still update what is shown.
    Object.defineProperty(select, 'value', { configurable: true, get() { return nativeValue.get.call(select); }, set(v) { nativeValue.set.call(select, v); sync(); } });
    Object.defineProperty(select, 'selectedIndex', { configurable: true, get() { return nativeIndex.get.call(select); }, set(v) { nativeIndex.set.call(select, v); sync(); } });
    // select.focus() (e.g. from validation helpers) lands on the visible control.
    select.focus = (opts) => trigger.focus(opts);

    const inst = { select, trigger, sync, close, open };
    sync();
    return inst;
  }

  // The system Back gesture closes an open bottom sheet instead of leaving the page.
  // Registered before Modal / drawer handlers (this script loads first), so it can
  // stop them from also reacting to the same Back press.
  window.addEventListener('popstate', (e) => {
    if (openInst && openInst.trigger && document.querySelector('.jr-select-panel.is-sheet')) {
      openInst.close({ fromPop: true });
      e.stopImmediatePropagation();
    }
  });

  function autoInit() {
    enhanceAll(document);
    new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.tagName === 'SELECT') enhance(n);
          else if (n.querySelectorAll) n.querySelectorAll('select').forEach(enhance);
        });
      }
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoInit);
  else autoInit();

  return { enhance, enhanceAll, refresh };
})();
