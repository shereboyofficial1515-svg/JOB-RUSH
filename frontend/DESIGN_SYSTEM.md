# Job Rush — Mobile design system

One set of tokens and a small set of shared components, used by every dashboard page. Pages choose a **role** (a title, a card, a sheet), not a raw size or colour. All tokens live in `css/tokens.css`; shared component styles in `css/components.css`.

## Tokens

**Colour** (no one-off colours): deep navy `--color-primary-navy` (primary), gold `--color-primary-gold` (accent, used sparingly), soft background `--bg-page`, white surface `--bg-surface`, text `--text-primary` / `--text-secondary`, status `--status-success` / `--status-danger` / `--status-warning` (+ `-bg` tints). Dark mode re-points the same aliases.

**Type roles** — use these, not sizes:

| Role | Token | Use |
|---|---|---|
| Display | `--type-display` | Hero numbers (wallet balance) |
| Page title | `--type-page-title` (`.page-title`) | The one `h1` |
| Section title | `--type-section-title` | A group of cards |
| Card title | `--type-card-title` | Card / sheet heading |
| Body / secondary | `--type-body`, `--type-secondary` | Reading text |
| Caption / label | `--type-caption`, `--type-label` | Timestamps, chips, field labels |
| Button | `--type-button` | All buttons |

Weights: `--weight-regular|medium|semibold|bold`. Phones step display and page title down one notch (media query in `tokens.css`).

**Spacing** (`--space-1…9`): 4, 8, 12, 16, 24, 32, 48, 64, 96.
**Radius roles:** `--radius-control` (buttons/inputs), `--radius-card`, `--radius-sheet` (modal sheets), `--radius-pill` (badges only).
**Elevation:** `--shadow-card` (barely there), `--shadow-elevated` (dialogs/popovers), `--shadow-sheet` (bottom sheets).
**Touch target:** `--touch-target: 44px` — every tappable control on a touch screen is at least this (`@media (pointer: coarse)` in `components.css`).

**Icons:** one family — `js/utils/icons.js` (`Icons.*`, 24×24 stroke, `currentColor`). No emoji as UI icons. The sidebar's legacy glyphs are text symbols from before this library and are the only exception.

## Components

| Component | File | Notes |
|---|---|---|
| **Modal** (dialog on desktop, bottom sheet on phones) | `js/utils/modal.js` | One implementation. `dismissOnBackdrop:false` for forms and money steps; focus trap; Android Back closes it; one backdrop at a time; scroll restored. `Modal.confirm()` for yes/no. |
| **List rows** (`.list-group`, `.list-row`) | `components.css` | Icon, title, one-line explanation, optional `.status-pill`, chevron. Account center, security. |
| **State views** | `js/utils/stateViews.js` | `StateView.skeleton / empty / error`. Errors never show raw technical text; "Try again" where a retry exists. |
| **Detail list** (`.detail-list`) | `components.css` | Label/value rows (transaction sheet, receipts). |
| **Photo card** | `js/utils/photoCard.js` | Real photo + title + description + actions. Photos come from `PHOTOS` in `config/assets.js`. |
| **Bottom navigation** | `js/modules/sidebarNav.js` | Home, Profile, Messages, Alerts, Settings; ≤900px only. Drawer keeps the full menu. |
| **App header** | `.dashboard-topbar` (≤900px) | Title on the same row as the hamburger; contextual actions on the right. |
| **Connectivity banner** | `js/utils/connectivity.js` | "You're offline" strip; money screens refuse to act offline. |

## Mobile app shell (dashboard pages, <= 900px)

```
body.has-bottom-nav
|- .dashboard-sidebar            off-canvas drawer (fixed, 280px)
|- .dashboard-main               the single scroll surface (the page/body scrolls)
|  |- .dashboard-topbar          the app bar, in normal flow
|  |  |- .topbar-lead
|  |  |  |- .mobile-nav-slot > .mobile-nav-toggle   menu button (in flow)
|  |  |  '- page title (h1, or a title + subtitle block)
|  |  '- actions (bell, page button) - wrap to their own row if needed
|  '- page content
'- .bottom-nav                   fixed; content clears it via padding
```

* **Nothing is positioned over the content.** The menu button is a real child of the header row (SidebarNav moves it there). It only becomes `position: fixed` while the drawer is open, so it stays above the backdrop as the close "X"; its slot keeps the layout from shifting. Pages without a `.dashboard-topbar` get a floating fallback button.
* **Space for fixed chrome is reserved, not hacked.** `body.has-bottom-nav .dashboard-main` has `padding-bottom: space-5 + --bottom-nav-h + env(safe-area-inset-bottom)`. Full-height regions (messages) subtract `--mobile-header-h` and `--bottom-nav-h` from `100dvh` instead of using `100vh` and negative offsets.
* **Android safe areas.** The Capacitor Android shell pads the WebView natively for the status bar, gesture/nav bar and on-screen keyboard (no `viewport-fit=cover`), so `env(safe-area-inset-*)` is 0 in the app and non-zero in notched browsers (read from Capacitor's `SystemBars.java`; confirm on a device after any Capacitor upgrade). Keep using `env()` so both work; do not add `viewport-fit=cover` without re-testing the shell.
* **Android Back** closes an open drawer (history entry, same pattern as the modal and notification panel).
* **Keyboard.** `body.is-typing` hides the bottom nav while a text field has focus.

### Layout primitives (components.css)

| Class | Use |
|---|---|
| `.btn-row` | Action buttons. Column + full width on phones, row from 520px. Never put buttons side by side as inline siblings with margins: they wrap into each other. |
| `.card-head` | Card title + optional status pill; wraps instead of colliding. |
| `.card-note`, `.card-spaced` | Card explanation text; card-to-card spacing. |
| `.media-row` | Avatar/thumbnail + control; wraps on very narrow screens. |
| `.doc-list` / `.doc-row` | Uploaded-file rows. Grid tracks use `minmax(0, 1fr)` and the meta line truncates, so a long file name cannot widen the page. |
| `.status-pill` (+ `--on`, `--warn`, `--danger`) | State label. |

Touch targets: every `.btn`, including `.btn-sm`, is at least `--touch-target` (44px) on coarse pointers. On phones, `h3` inside dashboard pages uses `--type-section-title`.

## Desktop shell, scrolling and overlays

* **One scroller.** On desktop the page (the document) scrolls; `.dashboard-sidebar` is `position: sticky; height: 100dvh` and its nav scrolls inside it with a slim visible scrollbar (hidden only on touch layouts, <= 900px). There is no `overflow` on `html`/`body`, no fixed-height main column, and no `overflow-y: scroll` band-aid.
* **`ScrollLock` (js/utils/scrollLock.js) is the only thing that locks scrolling.** Modal, mobile drawer, app-lock overlay and bottom sheets call `ScrollLock.acquire('name')` / `release('name')`. Never write `document.body.style.overflow` directly: two overlays restoring each other's saved value is what used to leave a page permanently unscrollable. A stuck lock is also cleared on `pageshow`.
* **Modals.** `.modal` is capped to the viewport; only `.modal-body` scrolls. Pass `footerHtml` to `Modal.open` for the action row (it stays pinned under the scrolling body), or put buttons in `.modal-actions`, which is `position: sticky; bottom: 0` inside the body. Either way Save / Cancel are always on screen.
* **Dropdowns: `JRSelect` (js/utils/jrSelect.js).** Every `<select>` is upgraded automatically (opt out with `data-native`). The native select stays in the DOM (hidden) so `.value`, `change`, `innerHTML` rebuilds and form submit keep working. Lists over 7 options get a search box (`data-search="true|false"` overrides). `data-not-listed="Other / Not listed"` adds a final choice that clears the value. Options may carry `data-image`, `data-initials`, `data-sub`. Panels are appended to `<body>` on the `--z-popover` layer (above modals) and flip above the trigger when there is no room below; at <= 640px they are bottom sheets. Do not add new z-index values above `--z-popover`.
* **Images saved on a profile** (profile photo, cover, business photo) must be one the user uploaded to that bucket: the API rejects any other URL (`storageService.assertOwnedPublicUrl`) and deletes the previous object when a photo is replaced or removed.

## Rules of thumb

- A value is never shown without its meaning: "12 years of experience", "30 jobs completed", "Starting from ₦200,000", "Mon – Fri".
- Money screens show when the number was last confirmed by the server and never assume a request succeeded without a server answer.
- Don't add a new modal/card/empty-state implementation; extend these.
