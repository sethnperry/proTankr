"use client";
// lib/push/subscribe.ts
//
// Turns on server push for this device: asks permission (must be from a tap),
// subscribes through the service worker, and files the subscription with the
// server under the signed-in member. Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY and the
// production service worker (it isn't registered in dev).

import { supabase } from "@/lib/supabase/client";
import { requestNotifications } from "@/lib/ui/notify";

export type PushResult = { ok: boolean; reason?: string };

function keyBytes(b64: string): Uint8Array {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function pushEnabledHere(): Promise<boolean> {
  try {
    if (!pushSupported() || Notification.permission !== "granted") return false;
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(await reg?.pushManager.getSubscription());
  } catch { return false; }
}

export async function enablePush(companyId: string): Promise<PushResult> {
  if (!pushSupported()) return { ok: false, reason: "This browser can't receive push. On an iPhone, add the app to the home screen first." };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "Push isn't set up on the server yet." };
  const perm = await requestNotifications();
  if (perm !== "granted") return { ok: false, reason: "Notifications are blocked. Allow them in the browser or phone settings." };
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapid) as unknown as BufferSource });
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, reason: "Not signed in." };
    const r = await fetch("/api/push/subscribe", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ companyId, subscription: sub.toJSON() }) });
    if (!r.ok) return { ok: false, reason: (await r.json().catch(() => ({})))?.error ?? "Couldn't save the subscription." };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message || "Couldn't turn on push." };
  }
}

export async function disablePush(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) await fetch("/api/push/subscribe", { method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    await sub.unsubscribe();
  } catch { /* already gone */ }
}
