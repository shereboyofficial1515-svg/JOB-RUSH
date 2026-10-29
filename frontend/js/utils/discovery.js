/**
 * JOB RUSH — shared pieces for the discovery screens (jobs.html, search.html,
 * job-detail.html): money/date formatting, the compact job and professional
 * cards, card-shaped loading skeletons, and the search form's filter panel.
 *
 * Cards only ever show what the API returned — a missing location, price or
 * rating is left out (or labelled as not given), never filled in.
 *
 * Depends on: esc() from sanitize.js, Icons from icons.js.
 */
const Discovery = (function () {
  const EMPLOYMENT_LABELS = { full_time: 'Full-time', part_time: 'Part-time', contract: 'Contract', one_time: 'One-time' };
  const EXPERIENCE_LABELS = { entry: 'Entry level', intermediate: 'Intermediate', expert: 'Expert' };
  const BUDGET_TYPE_LABELS = { fixed: 'Fixed price', hourly: 'Per hour', salary: 'Salary' };
  const AVAILABILITY = {
    available: { label: 'Available', pill: 'status-pill--on' },
    busy: { label: 'Busy', pill: 'status-pill--warn' },
    unavailable: { label: 'Unavailable', pill: 'status-pill--off' },
  };

  const SEARCH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const FILTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>';

  function money(amount, currency) {
    if (amount === null || amount === undefined || amount === '') return null;
    const n = Number(amount);
    if (!Number.isFinite(n)) return null;
    return `${currency === 'USD' ? '$' : '₦'}${n.toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;
  }

  /** "₦50,000 – ₦80,000", "₦50,000", or null when the job gave no amount. */
  function budgetAmount(job) {
    const min = money(job.budget_min);
    const max = money(job.budget_max);
    if (min && max && Number(job.budget_min) !== Number(job.budget_max)) return `${min} – ${max}`;
    return min || max;
  }

  function budgetTypeLabel(type) { return BUDGET_TYPE_LABELS[type] || null; }
  function employmentLabel(type) { return EMPLOYMENT_LABELS[type] || (type ? String(type).replace(/_/g, ' ') : null); }
  function experienceLabel(level) { return EXPERIENCE_LABELS[level] || (level ? String(level) : null); }

  function timeAgo(dateStr) {
    const t = new Date(dateStr).getTime();
    if (!Number.isFinite(t)) return '';
    const diff = Math.max(0, (Date.now() - t) / 1000);
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
    return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function place(...parts) {
    const list = parts.filter(Boolean);
    return list.length ? list.join(', ') : null;
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  }

  function safeImageUrl(value) {
    if (!value || typeof value !== 'string') return null;
    try {
      const u = new URL(value, window.location.href);
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
    } catch { return null; }
  }

  // ------------------------------------------------------------ cards
  function jobCard(job) {
    const amount = budgetAmount(job);
    const type = budgetTypeLabel(job.budget_type);
    const location = place(job.lga_name, job.state_name);
    const employment = employmentLabel(job.employment_type);
    const desc = String(job.description || '').trim();
    return `
      <a href="job-detail.html?id=${encodeURIComponent(job.id)}" class="card card-interactive disc-card job-card">
        <div class="disc-card-head">
          <h3 class="disc-card-title">${esc(job.title)}</h3>
          <time class="disc-card-time" datetime="${esc(job.created_at)}">${esc(timeAgo(job.created_at))}</time>
        </div>
        <div class="disc-card-budget">
          ${amount ? `<strong>${esc(amount)}</strong>${type ? `<span>${esc(type)}</span>` : ''}` : '<span class="is-muted">Budget not specified</span>'}
        </div>
        <ul class="disc-card-meta">
          ${location ? `<li>${Icons.location}<span>${esc(location)}</span></li>` : ''}
          ${employment ? `<li>${Icons.briefcase}<span>${esc(employment)}</span></li>` : ''}
        </ul>
        ${desc ? `<p class="disc-card-desc">${esc(desc)}</p>` : ''}
        <div class="disc-card-foot">${esc(job.hirer_display_name || 'JOB RUSH hirer')}</div>
      </a>`;
  }

  function proCard(w) {
    const photo = safeImageUrl(w.profile_picture_url);
    const ini = esc(initials(w.full_name));
    const avatar = photo
      ? `<img class="disc-avatar" src="${esc(photo)}" alt="" width="56" height="56" loading="lazy" data-initials="${ini}" />`
      : `<span class="disc-avatar disc-avatar--initials" aria-hidden="true">${ini}</span>`;
    const verified = w.verification_status === 'approved';
    const ratingCount = Number(w.rating_count) || 0;
    const rating = ratingCount > 0
      ? `<li class="disc-rating">${Icons.star}<span><strong>${Number(w.rating_avg || 0).toFixed(1)}</strong> (${ratingCount})</span></li>`
      : '<li class="is-muted"><span>No reviews yet</span></li>';
    const location = place(w.lga_name, w.state_name);
    const price = money(w.starting_price, w.price_currency);
    const availability = AVAILABILITY[w.availability_status];
    return `
      <a class="card card-interactive disc-card pro-card" href="worker-profile.html?id=${encodeURIComponent(w.user_id)}">
        <div class="pro-card-head">
          ${avatar}
          <div class="pro-card-id">
            <div class="pro-card-name">
              <h3 class="disc-card-title">${esc(w.full_name)}</h3>
              ${verified ? `<span class="pro-verified" title="Verified">${Icons.verified}<span class="visually-hidden">Verified</span></span>` : ''}
              ${w.is_pro ? '<span class="badge badge-pro">PRO</span>' : ''}
            </div>
            <div class="pro-card-title">${esc(w.professional_title || 'Professional')}</div>
            ${w.business_name ? `<div class="pro-card-business">${Icons.business}<span>${esc(w.business_name)}</span></div>` : ''}
          </div>
        </div>
        <ul class="disc-card-meta">
          ${rating}
          ${location ? `<li>${Icons.location}<span>${esc(location)}</span></li>` : ''}
          ${w.has_video ? `<li>${Icons.camera}<span>Work video</span></li>` : ''}
        </ul>
        <div class="disc-card-foot pro-card-foot">
          ${price ? `<span class="pro-card-price">From <strong>${esc(price)}</strong></span>` : '<span class="is-muted">Price on request</span>'}
          ${availability ? `<span class="status-pill ${availability.pill}">${availability.label}</span>` : ''}
        </div>
      </a>`;
  }

  /** A photo that fails to load becomes the person's initials, never a broken image. */
  function wireAvatarFallback(container) {
    container.addEventListener('error', (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement) || !img.classList.contains('disc-avatar')) return;
      const span = document.createElement('span');
      span.className = 'disc-avatar disc-avatar--initials';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = img.dataset.initials || '?';
      img.replaceWith(span);
    }, true);
  }

  function skeletonCards(container, { count = 6, kind = 'job' } = {}) {
    const one = kind === 'pro'
      ? `<div class="card disc-card disc-skel" aria-hidden="true">
           <div class="pro-card-head"><div class="skeleton" style="width:56px;height:56px;border-radius:50%;flex:none;"></div>
             <div style="flex:1;min-width:0;"><div class="skeleton" style="height:16px;width:65%;margin-bottom:8px;"></div><div class="skeleton" style="height:12px;width:45%;"></div></div></div>
           <div class="skeleton" style="height:12px;width:80%;"></div>
           <div class="skeleton" style="height:14px;width:40%;"></div>
         </div>`
      : `<div class="card disc-card disc-skel" aria-hidden="true">
           <div class="skeleton" style="height:16px;width:70%;"></div>
           <div class="skeleton" style="height:14px;width:40%;"></div>
           <div class="skeleton" style="height:12px;width:60%;"></div>
           <div class="skeleton" style="height:12px;width:90%;"></div>
         </div>`;
    container.innerHTML = Array.from({ length: count }, () => one).join('') + '<span class="visually-hidden" role="status">Loading…</span>';
  }

  // ------------------------------------------------------------ search form
  /** Form values → query params, dropping empties. Checkboxes become "true". */
  function formToParams(form) {
    const params = new URLSearchParams();
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'checkbox') { if (el.checked) params.set(el.name, 'true'); continue; }
      const v = String(el.value || '').trim();
      if (v) params.set(el.name, v);
    }
    return params;
  }

  /** Puts ?a=b values back into the form (shared links, Back/Forward). Location selects are restored by LocationSelect. */
  function restoreForm(form, params, skip = []) {
    for (const el of form.elements) {
      if (!el.name || skip.includes(el.name) || !params.has(el.name)) continue;
      if (el.type === 'checkbox') el.checked = params.get(el.name) === 'true';
      else el.value = params.get(el.name);
    }
  }

  function activeFilterCount(form, ignore = ['keyword', 'sort']) {
    let n = 0;
    for (const el of form.elements) {
      if (!el.name || ignore.includes(el.name) || el.disabled) continue;
      if (el.type === 'checkbox' ? el.checked : String(el.value || '').trim()) n += 1;
    }
    return n;
  }

  /**
   * The Filters button opens/closes the filter panel on phones and tablets; on wide
   * screens the panel is always shown (CSS) and the button is hidden.
   */
  function initFilterPanel(form, { onChange } = {}) {
    const toggle = form.querySelector('[data-filter-toggle]');
    const panel = form.querySelector('[data-filter-panel]');
    const count = form.querySelector('[data-filter-count]');
    const clear = form.querySelector('[data-filter-clear]');
    const setOpen = (open) => {
      panel.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
    const refreshCount = () => {
      const n = activeFilterCount(form);
      count.textContent = n ? String(n) : '';
      count.hidden = !n;
      if (clear) clear.disabled = n === 0;
    };
    form.addEventListener('change', refreshCount);
    /** Empties every filter (not the keyword or sort), then tells the page to search again. */
    function clearFilters() {
      for (const el of form.elements) {
        if (!el.name || el.name === 'keyword' || el.name === 'sort') continue;
        if (el.type === 'checkbox') el.checked = false;
        else if (el.tagName === 'SELECT' || el.tagName === 'INPUT') el.value = '';
        if (el.tagName === 'SELECT') el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      refreshCount();
      if (onChange) onChange();
    }
    if (clear) clear.addEventListener('click', clearFilters);
    refreshCount();
    return { refreshCount, clear: clearFilters, close: () => setOpen(false) };
  }

  return {
    money, budgetAmount, budgetTypeLabel, employmentLabel, experienceLabel, timeAgo, place,
    jobCard, proCard, wireAvatarFallback, skeletonCards,
    formToParams, restoreForm, activeFilterCount, initFilterPanel,
    SEARCH_ICON, FILTER_ICON,
  };
})();
