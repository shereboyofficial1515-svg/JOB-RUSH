/**
 * JOB RUSH — shared profile icon set.
 * One small, consistent stroke-icon library (24x24, stroke-width 2,
 * currentColor) used across the worker profile and business/social
 * sections, instead of emoji or ad-hoc SVGs scattered per section.
 * Each icon is a bare <svg> string — callers drop it inline and size
 * it with CSS (width/height on the wrapping element or an explicit
 * class), matching how AvatarBadge/back-button icons already work
 * elsewhere in the app.
 */
const Icons = (function () {
  function svg(paths) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  return {
    location: svg('<path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
    briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 12h18"/>'),
    star: svg('<path d="M12 2.5 15 9l7 1-5 5 1.3 7-6.3-3.5L5.7 22 7 15l-5-5 7-1 3-6.5Z"/>'),
    clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
    verified: svg('<path d="m9 12 2 2 4-4"/><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z"/>'),
    graduationCap: svg('<path d="M2 9 12 4l10 5-10 5-10-5Z"/><path d="M6 11v5c0 1.4 2.7 3 6 3s6-1.6 6-3v-5"/><path d="M22 9v6"/>'),
    business: svg('<path d="M3 21h18"/><path d="M5 21V9l7-5 7 5v12"/><path d="M9 21v-6h6v6"/>'),
    globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
    phone: svg('<path d="M4 5c0-1 .8-2 1.8-2h2c.6 0 1.1.4 1.3 1l1 3c.2.6 0 1.2-.4 1.6L8.3 10c1 2.3 2.8 4.2 5.1 5.1l1.4-1.4c.4-.4 1-.6 1.6-.4l3 1c.6.2 1 .7 1 1.3v2c0 1-.9 1.8-1.9 1.8C11.6 19.8 4.2 12.4 4 5Z"/>'),
    mail: svg('<rect x="2.5" y="4.5" width="19" height="15" rx="2"/><path d="m3 6 9 6.5L21 6"/>'),
    calendar: svg('<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>'),
    document: svg('<path d="M6 2.5h9l4 4V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z"/><path d="M14 2.5V7h4"/><path d="M8 13h8M8 17h5"/>'),
    portfolio: svg('<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>'),
    message: svg('<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9Z"/>'),
    gender: svg('<circle cx="10" cy="14" r="5"/><path d="M17 2h5v5M21.5 2.5 15 9"/>'),
    camera: svg('<path d="M4 8h3l1.6-2.4A2 2 0 0 1 10.3 4h3.4a2 2 0 0 1 1.7 1L17 8h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/><circle cx="12" cy="14" r="3.5"/>'),
    pencil: svg('<path d="M14.5 4.5 19.5 9.5 8 21H3v-5L14.5 4.5Z"/>'),
    checkShield: svg('<path d="m9 12 2 2 4-4"/><path d="M12 2 4 5v6c0 5 3.4 8.4 8 11 4.6-2.6 8-6 8-11V5l-8-3Z"/>'),
  };
})();
