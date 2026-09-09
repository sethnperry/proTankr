// lib/pwa/deviceInstall.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeUserAgent, recommendedInstallMethod } from "./deviceInstall.ts";

// Real-world user agents (trimmed).
const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidSamsung: "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  desktopChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  outlookIOS: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OutlookMobile/4.2killer",
  gmailIOS: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1",
  facebook: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0]",
  androidWebview: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0 Mobile Safari/537.36 OutlookMobile/4.2",
};

test("iPhone Safari -> ios-safari", () => {
  const i = analyzeUserAgent(UA.iphoneSafari);
  assert.equal(i.platform, "ios");
  assert.equal(i.browser, "safari");
  assert.equal(i.inApp, false);
  assert.equal(recommendedInstallMethod(i, false), "ios-safari");
});

test("iPhone Chrome (CriOS) -> manual (can't Add to Home Screen from iOS Chrome)", () => {
  const i = analyzeUserAgent(UA.iphoneChrome);
  assert.equal(i.platform, "ios");
  assert.equal(i.browser, "chrome");
  assert.equal(i.inApp, false);
  assert.equal(recommendedInstallMethod(i, false), "manual");
});

test("Android Chrome -> android-prompt", () => {
  const i = analyzeUserAgent(UA.androidChrome);
  assert.equal(i.platform, "android");
  assert.equal(i.browser, "chrome");
  assert.equal(recommendedInstallMethod(i, false), "android-prompt");
});

test("Android Samsung Internet -> android-prompt", () => {
  const i = analyzeUserAgent(UA.androidSamsung);
  assert.equal(i.platform, "android");
  assert.equal(i.browser, "samsung");
  assert.equal(recommendedInstallMethod(i, false), "android-prompt");
});

test("Desktop Chrome -> desktop", () => {
  const i = analyzeUserAgent(UA.desktopChrome);
  assert.equal(i.platform, "desktop");
  assert.equal(recommendedInstallMethod(i, false), "desktop");
});

test("Outlook in-app (iOS) -> open-in-browser", () => {
  const i = analyzeUserAgent(UA.outlookIOS);
  assert.equal(i.inApp, true);
  assert.equal(i.inAppName, "Outlook");
  assert.equal(recommendedInstallMethod(i, false), "open-in-browser");
});

test("Gmail/Google-app in-app (iOS) -> open-in-browser", () => {
  const i = analyzeUserAgent(UA.gmailIOS);
  assert.equal(i.inApp, true);
  assert.equal(i.inAppName, "Gmail");
  assert.equal(recommendedInstallMethod(i, false), "open-in-browser");
});

test("Facebook in-app -> open-in-browser", () => {
  const i = analyzeUserAgent(UA.facebook);
  assert.equal(i.inApp, true);
  assert.equal(i.inAppName, "Facebook");
  assert.equal(recommendedInstallMethod(i, false), "open-in-browser");
});

test("Android in-app webview (Outlook) -> open-in-browser", () => {
  const i = analyzeUserAgent(UA.androidWebview);
  assert.equal(i.inApp, true);
  assert.equal(recommendedInstallMethod(i, false), "open-in-browser");
});

test("standalone always wins -> installed", () => {
  for (const ua of Object.values(UA)) {
    assert.equal(recommendedInstallMethod(analyzeUserAgent(ua), true), "installed");
  }
});
