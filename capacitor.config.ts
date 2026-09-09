// capacitor.config.ts
//
// Native app shell for ProTankr (iOS + Android), per the product direction:
// convert the PWA to native apps sold in both app stores.
//
// HOSTED-SHELL approach, and it is the only viable one here: ProTankr cannot
// be statically exported. It has server components, a server-side auth gate
// on /planner, and live API routes (admin/demo/early-access/fuel-temp/
// superadmin/vault). `next export` refuses all of that. So the native apps do
// NOT bundle a static build -- they load the already-deployed production site
// (server.url) inside a native WebView, giving us a real App Store / Play
// Store binary that wraps the same code the web already runs. Push
// notifications, native IAP (RevenueCat), and deep links are layered on top
// later (see docs/NATIVE-APPS.md) without changing this shell.
//
// This file is INERT for the web deploy: `next build` never reads it, and the
// @capacitor/* packages are devDependencies, so nothing here ships in the
// Vercel bundle. Running `npx cap add ios|android` (on a Mac / with the
// Android SDK) is what turns this config into real native projects.

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.protankr.app",
  appName: "ProTankr",
  // Required by the CLI even in hosted-shell mode. We do not ship a static
  // build, so point it at `public` (which exists and holds the icons/manifest);
  // the WebView actually loads server.url below, not these files.
  webDir: "public",
  server: {
    // Load the live production site inside the native WebView. This is the
    // canonical host (login/cookie logic both use www.protankr.com).
    url: "https://www.protankr.com",
    // Serve over https so Secure cookies, service worker, and PWA APIs all
    // behave exactly as they do in the mobile browser.
    androidScheme: "https",
    iosScheme: "https",
  },
};

export default config;
