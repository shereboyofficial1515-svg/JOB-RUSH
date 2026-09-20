# Job Rush — Android App

A native Android wrapper around the real, production Job Rush web application (https://job-rush.onrender.com). It contains **no duplicated business logic** — no separate frontend, no separate auth system, no separate database. It loads the actual site and adds the native Android capabilities a WebView alone can't give it: background push notifications, a real incoming-call screen with ringtone, Custom-Tab-based OAuth (Google blocks sign-in inside a plain embedded WebView), and correct back-button/deep-link behavior.

Everything Android-specific lives in this one `mobile/` directory. Nothing in `frontend/` or `backend/` was restructured — the few backend changes made to support this app are small, additive, and documented in [§ Backend changes](#backend-changes-made-for-this-app) below.

## 1. Why Capacitor

Three options were considered against what Job Rush actually does (not against what's popular):

| Option | Verdict |
|---|---|
| **Plain WebView** | Rejected. A bare `WebView` doesn't implement `onShowFileChooser` — every one of Job Rush's uploads (profile photo, portfolio images/video, chat attachments) uses a dynamically-created `<input type="file">` (`frontend/js/utils/upload.js`), which silently does nothing in a bare WebView unless you hand-write the chooser, permission bridging, and result plumbing yourself. Same story for push notifications and deep links — all reinvented from scratch, with more surface area for subtle bugs. |
| **Trusted Web Activity (TWA)** | Rejected. A TWA renders in a real Chrome Custom Tab, which would neatly sidestep Google's OAuth-in-WebView block — but it means the app owns no WebView to control. There's no way to hang a native incoming-call foreground service + full-screen ringing UI off a TWA, and no native plugin surface for anything else. Section 12–15 of the brief ("this is extremely important," native incoming-call handling) is not achievable this way. |
| **Capacitor** (chosen) | A real native Android project wrapping the site unchanged, with a WebView bridge that already does the file-chooser/permission work correctly, a real plugin ecosystem (push, browser, splash, status bar), and — critically — room for genuinely custom native code (`IncomingCallService`, `JobRushFirebaseMessagingService`, `JobRushWebViewClient`) alongside it. |

Confirmed by inspection before choosing, not assumed:
- `frontend/manifest.json` + `frontend/service-worker.js` already exist (Web Push via VAPID, notification-click routing) — the site was already partway to PWA-ready, but that only covers *browser* push, not an installed Android app in the background/killed state, which needs real FCM.
- Calls are real WebRTC via **LiveKit** (`frontend/pages/call-room.html`, `livekit-client` from CDN) — genuine media, not a stub. The Android app reuses this page unchanged once a call is answered.
- Auth is `httpOnly` session cookies (`sameSite: lax`, `secure` in production) — no JWT to bridge, no token to store. A WebView's cookie jar handles this natively, with one exception (Google/Facebook/Apple OAuth — see § Authentication).
- No `navigator.geolocation` usage anywhere in the codebase — Job Rush's "location" is a State/LGA dropdown, not device GPS. No location permission is requested.

## 2. Project structure

```
mobile/
├── ANDROID.md              this file
├── capacitor.config.json   the ONE config file: production URL, app id/name, splash/status-bar/push settings
├── package.json            Capacitor CLI + plugin dependencies (Node tooling only, not shipped in the APK)
├── www/                    a required-but-unused placeholder (see capacitor.config.json's server.url — all real content loads remotely)
└── android/                the native Android Studio project
    ├── app/
    │   ├── build.gradle                 app id, SDK versions, dependencies, PRODUCTION_URL BuildConfig field
    │   ├── google-services.json         ⚠ NOT included — see § Firebase setup
    │   └── src/main/
    │       ├── AndroidManifest.xml      permissions, deep links, service/activity registration
    │       ├── java/ng/jobrush/app/
    │       │   ├── MainActivity.java                 hosts the WebView; back button, deep links, custom WebViewClient wiring
    │       │   ├── JobRushWebViewClient.java          routes OAuth start URLs to a Custom Tab
    │       │   ├── JobRushFirebaseMessagingService.java   receives FCM; general notifications + incoming-call dispatch
    │       │   ├── IncomingCallService.java           foreground service: ringtone, full-screen notification, answer/reject/timeout
    │       │   ├── IncomingCallActivity.java          native Answer/Reject screen
    │       │   └── ApiClient.java                     minimal cookie-authenticated HTTP helper for the three classes above
    │       └── res/                     icons, splash screens, colors, incoming-call layout — all regenerated from the real Job Rush logo
    └── variables.gradle                 SDK versions (see § Android SDK configuration)
```

No Android-specific files were added to `frontend/` **except** `frontend/.well-known/assetlinks.json` (required to sit on the production domain for HTTPS App Links — see § Deep links) and a one-line color fix in `frontend/manifest.json` (it still had the pre-redesign dark theme's colors; updated to match the current navy brand — unrelated to this app's own runtime, just noticed in passing during the audit).

## 3. Setup

```bash
cd mobile
npm install
npx cap sync android
```

Then open `mobile/android` in Android Studio (File → Open), or build from the command line — see § Build.

You need a JDK (17+) and the Android SDK installed to actually build; neither is required just to read/edit this project. This repo's own dev sandbox has neither installed, so **the build commands below have not been run to completion in this environment** — the project was assembled directly from Capacitor's own generator (`npx cap add android`, which *did* run successfully here and produced the standard project layout) plus hand-written native source, not guessed from memory. Building it for real is the first thing to do in an environment with Android Studio.

## 4. Production URL — the ONE place it's configured

```json
// mobile/capacitor.config.json
"server": { "url": "https://job-rush.onrender.com", ... }
```

```gradle
// mobile/android/app/build.gradle
buildConfigField "String", "PRODUCTION_URL", "\"https://job-rush.onrender.com\""
```

These two must always match. The first is what the WebView actually loads; the second is what native Java code uses for the three requests it makes outside the WebView (OAuth hand-off, FCM token registration, call status). To point a build at a different environment (staging, a different Render service), change both, then re-run `npx cap sync android`.

Never point this at `localhost`/`127.0.0.1` — a device or emulator can't reach your machine's localhost without extra tunneling setup, and it's not what you'd ship anyway.

## 5. Branding

- **App name**: "Job Rush" (`capacitor.config.json` → `strings.xml` → shown under the icon and as the task title)
- **Package/application ID**: `ng.jobrush.app` (reverse-domain of the app's real domain, jobrush.ng)
- **Icon / adaptive icon / splash screen**: generated directly from `frontend/assets/images/logo-512.png` — not a placeholder or an invented new logo. The adaptive icon's background layer is a flat color sampled from the logo's own background so the seam between the OS-composited background and foreground layers is invisible regardless of the launcher's mask shape (circle, squircle, rounded square).
- **Status bar**: navy (`#0B1F3A`, matching the web header), light content (white icons) — set both natively (`styles.xml`, for the first frame before any JS runs) and via `capacitor.config.json`'s `StatusBar` plugin config (for every frame after).
- **Splash duration**: 400ms, no spinner — shows briefly and gets out of the way; it is not a marketing screen.

## 6. Authentication

**Email/password login, 2FA, logout** — work with zero special handling. These are plain `fetch()` calls made *from inside the WebView itself*, so `Set-Cookie` lands in the WebView's own cookie jar exactly like any other browser tab. Nothing to bridge.

**Google / Facebook / Apple sign-in** — need special handling, and got it:

Google actively detects and blocks its own OAuth consent screen from completing inside an embedded WebView user-agent (this is a documented anti-phishing policy of Google's, not a bug to work around quietly). The fix used here:

1. `JobRushWebViewClient` intercepts navigation to `/api/auth/{google,facebook,apple}` and opens it in a **Chrome Custom Tab** instead (`androidx.browser`) — a real, separate Chrome instance the provider can't distinguish from the user's normal browser — with `?client=android` appended.
2. The backend (`googleRedirect`/`facebookRedirect`/`appleRedirect` in `authController.js`) signs that `client=android` flag into the existing OAuth `state` parameter (extended `oauthStateService.js` to carry a small HMAC-signed payload; fully backward compatible with the existing web flow, which passes no payload).
3. On success, `completeOAuthLogin` checks that flag. For the Android case, instead of setting a cookie on a response the Custom Tab would receive (useless — different cookie jar from the app's WebView), it issues a one-time code (new `oauth_mobile_handoffs` table, 2-minute TTL, single-use) and redirects the Custom Tab to `jobrush://oauth-complete?code=...`.
4. Android's OS hands that custom-scheme URL to the app (intent filter in `AndroidManifest.xml`); `MainActivity.handleIntent()` catches it and loads `https://job-rush.onrender.com/api/auth/mobile-handoff?code=...` **inside the app's own WebView**.
5. That new endpoint (`mobileOAuthHandoff` in `authController.js`) redeems the one-time code and sets the real session cookie — this time in the WebView's own cookie jar, where it actually matters.

No secrets are stored in the app to make this work — the code is opaque, single-use, and expires in 2 minutes.

**Known gap**: a user with 2FA enabled who signs in via OAuth on Android will see the 2FA challenge page inside the Custom Tab; verifying it there would set a cookie in the Custom Tab's jar, not the app's. This narrow path (OAuth + 2FA together) isn't wired through the hand-off mechanism yet — documented here rather than silently left broken. Password-based 2FA (the far more common case) is unaffected, since it never leaves the WebView.

## 7. Back button

`MainActivity.onBackPressed()`: if the WebView can go back in its own history, go back; otherwise minimize the app (`moveTaskToBack`), matching Android convention for a launcher app's root screen — the process and its JS state stay alive, exactly like pressing Home. Because Job Rush is a real multi-page site (`window.location.href` between distinct `.html` files, not client-side routing), ordinary WebView history already produces the "chat → back → message list" behavior the brief describes, with no extra bookkeeping needed.

## 8. File uploads / camera / microphone

Handled by Capacitor's default `BridgeWebViewClient`/`WebChromeClient`, which correctly implements `onShowFileChooser` — every existing `Upload.pickFile()` call (profile photo, portfolio image/video, chat attachment) triggers the real Android photo picker / file picker / camera capture option, unchanged. `CAMERA` and `RECORD_AUDIO` permissions are declared in the manifest but only *requested* at the moment the WebView's own permission prompt fires (i.e. the first time a page actually calls `getUserMedia` or opens the camera capture option) — never on app launch.

## 9. Video/audio calls (LiveKit)

`call-room.html` is loaded completely unchanged, including its `livekit-client` CDN script. A Capacitor WebView is a real Chromium-based WebView with full WebRTC support (`getUserMedia`, `RTCPeerConnection`) on Android 7+ (`minSdk 24`) — nothing about wrapping the site breaks this. Mute, camera toggle, speaker switching, end call, reconnecting, and the existing ringback-poll-based "no answer"/"declined" handling all come from that same page's existing JS, untouched.

## 10. Push notifications & incoming calls

The web app already sends Web Push (VAPID) for new messages and incoming calls (`backend/src/services/pushService.js`) — but Web Push only reaches an open browser tab or a service worker while the OS keeps it alive, which is not reliable for an installed Android app that's been backgrounded or fully killed. This app adds **Firebase Cloud Messaging** as a second, parallel channel:

- New table `device_push_tokens` (migration 054) + `POST/DELETE /api/notifications/push/fcm-token`, mirroring the existing web-push subscribe/unsubscribe pair.
- New `backend/src/services/fcmService.js`, wired into the *same* `pushService.sendPushToUser()` every existing call site already uses (`callService.js` for incoming calls, `notificationService.js` for everything else) — **zero changes needed at either call site**. A user with both a browser subscription and the Android app gets both.
- FCM messages are sent **data-only** (no `notification` block), which is what lets `JobRushFirebaseMessagingService.onMessageReceived()` run even while the app is backgrounded or killed, and lets the app decide how to present it rather than the OS auto-displaying a generic banner.
- Non-call notifications (`new_message`, `application_status`, `payment`, etc.) become a normal `NotificationCompat` notification whose tap target is computed the same way the existing service worker already does for browsers — opens the right conversation, or the dashboard.
- **Incoming calls** get real, non-faked call handling: `IncomingCallService` (a foreground service, `phoneCall` type) posts a `CATEGORY_CALL` / `IMPORTANCE_HIGH` notification with `setFullScreenIntent(...)`, which launches `IncomingCallActivity` — a native Answer/Reject screen — over the lock screen. It plays and loops the device's default ringtone via `MediaPlayer`, vibrates, and polls `GET /api/messaging/calls/:id` every 3 seconds (matching the web client's own `incomingCallWatcher.js` polling interval exactly, since there is no push-based "caller cancelled" signal to listen for instead) to detect if the call was declined/missed/cancelled/ended elsewhere, stopping the ringtone the instant it does. A 45-second timeout (matching `call-room.html`'s own `RINGBACK_TIMEOUT_MS`) marks the call `missed` if nothing else resolves it first. Answer hands off to the real `call-room.html` LiveKit UI; Reject posts `status: declined` — the same endpoint the web UI's decline button already uses.

### Firebase setup (external — required before this works)

FCM needs a Firebase project, which only you can create (tied to your Google account):

1. Firebase Console → Create project (or use an existing one).
2. Project Settings → Add app → Android → package name `ng.jobrush.app` → download **`google-services.json`** → place it at `mobile/android/app/google-services.json`. (`app/build.gradle` already conditionally applies the `google-services` Gradle plugin only if this file exists — the project builds fine without it, just without push.)
3. Project Settings → Service Accounts → Generate new private key → set the **entire downloaded JSON** as the backend's `FIREBASE_SERVICE_ACCOUNT_JSON` environment variable (real newlines in the private key escaped as `\n`, same convention as `APPLE_PRIVATE_KEY`). Added to `render.yaml` and `.env.example` already, `sync: false` (Render will prompt for it, no secret is committed).

Until both are in place, `fcmService.isConfigured` is `false` and every send silently no-ops — logged once as a warning, exactly like the existing VAPID/web-push pattern when *that's* unconfigured. Nothing else breaks.

## 11. Deep links

Two schemes, both handled in `MainActivity.handleIntent()` by loading a URL directly into the WebView — no JS bridge needed:

- **`jobrush://oauth-complete?code=...`** — internal, OAuth hand-off only (see § Authentication). Not meant to be typed or shared.
- **`https://job-rush.onrender.com/...`** (Android App Link, `autoVerify="true"`) — a shared conversation/job/profile link, or a notification's tap target, opens directly in the app instead of a browser. Requires `/.well-known/assetlinks.json` (now served by the backend — see `backend/src/server.js`) to actually contain your release signing certificate's SHA-256 fingerprint:

  ```bash
  # after you have a real release keystore (see § Signing):
  keytool -list -v -keystore your-release-key.jks -alias your-key-alias
  # copy the SHA256 fingerprint into frontend/.well-known/assetlinks.json,
  # replacing REPLACE_WITH_YOUR_RELEASE_SIGNING_CERT_SHA256_FINGERPRINT
  ```

  Until that's done, Android simply can't verify the App Link and falls back to opening those links in the browser as normal — it does not crash or misbehave.

## 12. External links

Not specially handled, because Capacitor's default `Bridge.launchIntent()` already does the right thing: any link whose host isn't the app's own (`job-rush.onrender.com`) opens via a normal Android `ACTION_VIEW` intent (the user's default browser, or whatever app registered for that link) instead of loading inside the WebView. Portfolio links, social links, external documents, and Paystack's own payment pages all get this automatically — confirmed by reading Capacitor's own `Bridge.java`, not assumed.

## 13. Payments (Paystack)

No special handling needed or added: Paystack's checkout is already a same-origin redirect/inline-iframe flow the web app drives, and it returns to a Job Rush URL on completion — the WebView handles this exactly like any other same-origin navigation. Card details are never seen by, or stored in, the Android app.

## 14. Permissions requested (and why — nothing speculative)

| Permission | Feature | Requested |
|---|---|---|
| `INTERNET` | everything | always (declaration only, not a runtime prompt) |
| `CAMERA` | profile/portfolio photo capture, video calls | at first camera use |
| `RECORD_AUDIO` | audio/video calls, voice messages | at first call/recording |
| `MODIFY_AUDIO_SETTINGS` | speaker/earpiece switching during a call | — (no prompt; paired with RECORD_AUDIO) |
| `POST_NOTIFICATIONS` | any notification at all (Android 13+) | at first notification-triggering action |
| `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (13+), `READ_EXTERNAL_STORAGE` (≤12L) | picking an existing photo/video for upload | at first picker use |
| `VIBRATE`, `WAKE_LOCK` | incoming-call ringing | only while a call is actually ringing |
| `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_PHONE_CALL` | keeping the ringtone/incoming-call UI alive | — (declaration only) |
| `USE_FULL_SCREEN_INTENT` | showing the incoming-call screen over the lock screen | — (declaration only; see Known Limitations) |

**Not requested**: any location permission. Job Rush's "location" feature is a manual State/LGA dropdown (`frontend/js/modules/locationSelect.js`), not device GPS — confirmed by grepping the entire frontend for `navigator.geolocation` and finding no usage at all.

## 15. Android SDK configuration

`mobile/android/variables.gradle` (Capacitor 8's current defaults, not arbitrarily chosen):

- `minSdkVersion 24` (Android 7.0 — reaches effectively the entire active Android install base)
- `compileSdkVersion 36`, `targetSdkVersion 36` (Android 16, current)

## 16. Build

```bash
cd mobile/android

# Debug APK (unsigned, installable directly for testing)
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk

# Release APK
./gradlew assembleRelease
# → app/build/outputs/apk/release/app-release.apk   (unsigned unless signing is configured — see below)

# Release AAB (what Google Play actually wants)
./gradlew bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

On Windows, use `gradlew.bat` instead of `./gradlew`. **Not run in this environment** — no JDK/Android SDK is installed here (verified: `java -version` fails, `ANDROID_HOME` is unset). The project structure and Gradle files are exactly what `npx cap add android` generated (that command *did* run successfully here) plus the hand-written native sources documented above; running the build is the natural next step in an environment that has Android Studio.

### Signing (release APK/AAB)

No signing keys or passwords are committed here, and none should be. To sign a release build:

1. Generate a keystore once (keep it somewhere safe, back it up — losing it means you can never update the app under the same listing again):
   ```bash
   keytool -genkey -v -keystore jobrush-release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias jobrush
   ```
2. Create `mobile/android/keystore.properties` (already covered by `.gitignore` — never commit this):
   ```properties
   storeFile=/absolute/path/to/jobrush-release.jks
   storePassword=...
   keyAlias=jobrush
   keyPassword=...
   ```
3. Add a `signingConfigs` block to `app/build.gradle` that reads from `keystore.properties` (standard Android boilerplate — Android Studio's own "Generate Signed Bundle/APK" wizard will do this for you automatically if you'd rather not hand-edit Gradle).

## 17. Play Store preparation

Documented, not claimed as done — none of this can be completed without your Play Console account:

- **Application ID**: `ng.jobrush.app` — cannot be changed after your first Play Store upload.
- **Version**: `versionName "1.0"`, `versionCode 1` (`app/build.gradle`) — bump `versionCode` on every release.
- **Privacy Policy**: required by Play Console before publishing (a URL, checked at submission). Job Rush already collects profiles/messages/photos/video/location-by-dropdown/payments — the policy needs to accurately describe exactly this, no more.
- **Data safety form**: Play Console asks specifically about camera, microphone, location, and messaging data collection — answer based on what's actually implemented here (camera/mic: yes, for calls and uploads; precise location: no; contacts: no).
- **Account deletion**: Play policy requires an in-app path to delete your account if the app supports account creation. Job Rush already has this (`authService.deleteAccount`, exposed via Settings) — just confirm it's reachable from within the Android app too (it is; it's the same WebView).
- **App signing**: enroll in Play App Signing when you first upload (Google's recommended default) — you upload with your own upload key, Google re-signs for distribution.

## 18. Known limitations (stated plainly, not glossed over)

- **Not built or run on a device in this environment** — no Android SDK/JDK here. The project is structurally complete and was generated using Capacitor's own tooling plus carefully-checked native source (constructor signatures, API availability, and default behaviors were verified against the actual `@capacitor/android` library source in `node_modules`, not assumed from memory) — but "compiles cleanly in Android Studio" has not been verified by actually invoking a compiler.
- **Firebase is not yet configured** — `google-services.json` and `FIREBASE_SERVICE_ACCOUNT_JSON` are both placeholders/absent by design (see § Firebase setup); background push and native incoming-call handling only activate once you provide them.
- **Android 14+ full-screen intent restriction**: Android 14 (API 34) tightened `USE_FULL_SCREEN_INTENT` to apps the system already trusts for calling (default dialer/assistant) — a third-party app like this may need the user to manually grant it via Settings → Apps → Job Rush → Full screen intent, or the incoming-call screen falls back to a normal high-priority heads-up notification instead of taking over the lock screen. This is a real, documented Android platform restriction, not something a wrapper app can bypass.
- **OAuth + 2FA together on Android** isn't wired through the Custom Tab hand-off (see § Authentication's Known gap) — password-based 2FA is unaffected.
- **Notification icons are placeholders** (`android.R.drawable.ic_dialog_info` / `sym_call_incoming`) — Android requires a notification's small icon to be a simple white-on-transparent silhouette, which can't be reliably auto-generated from the existing full-color logo PNG (no source vector art, no alpha channel to threshold). Replace `JobRushFirebaseMessagingService`/`IncomingCallService`'s `setSmallIcon(...)` calls with a real monochrome icon before release.
- **`assetlinks.json` has a placeholder fingerprint** — App Links won't verify until you replace it with your real release signing certificate's SHA-256 (see § Deep links).
