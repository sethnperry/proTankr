// lib/pwa/deviceInstall.ts
//
// Platform / browser / install-state detection for the PWA install guide.
// The core (analyzeUserAgent) is a PURE function of the UA string so it can
// be unit-tested; the window-reading helpers are thin, SSR-safe wrappers.
//
// Why this exists: getting a non-technical driver to actually install a PWA
// is the launch's biggest friction point, and the right instructions differ
// sharply by context:
//   - Android + Chrome  -> a real one-tap install prompt (beforeinstallprompt)
//   - iOS + Safari      -> manual Share -> Add to Home Screen (no API exists)
//   - any in-app browser (Outlook/Gmail/Facebook/...) -> can't install at all;
//     must be reopened in the system browser first
//   - already installed (standalone) -> nothing to do
// Showing the wrong one (e.g. iOS steps to an Android user, or "add to home
// screen" inside Outlook's in-app browser where it silently does nothing) is
// exactly how the average user gets stuck.

export type Platform = "ios" | "android" | "desktop";
export type InstallMethod =
  | "installed"        // already running as an installed app
  | "android-prompt"   // Android browser that can fire beforeinstallprompt
  | "ios-safari"       // iOS Safari -> manual Add to Home Screen
  | "open-in-browser"  // in-app browser (Outlook/Gmail/etc.) -> reopen in real browser
  | "desktop"          // desktop browser -> install from address bar / use phone
  | "manual";          // known platform but not the happy browser (e.g. iOS Chrome)

export type UAInfo = {
  platform: Platform;
  /** rough browser family */
  browser: "safari" | "chrome" | "firefox" | "edge" | "samsung" | "other";
  /** true when the page is inside an app's embedded webview, not a real browser */
  inApp: boolean;
  /** human label for the in-app host, when known (e.g. "Outlook", "Gmail") */
  inAppName: string | null;
};

// In-app / embedded-webview signatures. These browsers cannot install a PWA;
// the only fix is to reopen the URL in the system browser. Order matters only
// for the label; `inApp` is true if any match.
const IN_APP_SIGNATURES: { name: string; test: RegExp }[] = [
  { name: "Outlook",   test: /OutlookMobile|Microsoft Outlook|\bMSAuthHost\b/i },
  { name: "Gmail",     test: /\bGSA\b/i },                    // Google app / Gmail in-app on iOS
  { name: "Facebook",  test: /FBAN|FBAV|FB_IAB/i },
  { name: "Instagram", test: /Instagram/i },
  { name: "LinkedIn",  test: /LinkedInApp/i },
  { name: "Twitter",   test: /Twitter/i },
  { name: "Snapchat",  test: /Snapchat/i },
  { name: "WhatsApp",  test: /WhatsApp/i },
  { name: "WeChat",    test: /MicroMessenger/i },
  { name: "Line",      test: /\bLine\//i },
  { name: "TikTok",    test: /musical_ly|Bytedance|TikTok/i },
];

/** Pure: derive platform/browser/in-app from a user-agent string. */
export function analyzeUserAgent(ua: string): UAInfo {
  const s = ua || "";

  // Platform. iPadOS 13+ reports a Mac UA, so treat a touch-capable "Macintosh"
  // as iOS when the caller can't otherwise tell (handled in the DOM wrapper).
  const isIOS = /iPhone|iPad|iPod/i.test(s);
  const isAndroid = /Android/i.test(s);
  const platform: Platform = isIOS ? "ios" : isAndroid ? "android" : "desktop";

  // In-app browser?
  let inApp = false;
  let inAppName: string | null = null;
  for (const sig of IN_APP_SIGNATURES) {
    if (sig.test.test(s)) { inApp = true; inAppName = sig.name; break; }
  }
  // iOS in-app webviews (SFSafariViewController / WKWebView) often lack the
  // "Safari" token that a real Safari UA always carries. Treat an iOS UA that
  // looks like a mobile browser but has no "Safari" token as in-app too.
  if (!inApp && isIOS && /AppleWebKit/i.test(s) && !/Safari/i.test(s) && !/CriOS|FxiOS|EdgiOS/i.test(s)) {
    inApp = true;
    inAppName = inAppName ?? "an app";
  }

  // Browser family (best-effort; iOS Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS).
  let browser: UAInfo["browser"] = "other";
  if (/EdgiOS|Edg\//i.test(s)) browser = "edge";
  else if (/SamsungBrowser/i.test(s)) browser = "samsung";
  else if (/CriOS/i.test(s) || (/Chrome\//i.test(s) && !/OPR|Edg/i.test(s))) browser = "chrome";
  else if (/FxiOS|Firefox\//i.test(s)) browser = "firefox";
  else if (/Safari/i.test(s) && /AppleWebKit/i.test(s) && !/Chrome|CriOS|Android/i.test(s)) browser = "safari";

  return { platform, browser, inApp, inAppName };
}

/** Pure: given UA info + standalone flag, what should the install guide show? */
export function recommendedInstallMethod(info: UAInfo, standalone: boolean): InstallMethod {
  if (standalone) return "installed";
  if (info.inApp) return "open-in-browser";
  if (info.platform === "ios") return info.browser === "safari" ? "ios-safari" : "manual";
  if (info.platform === "android") return "android-prompt";
  return "desktop";
}

// ── DOM wrappers (SSR-safe) ──────────────────────────────────────────────────

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // iOS Safari uses navigator.standalone; everyone else display-mode.
    const iosStandalone = (window.navigator as any).standalone === true;
    const mm = typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
    return Boolean(iosStandalone || mm);
  } catch { return false; }
}

export function currentUAInfo(): UAInfo {
  if (typeof navigator === "undefined") {
    return { platform: "desktop", browser: "other", inApp: false, inAppName: null };
  }
  const info = analyzeUserAgent(navigator.userAgent);
  // iPadOS 13+ masquerades as Macintosh; detect via touch points.
  if (info.platform === "desktop" && /Macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1) {
    return { ...info, platform: "ios", browser: info.browser === "other" ? "safari" : info.browser };
  }
  return info;
}
