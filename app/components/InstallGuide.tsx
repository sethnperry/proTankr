"use client";
// app/components/InstallGuide.tsx
//
// Platform-aware "add ProTankr to your phone" guide. Shows exactly ONE path
// based on the visitor's real context (see lib/pwa/deviceInstall.ts):
//   - Android/Chrome  -> a real one-tap Install button (beforeinstallprompt)
//   - iOS/Safari      -> the Share -> Add to Home Screen steps
//   - in-app browser  -> "open in your browser first" (can't install here)
//   - installed       -> a done state + sign-in nudge
// Light theme, self-contained styles, inherits Outfit. SSR-safe: renders
// nothing until mounted (detection reads navigator).

import React, { useEffect, useState } from "react";
import { currentUAInfo, isStandalone, recommendedInstallMethod, type InstallMethod, type UAInfo } from "@/lib/pwa/deviceInstall";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

export default function InstallGuide() {
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState<UAInfo | null>(null);
  const [method, setMethod] = useState<InstallMethod>("manual");
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
    const ua = currentUAInfo();
    setInfo(ua);
    setMethod(recommendedInstallMethod(ua, isStandalone()));

    const onBIP = (e: Event) => { e.preventDefault(); setDeferred(e as BIPEvent); };
    const onInstalled = () => { setInstalled(true); setMethod("installed"); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function doPrompt() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    setDeferred(null);
    if (choice?.outcome === "accepted") { setInstalled(true); setMethod("installed"); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(typeof window !== "undefined" ? window.location.origin + "/install" : "protankr.com/install");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked -- the visible URL is the fallback */ }
  }

  if (!mounted) return null;

  const eff: InstallMethod = installed ? "installed" : method;

  return (
    <div className="ig">
      {eff === "installed" && (
        <div className="ig-card ig-done">
          <div className="ig-emoji">✓</div>
          <div className="ig-title">ProTankr is on your phone</div>
          <p className="ig-body">Open <b>ProTankr</b> from your home screen, then enter the code from your email to sign in.</p>
          <a className="ig-btn" href="/login">Sign in</a>
        </div>
      )}

      {eff === "android-prompt" && (
        <div className="ig-card">
          <div className="ig-title">Add ProTankr to your phone</div>
          {deferred ? (
            <>
              <p className="ig-body">One tap — it works like a normal app afterward.</p>
              <button className="ig-btn" onClick={doPrompt}>Install ProTankr</button>
            </>
          ) : (
            <>
              <p className="ig-body">In Chrome, tap the <b>⋮</b> menu (top right), then:</p>
              <ol className="ig-steps">
                <li>Tap <b>Add to Home screen</b></li>
                <li>Tap <b>Install</b></li>
              </ol>
            </>
          )}
        </div>
      )}

      {eff === "ios-safari" && (
        <div className="ig-card">
          <div className="ig-title">Add ProTankr to your iPhone</div>
          <ol className="ig-steps">
            <li>Tap the <b>Share</b> button <span className="ig-ico">↑</span> at the bottom of Safari</li>
            <li>Scroll down and tap <b>Add to Home Screen</b></li>
            <li>Tap <b>Add</b> in the top corner</li>
          </ol>
          <p className="ig-note">Then open ProTankr from your home screen and sign in with the code from your email.</p>
        </div>
      )}

      {eff === "open-in-browser" && (
        <div className="ig-card ig-warn">
          <div className="ig-title">Open this in your browser first</div>
          <p className="ig-body">
            You're in {info?.inAppName ?? "an app"}'s built-in browser, which can't install apps.
            {info?.platform === "ios"
              ? " Tap the ⋯ or Share menu, choose Open in Safari, then come back."
              : " Tap the ⋮ menu, choose Open in Chrome (or your browser), then come back."}
          </p>
          <button className="ig-btn ig-btn-alt" onClick={copyLink}>{copied ? "Link copied ✓" : "Copy link"}</button>
          <div className="ig-url">{typeof window !== "undefined" ? window.location.host + "/install" : "protankr.com/install"}</div>
        </div>
      )}

      {eff === "manual" && (
        <div className="ig-card">
          <div className="ig-title">Open in Safari to install</div>
          <p className="ig-body">
            On iPhone, apps can only be added to the home screen from <b>Safari</b>. Copy this link and open it in Safari:
          </p>
          <button className="ig-btn ig-btn-alt" onClick={copyLink}>{copied ? "Link copied ✓" : "Copy link"}</button>
          <div className="ig-url">{typeof window !== "undefined" ? window.location.host + "/install" : "protankr.com/install"}</div>
        </div>
      )}

      {eff === "desktop" && (
        <div className="ig-card">
          <div className="ig-title">Get ProTankr on your phone</div>
          <p className="ig-body">
            ProTankr is built for your phone. Open <b>{typeof window !== "undefined" ? window.location.host : "protankr.com"}/install</b> on
            your phone to add it to your home screen. On a computer, you can also install it from the
            install icon in your browser's address bar.
          </p>
        </div>
      )}

      <style jsx global>{`
        .ig { max-width: 460px; }
        .ig-card {
          border-radius: 18px; background: #f6f6f5; border: 1px solid rgba(0,0,0,0.08);
          padding: 24px; font-family: var(--font-outfit), "Outfit", Helvetica, Arial, sans-serif; color: #0d0d0c;
        }
        .ig-warn { background: #fff7ed; border-color: rgba(234,150,40,0.35); }
        .ig-done { background: #f0fdf4; border-color: rgba(34,160,90,0.3); }
        .ig-emoji { font-size: 28px; line-height: 1; margin-bottom: 8px; }
        .ig-title { font: 800 20px var(--font-outfit); letter-spacing: -0.01em; margin-bottom: 8px; }
        .ig-body { margin: 0 0 16px; font: 400 15px var(--font-outfit); color: rgba(0,0,0,0.65); line-height: 1.55; }
        .ig-note { margin: 14px 0 0; font: 400 13px var(--font-outfit); color: rgba(0,0,0,0.5); line-height: 1.5; }
        .ig-steps { margin: 0 0 4px; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font: 400 15px var(--font-outfit); color: #222; line-height: 1.5; }
        .ig-steps b { font-weight: 800; }
        .ig-ico { display: inline-block; border: 1px solid rgba(0,0,0,0.3); border-radius: 6px; padding: 0 7px; font-weight: 700; }
        .ig-btn {
          display: inline-block; width: 100%; box-sizing: border-box; text-align: center;
          padding: 14px 18px; border-radius: 999px; border: none; background: #111; color: #fff;
          font: 800 15px var(--font-outfit); cursor: pointer; text-decoration: none;
        }
        .ig-btn:hover { opacity: 0.88; }
        .ig-btn-alt { background: #111; }
        .ig-url { margin-top: 12px; font: 500 13px var(--font-outfit); color: rgba(0,0,0,0.5); word-break: break-all; }
      `}</style>
    </div>
  );
}
