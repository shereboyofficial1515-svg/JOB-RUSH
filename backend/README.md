# JOB RUSH — Auth, Users & Profiles

Two modules so far:

1. **Auth & User System** — registration, OTP verification (email via
   Resend, SMS via Termii), login, server-side sessions, RBAC.
2. **Profiles** — worker/hirer profiles, skills, portfolio, location
   (with the Delta-State-only launch restriction enforced server-side),
   and the Verified Professional admin review workflow.

Every other JOB RUSH module (jobs, interviews, payments, admin)
builds on top of these two.

## Why these design choices

**Server-side sessions, not JWTs.** Sessions are rows in a `sessions`
table; the cookie only carries an opaque random token. This makes
logout, "logout all devices," and admin-forced logout instant and
real — a JWT can't be revoked without extra infrastructure. The cookie
is `httpOnly`, `Secure` in production, and `SameSite=Lax`.

**Everything privileged is re-checked server-side, every request.**
`req.user` is populated only from the session lookup in
`middleware/authenticate.js` — never from a header, body field, or
query param the client sends. `middleware/authorize.js` re-queries the
`admin_users` table on every admin-gated request rather than trusting
anything cached on the session.

**Passwords and OTPs are never stored in plaintext.** Passwords use
bcrypt (cost 12, configurable). OTP codes and password-reset tokens
are SHA-256 hashed before hitting the database — only the raw value
sent to the user (in the SMS/email) exists in plaintext, briefly, in
memory.

**Account lockout is separate from IP rate limiting.** IP-based
limits (`express-rate-limit`) slow down brute force from one network;
per-account lockout (`failed_login_attempts` / `locked_until` on the
`users` row) protects a specific account even from a distributed
attacker hitting it from many IPs.

**No enumeration leaks.** Login failures, registration collisions,
and password-reset requests all return the same generic
message/behavior regardless of whether the identifier exists, so an
attacker can't use these endpoints to discover valid accounts.

## Setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL, SESSION_SECRET, RESEND_API_KEY, TERMII_API_KEY
npm run migrate   # applies src/database/migrations/*.sql in order
npm run dev
```

Generate a strong session secret:

```bash
openssl rand -hex 64
```

## What's required before this is production-ready

1. **A real DATABASE_URL** pointing at your Supabase Postgres instance
   (Project Settings → Database → Connection string).
2. **RESEND_API_KEY** and a verified sending domain, or OTP email
   delivery will throw (it does not fake success).
3. **TERMII_API_KEY** and sender ID approval, or SMS OTP will throw.
4. **A shared rate-limit store** (e.g. Redis) if you run more than one
   app instance — the current limiter is in-memory per process. See
   the note in `middleware/rateLimiter.js`.
5. **Assign your first `super_admin`** manually via SQL after
   registering the account normally — there is intentionally no API
   endpoint that can grant admin (that must never be reachable from
   the frontend):
   ```sql
   INSERT INTO admin_users (user_id, admin_role, requires_2fa)
   VALUES ('<user-uuid>', 'super_admin', true);
   ```
   Since `requires_2fa` defaults to `true`, this account is blocked
   from every admin-gated action until it enrolls — see the
   Two-Factor Authentication module below for that flow
   (`POST /api/auth/2fa/setup` → `/2fa/confirm-setup`, both reachable
   with a normal session, no admin access required to enroll).

## Endpoints

| Method | Path                        | Auth        | Purpose |
|--------|-----------------------------|-------------|---------|
| POST   | /api/auth/register          | none        | Create account (pending_verification) |
| POST   | /api/auth/otp/request       | none        | Send OTP via email or SMS |
| POST   | /api/auth/otp/verify        | none        | Verify OTP, activate account field |
| POST   | /api/auth/login             | none        | Password login, issues session cookie |
| POST   | /api/auth/logout            | session     | Revoke current session |
| POST   | /api/auth/logout-all        | session     | Revoke all sessions for the user |
| GET    | /api/auth/me                | session     | Current user, resolved server-side |
| GET    | /api/auth/sessions          | session     | List own active sessions/devices |
| POST   | /api/auth/password/forgot   | none        | Request reset link (email) |
| POST   | /api/auth/password/reset    | none        | Consume token, set new password |

## Using the RBAC middleware in other modules

```js
const { authenticate } = require('./middleware/authenticate');
const { requireRole, requireAdmin, requireSelfParam } = require('./middleware/authorize');

// Only hirers (or worker+hirer accounts) can post a job:
router.post('/jobs', authenticate, requireRole('hirer'), jobsController.create);

// Only a verification_admin (or super_admin) can approve verification:
router.post('/admin/verification/:id/approve', authenticate, requireAdmin('verification_admin'), ...);

// A user can only view their own wallet, never someone else's by ID:
router.get('/wallet/:userId', authenticate, requireSelfParam('userId'), walletController.get);
```

## Profiles module

| Method | Path                                       | Auth                    | Purpose |
|--------|---------------------------------------------|-------------------------|---------|
| GET    | /api/profiles/worker/:userId                | none                    | Public worker profile |
| GET    | /api/profiles/worker/me                     | worker                  | Own worker profile |
| PATCH  | /api/profiles/worker/me                     | worker                  | Update own profile (whitelisted fields only) |
| GET    | /api/profiles/hirer/:userId                 | none                    | Public hirer profile |
| GET    | /api/profiles/hirer/me                      | hirer                   | Own hirer profile |
| PATCH  | /api/profiles/hirer/me                      | hirer                   | Update own profile |
| GET    | /api/portfolio/worker/:workerUserId         | none                    | Public portfolio |
| GET    | /api/portfolio/me                           | worker                  | Own portfolio list |
| POST   | /api/portfolio                              | worker                  | Create project |
| PATCH  | /api/portfolio/:id                          | worker (owner)          | Update project |
| DELETE | /api/portfolio/:id                          | worker (owner)          | Delete project |
| POST   | /api/portfolio/:id/media                    | worker (owner)          | Attach media (post-upload) |
| DELETE | /api/portfolio/:id/media/:mediaId           | worker (owner)          | Remove media |
| GET    | /api/locations/states                       | none                    | Active states only |
| GET    | /api/locations/states/:stateId/lgas         | none                    | LGAs in a state |
| GET    | /api/locations/lgas/:lgaId/areas            | none                    | Areas in an LGA |
| POST   | /api/verification/submit                    | worker                  | Submit verification docs |
| GET    | /api/verification/me                        | worker                  | Own verification status |
| GET    | /api/admin/verification/pending             | verification_admin      | Review queue |
| GET    | /api/admin/verification/:id/documents       | verification_admin      | View submitted docs |
| POST   | /api/admin/verification/:id/approve         | verification_admin      | Approve → Verified badge |
| POST   | /api/admin/verification/:id/reject          | verification_admin      | Reject / request resubmission |

**Trust fields are never client-writable.** `verification_status`,
`is_pro`, `rating_avg`, `completed_jobs_count`, etc. are absent from
`profileService`'s editable-field whitelist entirely — there's no
validation branch to bypass, because the update query can't reach
those columns no matter what the request body contains.

**Location restriction is data-driven, not hard-coded.** Only states
with `is_active = true` are selectable (seeded with Delta State
active, everything else inactive). Expanding to a new state later is
a row update, not a code change — satisfying business rule #16/#47.

**Verification documents stay admin-only.** There is no worker-facing
endpoint that returns `verification_documents` rows — only the
`verification_admin`-gated routes can fetch them, and `storage_path`
values are meant to be resolved into short-lived signed URLs by the
storage module, never public links.

## What's still needed for profiles to be complete

- The actual **storage module** (Supabase Storage upload endpoint with
  MIME/size/signature validation) that `portfolioService` and
  `verificationService` assume already ran before they receive a
  `storagePath`.
- **Signed URL generation** for private verification documents when an
  admin views them.
- Seed data for `lgas`/`areas` under Delta State, and for `categories`/
  `skills` — this module ships the schema and seeds the states table
  only.

## Storage module (Supabase Storage)

Handles every file upload in the app so far: portfolio images/video,
profile pictures, and verification documents. All uploads are
validated server-side before anything reaches Supabase — the original
filename is discarded and never trusted, replaced with a random UUID.

| Method | Path                                  | Auth           | Bucket (public/private) |
|--------|----------------------------------------|----------------|--------------------------|
| POST   | /api/storage/portfolio/image          | worker         | portfolio-media (public) |
| POST   | /api/storage/portfolio/video          | worker         | portfolio-media (public) |
| POST   | /api/storage/profile-picture          | worker or hirer| profile-pictures (public) |
| POST   | /api/storage/verification-document    | worker         | verification-documents (**private**) |

All four accept `multipart/form-data` with the file in a `file` field
(and `documentType` in the body for the verification endpoint).

**What's actually checked, in order:**
1. Multer caps the raw upload at 100MB and buffers it in memory only
   — never written to local disk.
2. `storageService` enforces a *category*-specific size ceiling
   (images 8MB, video 100MB, documents 15MB) and MIME allowlist.
3. `fileValidation.js` sniffs the first bytes of the file and checks
   them against the claimed MIME type (magic-byte check) — a `.exe`
   renamed to `photo.jpg` fails here even if the MIME header lies.
4. The stored filename is `{randomUUID}.{validated-extension}` under
   a path prefixed with the uploader's own user ID — the client's
   filename never appears in the stored path.

**Public vs private is enforced at the bucket level, not by
convention.** `uploadVerificationDocument` always uploads to the
private bucket and its response never includes a `publicUrl` field —
there's no code path in `storageService` that can generate one for
that bucket. Reading a verification document back always goes through
`getSignedUrl`, which the verification-review endpoint
(`GET /api/admin/verification/:id/documents`) already uses to return
5-minute signed links instead of raw storage paths.

### Required Supabase setup this module assumes

Create three buckets in your Supabase project, matching
`storageService.BUCKETS`:

| Bucket name              | Public? |
|---------------------------|---------|
| `portfolio-media`         | Yes |
| `profile-pictures`        | Yes |
| `verification-documents`  | **No** |

The service role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses bucket
RLS/policies, which is why `config/supabase.js` is the only place in
the codebase allowed to import it, and why that key must never reach
the frontend.

### What's still needed

- **Chat media bucket** (private, spec section 52) — not built yet,
  same pattern as verification documents will apply.
- **Cleanup on delete** — `portfolioService.removePortfolioMedia` has
  a hook-point comment where a call to `storageService.deleteObject`
  should go once that wiring is added, so orphaned objects don't pile
  up in the bucket.
- **Image resizing/optimization** (spec section 46/73) — currently
  uploads are stored as-is; a resize step would go in `storageService`
  before the upload call.

## Jobs & Applications module

Two-directional hiring flow: a worker can apply to an open job, or a
hirer can invite a specific worker directly. Both produce a row in
the same `applications` table, and every subsequent transition
(shortlist, reject, hire, accept, decline, withdraw) goes through a
single state-machine function (`applicationService.transition`) keyed
by who's allowed to do what — there's no code path that writes a
status directly.

| Method | Path                                    | Auth            | Purpose |
|--------|-------------------------------------------|-----------------|---------|
| GET    | /api/jobs                                 | none            | Search open jobs (category, skill, location, budget, keyword) |
| GET    | /api/jobs/:id                             | none            | Job detail |
| GET    | /api/jobs/mine                            | hirer           | Own postings, any status |
| POST   | /api/jobs                                 | hirer           | Create job |
| PATCH  | /api/jobs/:id                             | hirer (owner)   | Update job |
| POST   | /api/jobs/:id/status                      | hirer (owner)   | open/closed/filled/cancelled |
| POST   | /api/jobs/:jobId/applications              | worker          | Apply to an open job |
| GET    | /api/jobs/:jobId/applications              | hirer (owner)   | Review applicants |
| POST   | /api/jobs/:jobId/invitations                | hirer (owner)   | Invite a specific worker |
| GET    | /api/applications/me                       | worker          | Own applications/invitations |
| POST   | /api/applications/:id/withdraw             | worker (owner)  | Withdraw |
| POST   | /api/applications/:id/respond              | worker (owner)  | Accept/decline an invitation |
| POST   | /api/applications/:id/shortlist            | hirer (job owner)| |
| POST   | /api/applications/:id/reject               | hirer (job owner)| |
| POST   | /api/applications/:id/hire                 | hirer (job owner)| Marks the job filled |
| POST/DELETE | /api/jobs/:jobId/save                 | worker          | Bookmark a job |
| GET    | /api/saved-jobs                            | worker          | Own bookmarked jobs |
| POST/DELETE | /api/saved-profiles/:workerUserId     | hirer           | Bookmark a worker |
| GET    | /api/saved-profiles                        | hirer           | Own bookmarked workers |

**Ownership over role.** `requireRole('hirer')` on a route only proves
the caller is *a* hirer — every mutating job/application function
additionally re-checks that *this specific* job belongs to `req.user.id`
(`jobService.getOwnedJob`, `applicationService.getApplicationForHirerJob`).
A hirer can never shortlist or reject an applicant on someone else's
posting by guessing an ID.

**Search filters are parameterized against a fixed column set.**
`jobService.searchJobs` never interpolates a client-supplied column
name into SQL — only values go through placeholders, and which
columns can be filtered/sorted on is a hardcoded list.

**Duplicate applications/invitations are a database constraint, not
just an application check** — `applications` has `UNIQUE (job_id,
worker_user_id)`, so even a race condition (two rapid requests) can't
create two rows; the second insert fails cleanly and the service
turns that into a normal 409 response.

## Interview module

The flagship feature: scheduling, invitation response, reschedule
requests, LiveKit video/audio calling, hirer-only prep questions,
private notes, and post-interview evaluation.

| Method | Path                                    | Auth                | Purpose |
|--------|-------------------------------------------|---------------------|---------|
| GET    | /api/interviews/upcoming                  | either participant  | Dashboard: pending/scheduled |
| GET    | /api/interviews/past                      | either participant  | Dashboard: completed/cancelled/etc |
| POST   | /api/interviews                           | hirer               | Schedule (from applicationId or workerUserId+jobId) |
| GET    | /api/interviews/:id                       | participant         | Detail (location hidden until accepted) |
| GET    | /api/interviews/:id/events                | participant         | Lifecycle timeline |
| POST   | /api/interviews/:id/respond               | worker (invitee)    | Accept/decline |
| POST   | /api/interviews/:id/reschedule/request    | either participant  | Request a new time |
| POST   | /api/interviews/:id/reschedule/confirm    | hirer               | Confirm the new time |
| POST   | /api/interviews/:id/cancel                | either participant  | Cancel |
| POST   | /api/interviews/:id/complete              | hirer               | Mark completed |
| POST   | /api/interviews/:id/no-show               | hirer               | Mark no-show |
| GET    | /api/interviews/:id/call-token            | participant         | Short-lived LiveKit token (see below) |
| POST   | /api/interviews/:id/leave                 | participant         | Log a leave event |
| GET/POST/PATCH/DELETE | /api/interviews/:id/questions[/:questionId] | hirer      | Prep questions |
| GET/POST/PATCH/DELETE | /api/interviews/:id/notes[/:noteId]         | hirer      | Private notes |
| GET/PUT | /api/interviews/:id/evaluation           | hirer               | Post-interview evaluation (upsert) |

**The call-token endpoint is the security-critical path (spec section
36).** Before any LiveKit token is issued, `getCallToken` checks, in
order: (1) the caller is a listed participant on *this* interview via
`interview_participants` — not just "logged in," (2) the interview
type actually uses calling, (3) status is `scheduled` or
`in_progress`, (4) the current time falls inside a join window (15
minutes before the scheduled start through 15 minutes past the
scheduled end). Only after all four pass does `livekitService` sign a
token — scoped to one room, one identity, no recording/admin grants,
expiring in 10 minutes. `LIVEKIT_API_SECRET` never leaves
`livekitService.js`.

**Authorization is participant-based, not role-based.**
`interviewService.assertParticipant` is the single gate nearly every
function in this module runs through — it checks
`interview_participants`, not `req.user.role`. That's deliberate:
"hirer" and "worker" are account-level roles, but "may this specific
person touch this specific interview" is a per-row fact, and every
hirer-only action (`markCompleted`, `confirmReschedule`, notes,
evaluation) additionally checks `caller_role === 'hirer'` *from that
same row* rather than trusting the account role.

**In-person location is not exposed prematurely.** `getById` blanks
`location_address`/`location_instructions` unless the interview has
reached `scheduled`, `in_progress`, or `completed` — a worker who
hasn't accepted an in-person interview invitation doesn't get the
hirer's address just by requesting the record.

**Private notes and evaluations have no worker-facing path at all** —
not "hidden by a flag," but structurally: `interviewNoteService` and
`interviewEvaluationService` only ever check `caller_role === 'hirer'`
and there is no route anywhere that calls them without that check.

### What's still needed

- **Reminders** (24h/1h/15min before, spec section 40) — needs the
  notification module (in-app/email/SMS) and a scheduled job runner,
  neither of which exist yet.
- **Interview ↔ messaging link** ("Open Conversation") — needs the
  messaging module.
- **Automatic `starting_soon`/`expired` status transitions** — the
  schema supports these statuses but nothing currently flips them on
  a timer; that's a scheduled job, not a request-driven action.
- **Contract creation on hire** — `applicationService.hireApplication`
  (previous module) marks an application hired and the job filled;
  linking that moment to interview outcomes and generating a contract
  belongs to the payments/contracts module.

## Payments, Wallet & Escrow module

Contract → fund → escrow → release, plus worker withdrawals. This is
the highest-stakes module in the codebase — real money moves through
Paystack — so every mutating action either re-verifies against
Paystack's own API, holds a DB row lock, or both.

| Method | Path                                    | Auth                  | Purpose |
|--------|-------------------------------------------|-----------------------|---------|
| POST   | /api/contracts                            | hirer                 | Create from a hired application |
| GET    | /api/contracts / /:id                     | party to it           | List / detail |
| POST   | /api/escrow/fund                          | hirer                 | Start funding (returns Paystack authorization_url) |
| GET    | /api/escrow/verify/:reference             | hirer                 | Manual fallback verify after redirect |
| POST   | /api/escrow/:id/release                   | hirer (owner)         | Release to worker's wallet, minus fee |
| GET    | /api/escrow/contract/:contractId          | party to it           | Escrow history for a contract |
| POST   | /api/escrow/:id/refund                    | finance_admin         | Real refund via Paystack — admin only |
| POST   | /api/escrow/webhook                       | Paystack (signed)     | charge.success confirmation |
| GET    | /api/wallet                               | any user              | Own balance |
| GET    | /api/wallet/transactions                  | any user              | Own ledger |
| POST   | /api/wallet/withdrawals                   | worker                | Request withdrawal (holds funds immediately) |
| GET    | /api/wallet/withdrawals / /:id            | worker                | Own withdrawal history |
| GET    | /api/admin/finance/withdrawals/pending    | finance_admin         | Review queue |
| POST   | /api/admin/finance/withdrawals/:id/approve| finance_admin         | Triggers real Paystack transfer |
| POST   | /api/admin/finance/withdrawals/:id/reject | finance_admin         | Reverses the wallet hold |
| GET/PATCH | /api/admin/finance/settings[/fee]      | finance_admin         | Configurable platform fee (business rule #6) |

**Nothing is trusted from the frontend about payment success.**
`initiateEscrowFunding` only ever creates `pending` rows; the escrow
becomes `funded` exclusively inside `finalizeFunding`, which calls
Paystack's `/transaction/verify` endpoint itself. That function is
shared by both the webhook handler and the manual verify-by-reference
fallback, and is idempotent by construction — its `UPDATE ... WHERE
status = 'pending'` guard means a second call (webhook arrives after
the user already verified manually, or vice versa) finds zero rows
and does nothing, so a payment can never be credited twice.

**The webhook signature is checked against the raw body.** `server.js`
mounts `/api/escrow/webhook` with `express.raw()` *before* the global
`express.json()` middleware specifically so `verifyWebhookSignature`
sees the exact bytes Paystack signed — a re-parsed-then-restringified
body would produce a different HMAC and silently break verification.

**Wallet balance changes only ever happen through `walletService`,
under a row lock.** `creditWallet`/`debitWallet` run `SELECT ... FOR
UPDATE` before touching the balance, and write the ledger row in the
same transaction as the balance update — there is no other code path
in the module that writes to `wallets.available_balance` directly.
Verified with real fee-split arithmetic across several amounts to
confirm the DB's `platform_fee_amount + worker_payout_amount = amount`
constraint always holds (no floating-point drift).

**Withdrawal funds are held on request, not on approval.** Requesting
a withdrawal immediately debits the wallet (`withdrawal_hold`), so a
worker can't request two withdrawals against the same balance while
the first is pending review. A rejection or failed transfer reverses
the hold (`withdrawal_reversed`); a successful transfer leaves the
funds debited (they've genuinely left).

**Bank account numbers are never persisted.** `requestWithdrawal`
uses the raw account number only to call Paystack's
`createTransferRecipient`; only the last 4 digits and the resulting
`recipient_code` are written to the database.

**Refunds are admin-only**, reachable through `finance_admin`, not
through either party — real money movement back to a card should go
through an approval step, not a hirer/worker self-service endpoint.

### What's still needed

- **Milestone-level funding/release** — the schema supports
  `escrow_transactions.milestone_id`, but this pass only implements
  whole-contract escrow; a milestone flow would reuse the same
  `escrowService` functions with a `milestoneId` filter added to the
  queries.
- **`transfer.success`/`transfer.failed` webhook handling** — withdrawal
  status currently updates synchronously based on the initial Paystack
  API response; a webhook handler for async transfer confirmation
  would make this more robust for transfers that settle after the
  initial call returns.
- **Disputes** tied to a contract/escrow (spec section 60) — deferred
  to the Reviews & Disputes module.
- **Reconciliation job** — a scheduled task to catch any `pending`
  payment that never got a webhook or manual verify call (e.g. the
  hirer closed the tab) is not built; `finalizeFunding` is ready to be
  called from one once it exists.

## Messaging & Calling module

1-to-1 chat with media, blocking, reporting, and LiveKit audio/video
calling initiated from a conversation — reusing the same "verify
first, sign second" pattern the interview module established.

| Method | Path                                                | Auth        | Purpose |
|--------|-------------------------------------------------------|-------------|---------|
| GET    | /api/messaging/conversations                          | any user    | List own, with unread counts + last-message preview |
| POST   | /api/messaging/conversations                          | any user    | Get-or-create with another user |
| POST   | /api/messaging/conversations/:id/read                 | participant | Mark read |
| POST   | /api/messaging/conversations/:id/clear                | participant | Per-user "clear chat" |
| GET    | /api/messaging/conversations/:id/messages              | participant | Paginated history |
| POST   | /api/messaging/conversations/:id/messages              | participant | Send (text and/or media) |
| PATCH  | /api/messaging/messages/:messageId                     | sender      | Edit — **20-minute window enforced server-side** |
| DELETE | /api/messaging/messages/:messageId                     | sender      | Soft delete |
| POST   | /api/messaging/messages/:messageId/report              | participant | Report |
| GET    | /api/messaging/messages/search                         | any user    | Search own messages |
| GET    | /api/messaging/messages/:messageId/media/:mediaId/url  | participant | Signed URL for private chat media |
| POST/GET/DELETE | /api/messaging/block[/​:userId]               | any user    | Block/unblock/list |
| POST   | /api/messaging/conversations/:conversationId/calls     | participant | Initiate a call |
| POST   | /api/messaging/calls/:id/status                        | call party  | State-machine transition |
| GET    | /api/messaging/calls/:id/token                         | call party  | LiveKit token (see below) |
| POST   | /api/storage/chat/:mediaCategory                       | any user    | Upload chat media (private bucket) |

**The 20-minute edit window is computed server-side from
`messages.created_at` at request time** (`messageService.editMessage`)
— never trusted from the client, and not bypassable by anything the
frontend does or doesn't show.

**Blocking is checked at three points, not one**: creating a new
conversation, sending any message in an existing one, and initiating
a call. A block applied mid-conversation takes effect immediately —
there's no cached "already connected" state that lets messages
through after the fact.

**Calls reuse the interview module's call-token security pattern
exactly**: `callService.getCallToken` checks participant membership,
then call status (`ringing`/`connecting`/`connected` only), *before*
calling into `livekitService` — which was generalized (not
duplicated) from the interview module: `createAccessToken` is now the
shared low-level signer, with `createInterviewAccessToken` and
`createCallAccessToken` as thin wrappers producing differently-named
rooms (`interview-<id>` vs `call-<id>`). Verified both produce
distinct, valid tokens from the same underlying function.

**Chat media is private by default.** Images, video, documents, and
voice notes go to the same kind of private bucket as verification
documents (`chat-media`) — there is no public URL for chat
attachments anywhere in the code; every retrieval goes through
`getMediaUrl`, which re-checks conversation participancy before
issuing a 5-minute signed URL.

**"Clear chat" never deletes anything.** It sets
`conversation_participants.cleared_before` for the requesting user
only — the other participant's view, and the actual message rows,
are untouched. A real delete (sender removing their own message) is
a separate, always-available action that soft-deletes for everyone.

### What's still needed

- **Typing indicators and live online/offline presence** — these are
  inherently realtime and need a WebSocket layer (Socket.io or
  Supabase Realtime) that this REST-only module doesn't include;
  nothing here blocks adding one, but it's a separate piece of
  infrastructure, not an endpoint.
- **`transfer`-style async call-quality events** (reconnecting due to
  network issues) — the `reconnecting` status exists in the schema and
  state machine but nothing currently drives it automatically; that's
  client-side LiveKit event handling calling `POST /calls/:id/status`.
- **Admin moderation surface for message reports** — `reportService`
  has `listReports()` ready, but no admin route calls it yet; belongs
  with the Admin Dashboard module.

## Reviews & Disputes module

Hirer-to-worker reviews after a completed contract, plus a dispute
workflow that ties back into the escrow module for the actual
financial outcome.

| Method | Path                                    | Auth                | Purpose |
|--------|-------------------------------------------|---------------------|---------|
| GET    | /api/reviews/worker/:workerUserId         | none                | Public reviews for a worker |
| POST   | /api/reviews                              | hirer               | Leave a review (contract must be completed) |
| POST   | /api/reviews/:id/report                   | any user            | Report a review |
| GET    | /api/admin/reviews/reported               | moderation_admin    | Review queue |
| POST   | /api/admin/reviews/:id/hide               | moderation_admin    | Suppress from public listing |
| GET    | /api/disputes                             | party to it         | Own disputes |
| POST   | /api/disputes                             | party to a contract | Open a dispute |
| GET    | /api/disputes/:id                         | party to it         | Detail |
| POST/GET | /api/disputes/:id/evidence               | party to it         | Upload/list evidence |
| GET    | /api/admin/disputes[?status=]             | support_admin       | Queue |
| GET    | /api/admin/disputes/:id/evidence          | support_admin       | Review evidence |
| POST   | /api/admin/disputes/:id/status            | support_admin       | Move to under_review/awaiting_information |
| POST   | /api/admin/disputes/:id/resolve           | support_admin       | **Real financial outcome** — release or refund |
| POST   | /api/admin/disputes/:id/reject            | support_admin       | Reject with no financial action |
| POST   | /api/storage/dispute-evidence/:category   | party to a dispute  | Upload evidence (private bucket) |

**`worker_profiles.rating_avg`/`rating_count` are written from exactly
one place** — `reviewService.recalculateWorkerRating`, called after
every review creation and every admin hide action. This is
consistent with the profiles module's design: those columns were
structurally excluded from the worker's own editable-field whitelist
back when profiles were built, and this module is the trusted writer
that whitelist was designed to allow.

**Opening a dispute automatically freezes the escrow.** If the
contract's escrow is currently `funded`, `openDispute` flips it to
`disputed` in the same transaction — `escrowService.releaseEscrow`
and `refundEscrow` both already reject any status other than `funded`
(or, now, `disputed` for the admin-only paths), so neither party can
release or self-refund money while a dispute is being reviewed.

**Dispute resolution reuses the escrow module rather than
duplicating money-movement logic.** `resolveDispute` calls either
`escrowService.adminForceRelease` (new — an admin-triggered release
that doesn't check hirer ownership, since overriding the hirer's
decision is the entire point) or the existing `refundEscrow`. Real
money only ever moves through those two escrow functions, regardless
of whether the trigger was a normal hirer release or a dispute
resolution.

**Evidence is private by default** — a new `dispute-evidence` bucket
follows the same pattern as verification documents and chat media:
no public URL, access gated by `getOwnedDispute`'s participant check
(or `support_admin` on the admin path).

### What's still needed

- **Escalation handling** — the `escalated` status exists in the enum
  but nothing currently automates what happens next (e.g. routing to
  a `super_admin` or an external process); it's available for the
  Admin Dashboard module to build a queue around.
- **Bidirectional reviews** — the spec (section 59) only describes
  hirer-rates-worker; if worker-rates-hirer is wanted later, it's a
  straightforward mirror of this service, not a redesign.
- **Notifying the other party** when a dispute opens, a review is
  left, or a resolution lands — depends on the Notifications module.

## PRO Subscriptions module

₦4,000/month recurring subscription, built on Paystack's Plans/
Subscriptions API rather than manually re-billing cards — Paystack
handles the actual recurring charge; this module just verifies and
reacts to what Paystack reports.

| Method | Path                                       | Auth          | Purpose |
|--------|-----------------------------------------------|---------------|---------|
| POST   | /api/subscriptions                            | worker        | Start PRO purchase (returns authorization_url) |
| GET    | /api/subscriptions/verify/:reference          | worker        | Manual fallback verify after redirect |
| GET    | /api/subscriptions/me                         | worker        | Own subscription (lazily expires if past due) |
| GET    | /api/subscriptions/me/payments                | worker        | Own billing history |
| POST   | /api/subscriptions/me/cancel                  | worker        | Stop auto-renew (PRO stays active until period ends) |
| GET    | /api/admin/subscriptions[?status=]            | finance_admin | List all |
| GET    | /api/admin/subscriptions/revenue              | finance_admin | Total PRO revenue |
| POST   | /api/admin/subscriptions/:id/suspend          | finance_admin | Immediate revocation (abuse/policy) |

**One shared Paystack webhook, not two.** Paystack only supports a
single webhook URL per account, so `POST /api/escrow/webhook` (built
in the payments module) now dispatches to *both*
`escrowService.handleWebhookEvent` and
`subscriptionService.handleWebhookEvent` — each ignores event types
it doesn't care about. The raw-body signature verification happens
once, before either handler runs.

**Initial payment and renewals are handled differently, and safely.**
The first payment goes through `finalizeInitialPayment` — the same
verify-then-activate, idempotent-by-`WHERE status = 'pending'` pattern
as escrow funding. Renewal charges arrive as `charge.success` webhooks
for a reference this platform never initiated (Paystack auto-billed
the card), so they're matched to the existing subscription by
customer email and recorded by `recordRenewalPayment` — also
idempotent, guarded by checking `subscription_payments` for that
reference first.

**`is_pro`/`pro_expires_at` have exactly one writer**:
`subscriptionService`'s `activateProOnProfile`/`deactivateProOnProfile`
— continuing the same "one trusted writer per trust field" pattern as
`verification_status` (verification module) and `rating_avg` (reviews
module).

**Cancellation isn't the same as expiry**, per business rule #11.
Cancelling stops `auto_renew` and calls Paystack's
`/subscription/disable`, but PRO access continues until the already-
paid `expiry_date` passes — at which point `syncExpiry`'s lazy check
(run on every `getOwnSubscription` call) flips `is_pro` to false.

### What's still needed

- **A real scheduled expiry job.** `syncExpiry` only runs when a
  subscription is *read* — a worker who never checks their own PRO
  status keeps `is_pro = true` past their actual expiry until
  something reads it (their next profile view, a search appearance,
  etc.). A cron job calling `syncExpiry` for all active subscriptions
  nightly would close this gap; the function is ready for that
  caller.
- **PRO visibility boost in search** — resolved. `GET /api/profiles/worker/search`
  was added (in the frontend pass) with `ORDER BY is_pro DESC, rating_avg DESC, ...`,
  giving PRO the ranking boost spec section 26 describes without letting
  it override relevance — the boost only reorders within whatever the
  filters already matched. See `profileService.searchWorkers`.
- **PRO analytics** (profile views, search appearances, etc., spec
  section 25.6) — needs an events/analytics table this pass doesn't
  include.

## Notifications module

In-app notification feed plus email/SMS dispatch, triggered from
real events across nine other modules rather than existing as an
isolated, unused piece.

| Method | Path                              | Auth      | Purpose |
|--------|-------------------------------------|-----------|---------|
| GET    | /api/notifications                  | any user  | List own (paginated, `?unreadOnly=true` filter) |
| GET    | /api/notifications/unread-count     | any user  | Badge count |
| POST   | /api/notifications/:id/read         | any user  | Mark one read |
| POST   | /api/notifications/read-all         | any user  | Mark all read |
| GET/PATCH | /api/notifications/preferences   | any user  | Per-channel opt-out (email/SMS/in-app) |

**One function, reused by every trigger.** `notificationService.notifyUser(userId, type, {...})`
looks up the recipient's email/phone, checks their preferences, and
attempts delivery on whichever channels that notification `type`'s
policy allows (`CHANNEL_POLICY` — a new chat message never goes out
over SMS, but an interview reminder or a payment landing does; this
is a deliberate product judgment kept in one place, not scattered
across call sites). It never throws — every call site fires it with
`.catch(() => {})`, so a failed email or a down SMS provider can never
break the message send, hire decision, or payment that triggered it.

**A delivery record is written per channel attempted**, distinguishing
`sent` / `failed` / `skipped` (channel disabled, or no email/phone on
file) — `skipped` is normal and expected, `failed` is the one worth
alerting ops on, and keeping them apart means a dashboard built on
`notification_deliveries` later doesn't have to guess which is which.

**Real trigger points wired in this pass** (verified — every one of
these was actually added to the relevant service and the whole
backend re-syntax-checked and boot-tested afterward, not just
sketched):

- `messageService.sendMessage` → recipient, `new_message` (in-app only)
- `applicationService`: apply → hirer `application_received`; invite → worker `job_invitation`; shortlist/reject/hire → worker `application_status_changed`; invitation accept/decline → hirer `application_status_changed`
- `interviewService`: schedule → worker `interview_scheduled`; respond → hirer `interview_response`; cancel → the other participant `interview_cancelled`
- `escrowService`: funding confirmed → worker `escrow_funded`; release (hirer-initiated) → worker `escrow_released`
- `withdrawalService`: approved/paid → worker `withdrawal_approved`; rejected → worker `withdrawal_rejected`
- `verificationService`: approved/rejected → worker
- `subscriptionService`: initial activation → worker `subscription_activated`; lazy-expiry trip → worker `subscription_expired`
- `reviewService.createReview` → worker `review_received`
- `disputeService`: opened → the other party `dispute_opened`; resolved → both parties `dispute_resolved`

### What's still needed

- **`interview_reminder` (24h/1h/15min before) is defined in the type
  enum and channel policy but has no caller** — this needs a scheduled
  job (cron or a worker queue), which this request-driven backend
  doesn't have. Same gap already noted in the interview module's
  README; `notificationService.notifyUser` is ready for that job to
  call once it exists.
- **Renewal payments don't notify** (only the *first* PRO payment does)
  — a deliberate choice to avoid a monthly SMS/email for every
  automatic renewal, but worth revisiting if users want a receipt each
  cycle.
- **`admin_login` / `password_changed` type notifications** aren't
  wired — security-relevant account events currently only go to
  `admin_audit_logs`, not to the user's own notification feed.
- **No per-category preference granularity** — `notification_preferences`
  is three global toggles (email/SMS/in-app), not "email me for
  messages but not for reviews." That's a real product simplification,
  not an oversight; revisit if it matters.
- **Preferences and the notification feed itself now have a frontend**
  — a bell/dropdown on every page plus a preferences panel on
  profile settings, built in the frontend pass after this module.

## Admin Dashboard module

General user management, platform analytics, category/location
management, job moderation, support tickets, and promotional
placements — the pieces spec sections 67-68 describe that don't
belong inside any single domain module.

| Method | Path                                          | Auth              | Purpose |
|--------|--------------------------------------------------|-------------------|---------|
| GET    | /api/admin/users[?keyword=&role=&accountStatus=] | support_admin     | Search/browse all users |
| GET    | /api/admin/users/:id                             | support_admin     | Full account detail |
| POST   | /api/admin/users/:id/suspend                     | support_admin     | Reversible — revokes all sessions |
| POST   | /api/admin/users/:id/disable                     | support_admin     | More permanent — revokes all sessions |
| POST   | /api/admin/users/:id/reactivate                  | support_admin     | Restore to active |
| GET    | /api/admin/analytics/summary                     | any admin         | Platform-wide metrics (spec section 68) |
| GET/POST/PATCH | /api/admin/categories[/​:id]                | content_admin     | Category CRUD |
| GET/POST/PATCH | /api/admin/skills[/​:id]                    | content_admin     | Skill CRUD |
| GET/PATCH | /api/admin/locations/states[/​:id]            | content_admin     | Enable/disable states — the entire nationwide-expansion mechanism |
| POST   | /api/admin/locations/states/:stateId/lgas        | content_admin     | Add an LGA |
| POST   | /api/admin/locations/lgas/:lgaId/areas           | content_admin     | Add an area |
| POST   | /api/jobs/:jobId/report                          | any user          | Report a job |
| GET    | /api/admin/jobs/reported                         | moderation_admin  | Moderation queue, grouped by job with report counts |
| GET    | /api/admin/jobs/:jobId/reports                   | moderation_admin  | Individual reports for one job |
| POST   | /api/admin/jobs/:jobId/remove                    | moderation_admin  | Cancels the job regardless of hirer ownership |
| POST/GET | /api/support/tickets[/​:id]                    | any user          | Submit / view own tickets |
| GET/POST | /api/admin/support/tickets[/​:id]/respond      | support_admin     | Queue + single-response resolution |
| GET    | /api/promotions/:placementType                   | none              | Public: active featured workers for homepage/category/location/spotlight |
| GET/POST/DELETE | /api/admin/promotions[/​:id]               | content_admin     | Curate featured placements |

**User suspend/disable immediately revokes every active session** —
not just a status flag flip. Both actions run the same
`UPDATE sessions SET revoked_at = now() ... WHERE user_id = $1 AND revoked_at IS NULL`
used by password-change and logout-all-devices, so a suspended user
is logged out everywhere on the next request, not just blocked from
future logins.

**Job removal has a real admin override, not a workaround.**
`jobService.adminSetJobStatus` is a new function with no ownership
check at all — deliberately separate from the existing
`setJobStatus` (which always checks `getOwnedJob` first) rather than
adding an `isAdmin` bypass flag to the hirer-facing function. Only
`jobReportService.adminRemoveJob`, gated by `moderation_admin`, ever
calls it.

**Location expansion beyond Delta State is genuinely just a data
change now.** `PATCH /api/admin/locations/states/:id` flips
`is_active`, and every existing location-aware query (profile
search, job search, registration flow) already reads that same flag
— this endpoint didn't require touching any of that logic, only
exposing the toggle spec business rule #16 depends on.

**Analytics is one call, eighteen small queries run in parallel** —
`adminAnalyticsService.getDashboardSummary` rather than one large
join, so adding a nineteenth metric later is a one-line addition, not
a query rewrite.

### What's still needed

- **No frontend for any of this** — search/suspend UI, the analytics
  dashboard, category/location editors, job moderation queue, support
  ticket inbox, and promotion management all need pages built,
  following the same admin-dashboard.html pattern already established
  for verification/finance/disputes/subscriptions/reviews.
- **Support tickets are single-response, not a thread** — one
  `admin_response` field, not a message-by-message conversation. Fine
  for simple cases; a real helpdesk thread would need its own table.
- **No user "edit" endpoint** — spec section 67 lists "Edit" under
  user management; this pass covers search/view/suspend/disable/
  reactivate, but not an admin editing a user's own profile fields
  directly (email, phone, name). That's a meaningful capability gap
  if support needs to fix a typo'd email for someone locked out.
- **No user "delete" endpoint** — deliberately not built without a
  clear data-retention policy decision (cascade deletes here touch
  jobs, contracts, payments, messages — a real design question, not
  an oversight).
- **Placement ranking/display logic lives entirely on whichever
  frontend page reads `GET /api/promotions/:placementType`** — the
  backend just returns "who's currently featured for this section,"
  it doesn't decide layout or how many to show alongside organic
  results.

## Two-Factor Authentication (2FA) module

TOTP-based 2FA (Google Authenticator / Authy compatible), available
to any account, with backup codes for recovery — and the mechanism
that finally enforces `admin_users.requires_2fa`, a column that has
existed since the very first auth module but was never actually
checked anywhere until now.

| Method | Path                          | Auth      | Purpose |
|--------|----------------------------------|-----------|---------|
| POST   | /api/auth/login                  | none      | Unchanged endpoint — now returns `{requiresTwoFactor: true, challengeToken}` instead of a session if the account has 2FA enabled |
| POST   | /api/auth/2fa/verify-login        | none      | Second step: challenge token + code → real session |
| POST   | /api/auth/2fa/setup               | any user  | Generates a secret + `otpauth://` URL for a QR code |
| POST   | /api/auth/2fa/confirm-setup       | any user  | First code from the app → enables 2FA, returns 10 backup codes **once** |
| POST   | /api/auth/2fa/disable             | any user  | Requires a valid current code (TOTP or backup) — a hijacked session alone can't turn it off |
| GET    | /api/auth/2fa/status              | any user  | Whether 2FA is currently enabled |

**Verified end-to-end, not just syntax-checked.** Ran the actual
`otplib` generate → verify cycle (a real code was generated and
confirmed to validate, a wrong code confirmed to fail) and the backup
code lifecycle (generate → hash → match → single-use removal → reused
code correctly rejected) as standalone checks against the real logic
this module uses, not just confirming the files parse.

**Enforcement lives in `requireAdmin`, not just at login.** An admin
whose role has `requires_2fa = true` but hasn't enrolled is blocked
from *every* admin-gated action with a `TWO_FACTOR_REQUIRED` error,
not merely nudged once when they sign in — `requireAdmin` now joins
`user_two_factor` on every single call, the same "re-check fresh every
request" pattern already used for admin role membership itself.

**No chicken-and-egg lockout.** The `/2fa/setup` and `/2fa/confirm-setup`
endpoints only require `authenticate`, not `requireAdmin` — an admin
blocked from admin actions by the new check can still reach these to
enroll. The flow for a brand-new super_admin (created via the manual
SQL insert described in the auth module's README) is: log in normally
(their own account has no 2FA yet, so login succeeds immediately) →
call `/2fa/setup` → scan the QR / enter the secret in an authenticator
app → `/2fa/confirm-setup` with the first code → admin actions now work.

**Backup codes are shown exactly once.** `confirmSetup` returns the
plaintext codes in that single response; only their SHA-256 hashes
are ever persisted. Losing them means using `/2fa/disable` (which
still requires either a working TOTP code or one of the remaining
backup codes) and re-enrolling — there is no admin override to
regenerate a lost set, which is the correct trade-off for a recovery
mechanism.

### What's still needed

- **The TOTP secret is stored in plaintext** in `user_two_factor.secret`.
  This is a real gap: production should encrypt it at rest (e.g. via a
  KMS-managed key or `pgcrypto`) rather than relying solely on database
  access control, the same way a payment processor never stores a raw
  card number. Flagged here rather than glossed over.
- **No rate limiting specifically on `/2fa/verify-login` beyond the
  shared `loginLimiter`** — reused rather than given its own tighter
  limit; a determined attacker with a stolen password has a 5-minute
  challenge window and the existing login rate limit to work against,
  which is reasonable but not bespoke-hardened.
- **A frontend now exists** — `security-settings.html` (QR setup,
  backup codes shown once, disable flow, active session management)
  plus the login two-step handled in-place on both `login.html` and
  `admin-login.html`, built in the frontend pass after this module.
- **`requires_2fa` is only enforced for admins** — the column and
  mechanism exist for any account (a worker or hirer could enroll in
  2FA voluntarily via the same endpoints right now), but nothing
  forces non-admin accounts into it, which matches the spec's "Optional/
  required 2FA" framing for admin accounts specifically.

## Google OAuth module

"Sign in with Google," per spec section 78: credentials stay server-
side, callbacks are validated, and account linking only happens on
Google's own authority that the email is real — never on anything
the client claims.

| Method | Path                          | Auth   | Purpose |
|--------|----------------------------------|--------|---------|
| GET    | /api/auth/google                 | none   | Redirects the browser to Google's consent screen |
| GET    | /api/auth/google/callback         | none   | Google redirects back here with `?code&state`; on success, redirects to the frontend with a real session cookie set |

**CSRF state is stateless and verified, not just generated.** `createState`
signs a timestamp with `SESSION_SECRET` via HMAC-SHA256, avoiding a
server-side state table; `verifyState` recomputes the HMAC with a
timing-safe comparison and rejects anything past a 10-minute TTL.
**Actually tested all four cases** — a fresh valid state is accepted,
a tampered signature is rejected, garbage input is rejected without
throwing, and a state with a 20-minute-old timestamp (valid signature,
just expired) is correctly rejected. This isn't "the code looks right
on inspection" — each case was run against the real function.

**The client secret never leaves `googleOAuthService.js`.** The
authorization-code exchange happens entirely server-side; the
frontend never sees `GOOGLE_CLIENT_SECRET` or handles tokens directly
— it only ever gets redirected to Google and redirected back with a
session cookie already set.

**Account linking trusts Google's `email_verified` flag, and nothing
else.** `findOrCreateGoogleUser` only ever receives an email the
callback has confirmed Google marked verified — spec section 78's
"do not allow account takeover through unsafe account linking" is
satisfied because the trust boundary is identical to a password-reset
email link: whoever completes the OAuth flow has proven control of
that mailbox to Google, which is the same proof standard used
elsewhere in this codebase (`authService.requestPasswordReset`) for
"safe to act on this person's behalf for this email."

**OAuth-created accounts still respect 2FA.** The callback checks
`twoFactorService.isEnabled` exactly like the password login path
does, and redirects to the frontend's existing challenge step rather
than silently bypassing the second factor because the first factor
happened to be Google instead of a password.

### What's still needed

- **New Google signups default to role `'both'`**, not a deliberate
  worker/hirer choice — there's no step in an OAuth redirect flow to
  ask, and no endpoint yet to change role after the fact (a real gap
  flagged back in the Admin Dashboard module too). Defaulting to
  `'both'` avoids stranding a hirer-intent signup with no way to post
  a job; revisit once role-change exists.
- **The 2FA challenge token travels via a URL query parameter** on the
  post-Google redirect (`?twoFactorChallenge=...`), the same pattern
  password-reset links already use in this codebase. It's single-use
  and expires in 5 minutes, but URL parameters can end up in server
  logs or browser history — worth a harder look before relying on
  this pattern for something longer-lived.
- **No "connect Google to an existing logged-in account" flow** —
  linking only happens automatically when the emails match during
  sign-in. A user who wants to deliberately add Google to their
  account from a settings page would need a separate authenticated
  variant of this flow.
- **No frontend** — no "Continue with Google" button anywhere yet;
  this is backend-only in this pass.

## Suspicious-Login Detection module

New-device alerting, scoped honestly to what's actually implementable
without a geolocation service this codebase doesn't have configured:
"have we seen this exact browser/device sign into this account
before," not "is this an unusual country/IP."

| Method | Path                | Auth      | Purpose |
|--------|------------------------|-----------|---------|
| GET    | /api/auth/devices       | any user  | List devices (by User-Agent fingerprint) recognized on this account |

**No new user-facing action endpoint** — this module has no
POST/PATCH of its own. It hooks into the *existing* login success
path: `authController.establishSession` (a new shared helper factored
out of `issueSessionAndRespond`, now also used by the 2FA-verify and
Google OAuth callback paths so all three login routes get identical
device tracking) calls `deviceService.checkAndRecordDevice` on every
successful login and fires a `new_device_login` notification through
the existing notifications module when the fingerprint hasn't been
seen before.

**Verified with real function calls**, not just read: confirmed the
SHA-256 fingerprint is deterministic (same User-Agent → same hash
every time), distinguishing (different User-Agents → different
hashes), and null-safe (a missing User-Agent header doesn't throw).

**No alert on someone's very first-ever login.** `checkAndRecordDevice`
checks the existing device count for the account before deciding
`isNewDevice` — a brand-new account's first sign-in is normal, not
suspicious, and only gets flagged once there's an established device
history to diverge from.

### What's still needed

- **No IP-based or geolocation signal at all** — this is User-Agent
  fingerprinting only. A real "new country" or "impossible travel"
  detector needs either a paid geolocation API or in-house IP-range
  data, neither of which this pass adds.
- **No "this wasn't me" action from the alert itself** — the
  notification says to secure the account, but doesn't link to a
  one-click "revoke this session" flow; the existing logout-all-devices
  endpoint (`security-settings.html`) covers the same need manually.

## Gemini Smart Matching module

Spec section 49's job/worker recommendations, built around one hard
constraint from the spec itself: *"AI must not make uncontrolled
employment, payment, or eligibility decisions."* Gemini here only
re-ranks and explains a candidate set real SQL filtering already
produced — it never queries data directly, never decides who's
eligible for anything, and every actual apply/invite/hire still goes
through the same human-initiated endpoints built in the jobs module.

| Method | Path                                   | Auth   | Purpose |
|--------|--------------------------------------------|--------|---------|
| GET    | /api/jobs/recommended                       | worker | Open jobs ranked for this worker's skills/location/experience |
| GET    | /api/jobs/:jobId/recommended-workers        | hirer (job owner) | Available workers ranked for this specific job |

**The Gemini call is the last step, not the filter.** Both endpoints
build their candidate set with an ordinary parameterized SQL query
(open jobs in the worker's state / available workers in the job's
state) exactly like `jobService.searchJobs` or `profileService.searchWorkers`
already do — Gemini is only ever handed that pre-filtered, already-
legitimate list and asked to order it with a one-sentence reason per
candidate, returned as strict JSON (`responseMimeType: 'application/json'`
in the Gemini request).

**Degrades to a working feature, not an error, when Gemini isn't
configured or fails.** `smartMatchService.rankCandidates` tries
Gemini first if `GEMINI_API_KEY` is set, but on *any* failure —
unconfigured, request error, malformed JSON, or Gemini returning
candidate IDs that don't actually exist in the list it was given
(checked against a real `Set` of valid IDs, not trusted) — it falls
back to a deterministic keyword-overlap ranking. **Verified this
fallback logic directly**: gave it a worker with two skills and three
jobs of varying relevance, confirmed the job matching both skills
ranked first and the irrelevant job scored exactly zero — this is
what actually runs today, since no `GEMINI_API_KEY` is configured in
this environment, and it needed to be correct on its own merits, not
just as a backstop.

### What's still needed

- **No caching** — every call re-runs the SQL query and, if
  configured, a fresh Gemini request. For a worker refreshing a
  recommendations page repeatedly, this is wasted API spend; a short
  TTL cache (keyed on worker/job id) would be a reasonable addition.
- **No frontend** — no "Recommended for you" section anywhere yet.
- **Prompt is not Nigeria-locale-tuned beyond a one-line framing** —
  it says "Nigerian job marketplace" but doesn't inject any
  local-context hints (pidgin phrasing, common trade terminology,
  etc.) that might improve match quality further.
- **`GEMINI_API_KEY` is unset in this environment**, so the Gemini
  path itself (as opposed to the fallback) has not been exercised
  against a live API call in this pass — only the fallback logic and
  the request-construction code have been verified directly.

## Everything from the master spec now exists

Every module described in the master spec is built: auth, profiles,
storage, jobs, interviews, payments, messaging, reviews/disputes, PRO
subscriptions, notifications, the admin dashboard, two-factor
authentication, Google OAuth, suspicious-login detection, and Gemini
smart matching. Remaining gaps are the honest, specific ones called
out throughout this README inside each module's own section — a
plaintext-stored TOTP secret, no per-category notification
preferences, no worker-search autocomplete for featured placements,
no caching on the smart-match endpoints, and so on — rather than
anything still fully unbuilt.
