# JOB RUSH — Full Platform

Nigerian professional job/freelancer/artisan marketplace. This archive
contains the complete project: backend API and frontend web app as
sibling folders, matching how they'd sit in a monorepo or two linked
repos.

```
job-rush-platform/
├── backend/     Node.js/Express/PostgreSQL API — see backend/README.md
└── frontend/    Vanilla HTML/CSS/JS web app — see frontend/README.md
```

## Quick start

1. **Backend**: `cd backend`, follow the setup steps in `backend/README.md`
   (env vars, migrations, `npm install`, `npm start`).
2. **Frontend**: `cd frontend`, open `index.html` directly or serve the
   folder with any static file server. It talks to the backend via
   `js/config/api.js` — confirm the base URL there matches wherever
   the backend is running.

Each folder's own README is the source of truth for that half of the
stack — what's built, what's deliberately deferred, and the honest
list of known gaps. This top-level file is just a map, not a duplicate.

## What's in this build

Every module from the project's master spec is implemented on the
backend: auth (with 2FA and Google OAuth), profiles, file storage,
jobs/applications, interviews (with LiveKit video/audio), payments/
escrow/wallet, messaging, reviews/disputes, PRO subscriptions,
notifications, the admin dashboard, suspicious-login detection, and
Gemini-powered smart matching. The frontend has a matching page for
every one of those features across public pages, worker/hirer
dashboards, and the admin portal.

A full security, mobile-responsiveness, and code-quality audit was
run across both halves after the initial build — see each folder's
README for specifics on what was found and fixed.
