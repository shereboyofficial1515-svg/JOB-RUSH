# JOB RUSH — Frontend

Vanilla HTML/CSS/JS per spec (no React/Vue/Angular/Bootstrap/Tailwind).
Built to sit in front of the `job-rush-auth` backend and talk to it
over `/api/*` with credentialed fetch requests.

## Structure

```
job-rush-frontend/
├── index.html
├── pages/                  every other page (relative-path CSS/JS via ../)
├── assets/
│   ├── images/              logo variants (512/256/160/96/48px), placeholders
│   ├── icons/                favicons
│   └── fonts/                 (empty — using Google Fonts CDN, see tokens.css)
├── css/
│   ├── tokens.css            brand colors, type scale, spacing, motion — edit here first
│   ├── base.css               reset + typography
│   ├── components.css        buttons, forms, cards, nav, footer, toasts, dashboard/auth shells
│   ├── home.css / jobs.css / pro.css / admin.css   page-specific styles
└── js/
    ├── config/
    │   ├── assets.js          centralized asset paths (spec section 71) — edit here to swap any image
    │   └── api.js             fetch wrapper: base URL, credentials, error shape
    ├── modules/
    │   ├── auth.js            login/register/OTP/session calls
    │   ├── chrome.js          shared header/footer (renders the logo everywhere, mounts the notification bell)
    │   ├── sidebarNav.js      shared worker/hirer dashboard sidebar nav items
    │   └── notificationBell.js  unread badge + dropdown, mounted on every public and dashboard page
    └── utils/
        ├── toast.js           replaces alert()/confirm() per spec section 72
        ├── modal.js           accessible modal dialogs (apply flow, delete confirms)
        ├── upload.js          multipart upload helper (portfolio/verification/chat/dispute media)
        └── formHelpers.js     inline field errors + button loading state
```

## Design system

Brand colors and type are defined once in `css/tokens.css` as CSS
custom properties — every other stylesheet reads from those
variables, so a rebrand is a one-file change. Headline font is Space
Grotesk (echoes the angular speed-lines in the logo mark); body is IBM
Plex Sans. The signature `.card-notched` diagonal-cut corner (used on
the hero card and PRO band) is the one deliberately bold visual
device — used sparingly, per the "spend your boldness in one place"
principle, rather than decorating every card with it.

`prefers-reduced-motion: reduce` is respected globally (see the media
query at the bottom of `tokens.css` and in `home.css`).

## Where the logo is used

Generated from your upload into five sizes plus two favicons (see
`assets/images/` and `assets/icons/`). Referenced everywhere through
`ASSETS.logo*` in `js/config/assets.js` — never hard-coded elsewhere:

- Header/footer nav (`js/modules/chrome.js`) — every public page
- Login, register, OTP, forgot-password (`.auth-visual` panel + `.brand`)
- Worker/hirer dashboard sidebar
- Admin login card and admin dashboard sidebar

## Pages that exist and are wired to the real backend

Every page in `pages/` plus `index.html` — the frontend is complete
against the current backend surface. All 22 pages pass syntax
checking and every static internal link resolves (verified, not
assumed).

| Page | Talks to |
|---|---|
| `index.html` | none (static; hero search redirects to jobs.html) |
| `pages/login.html` | `POST /auth/login` |
| `pages/register.html` | `POST /auth/register` |
| `pages/verify-otp.html` | `POST /auth/otp/request`, `POST /auth/otp/verify` |
| `pages/forgot-password.html` | `POST /auth/password/forgot` |
| `pages/jobs.html` | `GET /jobs` (live search/filter) |
| `pages/job-detail.html` | `GET /jobs/:id`, `POST /jobs/:jobId/applications`, `POST`/`DELETE /jobs/:jobId/save` — apply modal, save toggle, role-aware CTA |
| `pages/search.html` | `GET /profiles/worker/search` (public worker search — added to the backend in this pass; see below) |
| `pages/portfolio.html` | `GET/POST/PATCH/DELETE /portfolio*` plus `POST /storage/portfolio/image\|video` — full CRUD and media upload via modals |
| `pages/applications.html` | `GET /applications/me`, `/withdraw`, `/respond` — worker's own applications/invitations, filterable |
| `pages/my-jobs.html` | `GET /jobs/mine`, `POST /jobs`, `POST /jobs/:id/status` — hirer job posting + closing |
| `pages/applicants.html` | `GET /jobs/:jobId/applications`, shortlist/reject/hire actions, links into scheduling |
| `pages/interviews.html` | `GET /interviews/upcoming\|past`, schedule/respond/cancel/complete; "Join call" now launches `call-room.html` |
| `pages/messages.html` | `GET/POST /messaging/conversations*` — conversation list + live thread (5s poll), send, plus Audio/Video call buttons that launch `call-room.html` |
| `pages/call-room.html` | `GET /interviews/:id/call-token` or `GET /messaging/calls/:id/token`, then a real LiveKit connection (see gaps below) |
| `pages/contracts.html` | `GET /contracts`, `GET /escrow/contract/:id`, `POST /escrow/fund` (real Paystack redirect), `POST /escrow/:id/release`, `POST /reviews`, `POST /disputes` |
| `pages/wallet.html` | `GET /wallet`, `/wallet/transactions`, `GET/POST /wallet/withdrawals` |
| `pages/profile-settings.html` | `GET/PATCH /profiles/worker/me` or `/profiles/hirer/me`, plus `POST /storage/verification-document` + `POST /verification/submit` |
| `pages/pro.html` | `POST /subscriptions` (real Paystack redirect) |
| `pages/support.html` | none (static) |
| `pages/dashboard.html` | `/applications/me`, `/interviews/upcoming`, `/wallet`, `/profiles/worker/me`, `/jobs/mine`, `/contracts` — adapts by role |
| `pages/admin-login.html` | `POST /auth/login` |

The admin dashboard renders each section independently and silently
omits any section the signed-in admin's role can't access (a
`verification_admin` who isn't also `finance_admin` simply won't see
the withdrawals table) — matching the backend's per-admin-role model
rather than assuming "logged into /admin" means "sees everything."

## Backend addition made during this pass

`search.html` needed a public worker-search endpoint that didn't
exist yet. Added `profileService.searchWorkers` +
`GET /api/profiles/worker/search` to the backend (no auth required,
mirrors `jobService.searchJobs`'s parameterized-filter pattern). PRO
workers get a legitimate ranking boost (`ORDER BY is_pro DESC,
rating_avg DESC, ...`) — consistent with spec section 26: PRO improves
visibility but never overrides relevance, since the boost only
reorders within whatever the filters already matched.

| `pages/admin-dashboard.html` | `/admin/verification/pending`, `/admin/finance/withdrawals/pending` (+ approve/reject), `/admin/disputes`, `/admin/subscriptions` + `/revenue`, `/admin/reviews/reported` (+ hide), `/admin/analytics/summary`, `/admin/users` (search/suspend/disable/reactivate), `/admin/jobs/reported` (+ remove), `/admin/support/tickets` (+ respond) |
| `pages/admin-settings.html` | `/admin/categories`, `/admin/skills`, `/admin/locations/states` (+ LGA/area creation), `/admin/promotions` — content_admin only |
| `pages/support.html` | `POST/GET /support/tickets` — ticket submission + own ticket history |
| `pages/security-settings.html` | `GET/POST /auth/2fa/*` (setup with QR code, confirm, disable), `GET /auth/sessions`, `POST /auth/logout-all` |
| `pages/login.html` / `pages/admin-login.html` | Both now handle the `{requiresTwoFactor: true, challengeToken}` response from login — swapping in a second-step code entry in place, rather than navigating away |

**Notification bell** (`js/modules/notificationBell.js`) is mounted on
every public page (via `Chrome.renderHeader`) and every worker/hirer
dashboard page — unread badge (polls every 30s), dropdown with recent
notifications, click-to-mark-read, and a "mark all read" action, all
against the real `/api/notifications*` endpoints. **Notification
preferences** (email/SMS/in-app toggles) are on `profile-settings.html`,
wired to `GET/PATCH /notifications/preferences`.

## Known gaps (honest, not hidden)

- **QR code rendering depends on a third-party CDN** (`davidshimjs/qrcodejs`
  via cdnjs) rather than a self-hosted asset — if that CDN is
  unreachable, `security-settings.html` falls back to showing the raw
  secret for manual entry (every authenticator app supports typing
  the secret directly), so setup still works, just without the QR
  convenience.

- **Featured placement creation requires pasting a worker's user ID
  by hand** — `admin-settings.html`'s "Add placement" modal has no
  worker search/autocomplete, just a raw UUID field with a hint to
  find the ID from the user-management search on the main dashboard.
  A proper implementation would let the admin search-and-select a
  worker inline.
- **Support tickets are single-response** — matches the backend
  (`support_tickets.admin_response` is one field, not a thread), so
  the admin UI reflects that same simplification rather than
  pretending to be a full helpdesk conversation.

- **Video/audio calling renders now, but is unverified against a live
  server.** `call-room.html` implements a real LiveKit v2 client
  integration (Room connect, track subscribe/attach, mic/camera
  toggle, leave) loaded from the LiveKit CDN, and both `interviews.html`
  and `messages.html` (new "Audio call"/"Video call" buttons) launch
  into it. The token-issuing backend calls are live and tested; the
  WebRTC/browser side of this page has not been — there's no browser
  or LiveKit deployment in this build environment to test camera/mic
  permissions or an actual connection against. **This page needs a
  real-device smoke test before shipping.**
- **Messaging polls every 5 seconds** rather than pushing updates —
  works, but isn't real-time. A WebSocket layer (Socket.io or Supabase
  Realtime) would replace the poll; nothing here blocks adding one.
- **No bank-list lookup** — the wallet withdrawal form hardcodes ~11
  common Nigerian bank codes rather than calling Paystack's `/bank`
  endpoint (would need a backend proxy route, since the frontend
  shouldn't hold a Paystack secret key).
- **Portfolio thumbnails show a placeholder, not the actual uploaded
  image.** Upload works end-to-end (`portfolio.html` → `Upload.uploadPortfolioMedia`
  → `POST /portfolio/:id/media`), but rendering the real thumbnail
  needs either the backend to return a `publicUrl` alongside
  `storage_path` on `GET /portfolio/me`, or the frontend to know the
  Supabase project URL to construct one — neither exists yet, so this
  was left honest rather than guessed.

Everything else called out in the previous pass (review/dispute UI,
verification document upload, portfolio media upload) is now built.

## Running it locally

Static files — any local server works:

```bash
npx serve job-rush-frontend
# or
python3 -m http.server --directory job-rush-frontend
```

Point `js/config/api.js`'s `BASE_URL` at your running backend if it's
not on the same origin (CORS is already configured on the backend for
`APP_BASE_URL`).
