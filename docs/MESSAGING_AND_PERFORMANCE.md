# Messaging, realtime, performance and public site

How the pieces fit together after the messaging redesign and the performance work.
Everything below describes what is in the repository; things that could not be
verified in the development environment are listed under **Not verified**.

## 1. Why navigation was slow (measured)

Measured read-only against the live service from the development machine:

| What | Result |
|---|---|
| Time to first byte for a tiny static file or `/health` | about 0.9 to 1.4 s |
| A conditional re-validation (`304`) of a static file | about 1.0 s |
| First request after the service had been idle | 34 s (Render cold start) |

The app is a multi-page site. Every bottom-nav tap is a full page load of roughly
15 files, and before this work:

* static files were served with `Cache-Control: max-age=0`, so **every file was
  re-validated on every tap**;
* the service worker had no `fetch` handler (it only handled push);
* each page waited for `GET /auth/me` (two database queries) before it drew the
  sidebar, bottom nav or header, and in the Android app also for three sequentially
  loaded native scripts;
* every authenticated request wrote `sessions.last_seen_at`;
* the bell, the bottom-nav badge and the call watcher each polled separately
  (call watcher every 3 s on every page); `GET /settings` and the push
  re-subscribe ran on every page load.

### Fixes

| Area | Change | Where |
|---|---|---|
| HTTP caching | HTML `no-cache`; CSS/JS `max-age=300, stale-while-revalidate`; images/fonts/audio 1 day; catalogue endpoints 5 min; all other API `no-store`. Production only (dev keeps `no-cache`). | `backend/src/server.js` |
| App-shell cache | Service worker serves static files from a per-deploy cache (`jr-static-<build>`). Never touches `/api`, non-GET, range or cross-origin requests. Build id = Render commit hash, or a hash of the frontend files (not process start time). Old caches deleted on activate. | `frontend/service-worker.js`, `server.js` |
| Instant shell | Last verified user kept in `sessionStorage` (no tokens). Pages draw the shell at once and verify the session in the background; a 401 from any API call or the background check signs the UI out. Public pages draw their header from the same cache. | `frontend/js/modules/auth.js`, `api.js`, `chrome.js` |
| One status poller | `GET /notifications/summary` returns both badge counts; shared by the bell and the bottom nav (`ShellStatus`). | `shellStatus.js`, `notificationController.js` |
| Realtime | One SSE stream per page replaces most polling; polling remains as a slow safety net and as the fast fallback when the stream is down. | `realtime.js`, `realtimeHub.js` |
| Fewer calls | `/settings` sync only every 10 min and never for known signed-out visitors; push re-sync every 12 h; `last_seen_at` written at most once a minute; duplicate catch-ups on first connect removed. | `accessibility.js`, `pushNotifications.js`, `sessionService.js` |
| Instant tap feedback | Tapped bottom-nav item turns active on `pointerdown`; other destinations are prefetched when idle (skipped on data-saver / 2G). | `sidebarNav.js` |
| Parallel runtime modules | Native scripts download in parallel and execute in order. | `auth.js` |
| Index | Partial index for the incoming-call lookup. | migration `067` |

### Before / after (same machine, same session, local server, remote database)

`jr:shell-rendered` is a `performance.mark` set when the bottom nav is drawn. 6.5 s window.

| Page | Shell drawn (old → new) | API calls (old → new) | Page's own data request starts |
|---|---|---|---|
| Messages | 800 → 228 ms | 10 → 6 | 803 → 233 ms |
| Profile | 1018 → 190 ms | 11 → 7 | 1021 → 191 ms |
| Notifications | 799 → 144 ms | 11 → 6 | 802 → 144 ms |

These do not include the production effect of the file cache or cold starts, which
cannot be reproduced locally.

### What remains slow, and why

Each authenticated API call is about 640 ms from the development machine: two
sequential database round trips (session lookup, then the query) at about 330 ms each.
`/health` (no database) answers in 3 ms. That is network distance to the database, not
code. See manual actions M1 and M2. A short in-memory cache of session lookups would
halve it but was deliberately **not** added: sessions and account status change in many
places (admin suspend, delete account, password change, logout-all, role changes), and a
missed invalidation would leave a revoked session usable.

## 2. Messaging

### Screens
Phones: list inside the app shell; opening a chat switches to a full-screen chat
(`position: fixed`, own history entry, so Android Back returns to the list). Desktop: list and
chat side by side. Files: `frontend/pages/messages.html`, `js/modules/chat.js`, `css/chat.css`.
The `.messages-layout` / `.thread-messages` class names are kept because Chat Settings
(theme, wallpaper) targets them.

### Features and the API behind each

| Feature | Endpoint |
|---|---|
| Conversation list (preview, unread, muted, last-read) | `GET /messaging/conversations` |
| Chat header: peer, badges, online, blocked/muted | `GET /messaging/conversations/:id` |
| Messages, newest page / `beforeMessageId` / `afterMessageId` / `aroundMessageId` | `GET /messaging/conversations/:id/messages` |
| Send (text, reply, attachments), idempotent by `clientMessageId` | `POST /messaging/conversations/:id/messages` |
| Edit (own, text, 20 min, server-enforced) | `PATCH /messaging/messages/:id` |
| Delete for me / for everyone | `DELETE /messaging/messages/:id?scope=me\|everyone` |
| Pin / unpin / list pins (max 10) | `POST` / `DELETE /messaging/messages/:id/pin`, `GET …/conversations/:id/pins` |
| Search in a chat | `GET /messaging/conversations/:id/messages/search?q=` |
| Media & files list | `GET /messaging/conversations/:id/media?kind=image\|document\|voice_note` |
| Mute (8 h / 1 week / always) | `POST /messaging/conversations/:id/mute` |
| Clear chat (for me), archive, block, report | existing endpoints |
| Signed URL for an attachment (`variant=thumb`, `download=1`) | `GET /messaging/messages/:mid/media/:id/url` |
| Realtime stream | `GET /messaging/stream` (SSE) |

Realtime events: `message.new`, `message.updated`, `message.deleted`, `message.hidden`,
`message.pinned`, `conversation.read`, `call.incoming`, `call.updated`.

### Delivery states
Shown: sending, sent, read (derived from the other person's `last_read_at`), failed (with
Retry / Delete). **"Delivered" is not implemented** (no per-device acknowledgement exists), so
it is not shown. Online/offline is real (open stream or recent activity); exact last-seen
times are deliberately not exposed because there is no per-user privacy setting for them.

### Data model (migration 066)
`messages.reply_to_message_id`, `messages.client_message_id` (unique per sender),
`message_media` display metadata (file name, MIME, duration, waveform, size, thumbnail),
`message_pins`, `message_hidden`, `conversation_participants.muted_until`.

### Attachment security
* Uploads (`POST /storage/chat/:category`, own rate limit 90 / 15 min): what a file **is** is decided from
  its bytes, never the declared MIME type or extension; the category must agree with the bytes.
  Allowed: JPEG/PNG/WebP/GIF; PDF, DOC, DOCX, XLS, XLSX, ZIP; voice as webm, ogg, mp4/m4a, aac, mp3, wav.
  Limits: image 8 MB, document 15 MB, voice 10 MB. Images are re-encoded to at most 1600 px (drops EXIF
  such as GPS) with a 480 px thumbnail.
* Storage path is `<uploader id>/<random>.<ext>`; the client file name is display-only (sanitised).
* Attaching a file to a message requires the path to be in **the sender's own folder** (previously any
  path was accepted) and the object to exist; type and size come from storage, not the request.
* The `chat-media` bucket is private. Access is by signed URL (5 min) after a participant check; a non-participant
  gets 404, an anonymous caller 401. Deleting for everyone removes the stored objects.
* ZIP is allowed as a download-only attachment (never opened by the server). Remove it from
  `chat_document` in `storageService.js` / `CHAT_CATEGORY_KINDS` if your policy forbids archives.

### Realtime design and limits
SSE (not WebSockets or Supabase Realtime): no new infrastructure, works with the existing httpOnly
cookie, and Supabase Realtime would need row-level security that this API-only design does not use.
The connection registry is **in process memory**: with more than one backend instance an event only
reaches clients connected to the instance that produced it. The clients' polling safety net repairs a
missed event within seconds, but scaling out needs a shared bus (Redis or Postgres LISTEN/NOTIFY).

## 3. Public website

* Header is `position: relative` (static; scrolls away). The signed-in app shell is unchanged.
* Hero: one set of markup. The badge is hidden below 861 px; the right-hand list of real professionals
  only appears on desktop and only when the directory returns people. Numbers come from
  `GET /catalog/stats` (real counts and the real platform fee); nothing is hardcoded.
* Search: `?keyword=` now works on `search.html` and `jobs.html`, with Professionals | Jobs tabs, loading,
  empty and error states, and "Load more". Professionals match name, title, bio, location, skills,
  active services and business name; jobs match title, description, poster, skills and category.
  Every word must match; `%` and `_` are literal.

## 4. Tests

```
cd backend && npm test
```
Plain-node: schedule parsing, duration/hours validators, file-type detection, search terms, messaging
validators and the service-worker caching rules (against a faked worker scope). The end-to-end
messaging run (71 checks, real API and storage) lives with the development scratch files and was
executed against a local server; it is not part of `npm test` because it needs live credentials.

## 5. Not verified

* The service worker in a real browser or the Android WebView (it could not register in the test
  browser pane; only its rules were tested).
* Audio/video calls with real devices (call creation, type and routing were verified; media was not).
* Voice recording with a real microphone and the Android permission prompt (the recording pipeline was
  exercised with a synthesised audio stream through the real `MediaRecorder`).
* Keyboard behaviour on a physical Android phone, file download from the app, Android Back on device.
* Production latency after these changes.

## 6. Manual actions

See the final report delivered with this change for the list (Render/Supabase region, plan, migrations,
Facebook OAuth variables, push keys, etc.).
