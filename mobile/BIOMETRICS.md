# Job Rush — Biometric login & app lock

Biometric login lets a signed-in user unlock the Android app, and confirm high-risk money actions, with the phone's own fingerprint / face check. Job Rush never handles biometric data: the operating system does the check and tells the app only "authenticated" or an error code.

## 1. What it is (and is not)

| It is | It is not |
|---|---|
| A **local** unlock for an already-signed-in session | A way to sign in without a password |
| An extra local confirmation before a withdrawal or an escrow release | Proof of authorization to the server |
| Opt-in, per user, per device | Something the backend knows about |

The httpOnly session cookie is still the real credential and the server still authorises every request. Nothing about biometrics is ever sent to the backend (there is no biometric endpoint; `POST /api/auth/biometric` returns 404).

## 2. Architecture

```
frontend (plain JS, served from the live site)         native app (Capacitor 8 Android shell)
─────────────────────────────────────────────         ─────────────────────────────────────
Settings → Security row (profile-settings.html)  ┐
Lock screen (js/modules/appLock.js)              ├─►  BiometricService  ─►  window.Capacitor.Plugins.BiometricAuthNative
Withdraw / Release funds (wallet, contracts)     ┘    (js/modules/            │   (injected by Capacitor's native bridge)
                                                      biometric.js)           ▼
                                                      Native helper     @aparajita/capacitor-biometric-auth 10.0.0
                                                      (js/modules/            │
                                                      native.js)              ▼
                                                                         androidx BiometricPrompt  (OS-owned UI + data)
```

- **One abstraction.** Pages call `BiometricService` only (`getCapabilities`, `authenticate`, `enable`, `disable`, `confirmSensitive`, `isEnabled`). No page mentions Android.
- **Native-only, loaded on demand.** `auth.js` (`Auth.requireSession`) downloads `native.js`, `biometric.js` and `appLock.js` **only** when `window.Capacitor.isNativePlatform()` is true. A normal browser never loads them, so web login is unchanged.
- **Why `Capacitor.Plugins.*`?** The app's WebView loads the live site (`server.url` in `capacitor.config.json`), and the site has no bundler, so it cannot `import` an npm package. Capacitor's bridge injects each native plugin as `window.Capacitor.Plugins.<Name>` into pages from the allowed origin; `BiometricService` calls `BiometricAuthNative.checkBiometry()` / `.internalAuthenticate()` directly.
- **Old installs degrade gracefully.** The site updates instantly; an installed APK does not. If the plugin isn't in the installed build, capability state is `app_update_required` and Settings says "Update the Job Rush app to use biometric login."

## 3. Packages and versions

| Package | Version | Why |
|---|---|---|
| `@capacitor/core` / `@capacitor/android` | 8.5.2 (existing) | Source of truth — no Capacitor major upgrade |
| `@aparajita/capacitor-biometric-auth` | 10.0.0 | Maintained (published Feb 2026), depends on Capacitor ^8.0.2, exposes the exact error codes the UX needs, supports Android fingerprint/face/iris and iOS Face ID/Touch ID |
| `@capacitor/haptics` | 8.0.2 | Subtle success/error feedback (biometric success, completed withdrawal, failures) |

Android manifest gains `USE_BIOMETRIC`. `npx cap sync android` regenerates `capacitor.settings.gradle` / `capacitor.build.gradle`. The debug build (`./gradlew :app:assembleDebug`) was run to completion with both plugins.

## 4. Platforms

| Platform | Status |
|---|---|
| Android | Implemented; native project compiles. **Not run on a physical device or emulator in this work** — follow §9 before release. |
| iOS | **Untested / not set up.** The repo has no `ios/` project. The plugin supports Face ID / Touch ID; adding iOS means `npx cap add ios`, adding `NSFaceIDUsageDescription` to `Info.plist`, and running the §9 checks on a device. |
| Web | Inert by design. Settings shows "Available in the Job Rush Android app" (status "App only"). Desktop/mobile browser login is untouched. |

## 5. States handled

Capability (`BiometricService.getCapabilities()`):

| State | Meaning | Settings text |
|---|---|---|
| `available` | Hardware present and enrolled | Toggle works |
| `not_enrolled` | Hardware present, nothing enrolled | "Add a fingerprint or face in your phone's Settings first…" |
| `not_supported` | No biometric hardware | "This device doesn't support fingerprint or face unlock." |
| `locked_out` | Too many failed attempts | "Biometrics are temporarily locked…" |
| `unavailable` | Anything else the OS reports | "…isn't available on this device right now." |
| `app_update_required` | Installed APK lacks the plugin | "Update the Job Rush app…" |
| `web` | Not in the app | "Available in the Job Rush Android app." |

Authentication outcome (`authenticate()` never throws): `cancelled`, `fallback`, `failed`, `locked_out`, `not_enrolled`, `unavailable`, `error`.

## 6. Security model — what is stored, what is not

**Stored locally (the only things):**
- `localStorage["jr.biometric.optin.<userId>"] = "1"` — the user opted in on this device. A preference, not a secret.
- `sessionStorage["jr.lock.unlocked"]`, `["jr.lock.leftAt"]` — whether this app session is unlocked and when the app was last left (for the timeout). Cleared when the app process ends.

**Never stored or sent:** fingerprint/face images or templates, any biometric result to the server, passwords, tokens, or credentials. No biometric data goes to Render, Supabase, analytics or local/plain preferences.

**Honest limits.** The lock is a privacy gate over an existing session. Someone with full device access (rooted device, ADB, a backup of app data) could bypass client-side UI; that is true of any local app lock. The real protections remain: the httpOnly session cookie, server-side role/ownership checks, admin review of withdrawals, and 2FA/password re-entry for account changes.

## 7. App lock policy

Constants live in one place — `AppLock.CONFIG` in `js/modules/appLock.js`:

| Constant | Value | Effect |
|---|---|---|
| `LOCK_AFTER_BACKGROUND_MS` | 60 000 | Away longer than this → lock on return |
| `AUTO_PROMPT_DELAY_MS` | 250 | Lock screen paints before the OS prompt opens |
| `EXEMPT_PAGES` | `call-room.html` | Answering a call never waits on a scan |

Behaviour: cold start (process was gone) → locked. Moving between pages, or switching away for under a minute → no prompt. A fresh password login counts as unlocked (no second prompt). Locking happens inside `Auth.requireSession`, so a page's data is not requested while the lock screen is up. The OS prompt allows the phone's PIN/pattern as an in-prompt fallback.

**Fallback — never the only way in.** The lock screen always offers **"Use password instead"**, which ends the session and goes to the normal login. A device that can't authenticate at all (no secure lock screen) is never locked out.

**Logout.** Logging out clears the lock flags. The per-user opt-in stays, because it is a device preference and not a credential: after logging in again with the password, the next cold start asks for biometrics again.

## 8. Sensitive actions (risk-based, not every tap)

| Action | Protection |
|---|---|
| View wallet, transactions | Session |
| Request a withdrawal | Session **+ local biometric/PIN confirm** (if opted in) + server validation (role, balance, minimum) + admin review before payout |
| Release escrow to a worker | Session **+ local biometric/PIN confirm** (if opted in) + server checks the user is the contract's hirer and the escrow is funded |
| Change/add email or phone | Verification code to the new address |
| Change password, deactivate/delete account | Current password re-entry (existing flow) |
| Disable two-step verification | Authenticator/backup code (existing flow) |
| Turn biometric login on | Strict biometric (no PIN fallback) proves a real biometric works |
| Turn biometric login off | Fresh OS confirmation (skipped only if the device can no longer authenticate, so the user can't get stuck) |

`confirmSensitive()` returns `{ ok: true, skipped: true }` when the user hasn't opted in or isn't in the app — the server rules above apply regardless. The request body never contains any biometric field; the server ignores any such field a client invents (verified: `POST /api/wallet/withdrawals` with `biometricSuccess: true` is validated and rejected on its own merits).

## 9. Device test procedure (required before release)

Build a debug APK, point `capacitor.config.json`'s `server.url` at a reachable test deployment (not localhost), install on a physical Android phone with a fingerprint enrolled.

1. Settings → Security → Biometric login shows **Off** with your biometric type.
2. Tap it → explanation sheet → **Enable** → the native prompt appears (not a web modal) → scan → row shows **On**.
3. Fully close the app, reopen → lock screen → native prompt → scan → app opens.
4. Reopen, **cancel** the prompt → message + retry button; **Use password instead** → login screen.
5. Use a wrong finger several times → "didn't match" → lockout message.
6. Background the app for 10 s → no prompt; for over 60 s → prompt on return.
7. Withdraw funds → Review → **Confirm** → native prompt; cancel it → nothing submitted.
8. Turn the setting **Off** (requires a scan), then On again.
9. Remove the phone's enrolled fingerprint → Settings shows "Needs attention", lock no longer blocks you, and you can turn it off.
10. On a phone with no fingerprint hardware / none enrolled, the row explains why it's unavailable.
11. On an older installed APK without this plugin, the row says "Update the Job Rush app".
12. Answer an incoming call while locked → call screen is not blocked.
13. Rotate the device and open the keyboard on the withdrawal form → fields stay visible.
14. Desktop browser: the row says "App only"; login works as before.

## 10. Files

Web: `frontend/js/modules/native.js`, `biometric.js`, `appLock.js`, `auth.js` (loader + guard), `frontend/pages/profile-settings.html` (Security rows), `wallet.html`, `contracts.html` (step-up), `frontend/css/components.css` (`.app-lock`).
Native: `mobile/package.json`, `mobile/android/app/src/main/AndroidManifest.xml` (`USE_BIOMETRIC`), generated Gradle includes.
