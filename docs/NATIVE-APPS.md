# ProTankr Native Apps (iOS + Android) — Runbook

This is the step-by-step for turning ProTankr into real App Store / Play Store
apps. **None of it can run in the AI session's Linux container** (no macOS,
no Xcode, no Android SDK, no devices, no developer accounts) — it all happens
on your Mac. The repo already carries the pieces that *can* be prepared
headlessly: the Capacitor dependencies, `capacitor.config.ts`, and the
`cap:*` npm scripts. This doc is the rest.

---

## Why a "hosted shell", not a bundled app

ProTankr **cannot be statically exported** (`next export`): it has server
components, a server-side auth gate on `/planner`, and live API routes
(`/api/admin`, `/api/demo`, `/api/early-access`, `/api/fuel-temp`,
`/api/superadmin`, `/api/vault`). A static bundle would strip all of that.

So the native apps don't bundle a build. They wrap the **already-deployed
production site** (`https://www.protankr.com`) in a native WebView. That's
what `server.url` in `capacitor.config.ts` does. The upshot:

- One codebase. Ship a web change → the native apps get it on next launch,
  no rebuild/resubmit.
- Everything already working on mobile Safari/Chrome works identically in the
  shell: cookie sessions, the service worker, the PWA, the 8-digit
  code sign-in (which is *better* than magic links inside a native WebView —
  see "Sign-in inside the app").
- Native capabilities (push, in-app purchase, deep links) are layered on top
  in later phases without changing this shell.

The **App Store 4.2 "minimum functionality"** guideline is the one real risk
of a pure web wrapper (Apple rejects apps that are "just a website"). Mitigation
is in Phase 3 below — add at least one genuinely native capability (push
notifications is the natural one) before submitting to Apple. Google Play is far
more lenient about WebView apps.

---

## Prerequisites (one-time, on your Mac)

1. **Xcode** (from the Mac App Store) + command-line tools:
   `xcode-select --install`. Open Xcode once to accept the license.
2. **Android Studio** + the Android SDK (Studio installs it). Set
   `ANDROID_HOME` (usually `~/Library/Android/sdk`).
3. **CocoaPods** (iOS native deps): `sudo gem install cocoapods`.
4. **Node 20+** and this repo cloned, then `npm install` (pulls in the
   `@capacitor/*` packages already in `package.json`).
5. **Apple Developer Program** — $99/yr, required to ship to the App Store.
6. **Google Play Developer** — $25 one-time, required to ship to Play.

---

## First-time project generation (on your Mac)

From the repo root, after `npm install`:

```bash
npm run cap:add:ios       # creates ./ios   (needs macOS + Xcode + CocoaPods)
npm run cap:add:android   # creates ./android (needs Android SDK)
npm run cap:sync          # copies config into both native projects
```

`cap add` generates the `ios/` and `android/` native project folders from
`capacitor.config.ts`. **These were deliberately NOT generated in the repo** —
they require the native toolchains above and are machine-specific. Commit them
from your Mac once generated (Capacitor's recommended workflow is to check them
in), or keep them local — your call. If you check them in, run `cap sync` after
any web/config change so they stay current.

Open the native IDEs to build/run/archive:

```bash
npm run cap:open:ios      # opens Xcode
npm run cap:open:android  # opens Android Studio
```

### App icons & splash

Drop a 1024×1024 icon and a splash image in, then generate all sizes with
`@capacitor/assets` (`npx @capacitor/assets generate`). The existing
`public/icons/icon-512.png` is a starting point but a dedicated 1024 asset
looks better.

---

## Sign-in inside the app

The **8-digit code sign-in** already built on `/login` is the right primary
flow for native and needs no change: the driver gets a code (from an invite
email or "Email me a code"), types it, and they're in — no bouncing out to a
browser, no magic-link-opens-Safari-not-the-app problem. Keep leading with it.

**Deep links / universal links** (magic link opens the app, not the browser)
are a nice-to-have polish, not a blocker, precisely because code sign-in exists.
When wanted:

- iOS: add an Associated Domains entitlement + host
  `/.well-known/apple-app-site-association` on protankr.com.
- Android: add an intent filter + host `/.well-known/assetlinks.json`.

Both are Capacitor-documented (`@capacitor/app` `appUrlOpen`) and are a
standalone phase — don't gate the first submission on them.

---

## Phased plan

**Phase 1 — Foundation (DONE, in this repo):** Capacitor deps, hosted-shell
`capacitor.config.ts`, `cap:*` scripts, this runbook. Web build unaffected
(config is inert for Vercel; deps are devDependencies).

**Phase 2 — Native projects + first internal builds (your Mac):** run the
`cap add` commands above, set app icons, build to a simulator/device, sign in
with a code, smoke-test the planner end to end.

**Phase 3 — Store-readiness before submission:**
- Add **push notifications** (`@capacitor/push-notifications` + APNs/FCM) — the
  cleanest way to clear Apple's 4.2 minimum-functionality bar, and genuinely
  useful (load reminders, terminal-outage alerts already exist in-app).
- Consider deep links (above) for magic-link parity.
- App Store / Play listing: screenshots, privacy nutrition labels, description.

**Phase 4 — In-app purchase / subscriptions (RevenueCat):** Apple and Google
both **require** their own IAP for subscriptions bought inside a native app —
Stripe is not allowed there (Stripe stays for web/PWA signup). This is the
`@revenuecat/purchases-capacitor` integration and pairs with the
`company_subscriptions` entitlement scaffold already in the DB. Its own pass.

---

## What breaks if you forget `cap sync`

`capacitor.config.ts` changes (e.g. bumping `server.url`, adding a plugin)
only reach the native projects when you run `npm run cap:sync`. If a native
build behaves like an old config, that's the first thing to check.
