/**
 * JOB RUSH — Professional photo card.
 * One reusable "real photo + title + description + optional actions"
 * content unit (styles: .photo-card in components.css). The photo comes
 * from the approved library in config/assets.js (PHOTOS), never from a
 * user's avatar, and every card is lazy-loaded and given intrinsic
 * dimensions so it can't cause layout shift or load more than the
 * smallest srcset candidate the screen needs.
 *
 *   PhotoCard.render({
 *     photo: 'collaboration',          // key in PHOTOS
 *     badge: 'Referral program',       // optional
 *     title: 'Invite people to Job Rush',
 *     description: 'Plain text, or set descriptionHtml for trusted markup.',
 *     support: 'Optional smaller supporting line.',
 *     actions: [{ label: 'Copy link', id: 'copy-btn', variant: 'primary' },
 *               { label: 'Explore', href: 'search.html', variant: 'secondary' }],
 *     layout: 'split',                 // 'stack' (default) | 'split' (side-by-side from 720px)
 *     headingLevel: 2,
 *     eager: false,                    // true only for above-the-fold cards
 *   })
 */
const PhotoCard = (function () {
  function escape(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function actionHtml(a) {
    const cls = `btn btn-${a.variant === 'primary' ? 'primary' : a.variant === 'ghost' ? 'ghost' : 'secondary'}`;
    if (a.href) return `<a href="${escape(a.href)}" class="${cls}"${a.id ? ` id="${escape(a.id)}"` : ''}>${escape(a.label)}</a>`;
    return `<button type="button" class="${cls}"${a.id ? ` id="${escape(a.id)}"` : ''}>${escape(a.label)}</button>`;
  }

  function render(opts) {
    const photo = (typeof PHOTOS !== 'undefined' && PHOTOS[opts.photo]) || null;
    if (!photo) return '';
    const level = opts.headingLevel || 2;
    const actions = (opts.actions || []).map(actionHtml).join('');
    return `
      <article class="photo-card${opts.layout === 'split' ? ' photo-card--split' : ''}">
        <div class="photo-card-media">
          <img src="${escape(photo.src)}" srcset="${escape(photo.srcset)}" sizes="${escape(opts.sizes || '(max-width: 720px) 100vw, 560px')}"
            alt="${escape(opts.alt || photo.alt)}" width="${photo.width}" height="${photo.height}"
            style="object-position: ${escape(photo.focus)};"
            loading="${opts.eager ? 'eager' : 'lazy'}" decoding="async" />
          ${opts.badge ? `<span class="photo-card-badge">${escape(opts.badge)}</span>` : ''}
        </div>
        <div class="photo-card-body">
          <h${level} class="photo-card-title">${escape(opts.title)}</h${level}>
          ${opts.descriptionHtml ? `<p class="photo-card-text">${opts.descriptionHtml}</p>` : opts.description ? `<p class="photo-card-text">${escape(opts.description)}</p>` : ''}
          ${opts.support ? `<p class="photo-card-support">${escape(opts.support)}</p>` : ''}
          ${actions ? `<div class="photo-card-actions">${actions}</div>` : ''}
        </div>
      </article>`;
  }

  function mount(el, opts) {
    if (el) el.innerHTML = render(opts);
    return el;
  }

  return { render, mount };
})();
