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

## Rules of thumb

- A value is never shown without its meaning: "12 years of experience", "30 jobs completed", "Starting from ₦200,000", "Mon – Fri".
- Money screens show when the number was last confirmed by the server and never assume a request succeeded without a server answer.
- Don't add a new modal/card/empty-state implementation; extend these.
