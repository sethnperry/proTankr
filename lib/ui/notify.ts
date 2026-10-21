// lib/ui/notify.ts
//
// Notifications that work on a phone. Mobile Chrome ignores `new Notification`
// from a page and wants the service worker to show it, so try that first and
// fall back to the page constructor (desktop). Permission must be asked from a
// tap.

export type NotifyPermission = "unsupported" | "default" | "granted" | "denied";

export function notifyPermission(): NotifyPermission {
  return typeof Notification === "undefined" ? "unsupported" : (Notification.permission as NotifyPermission);
}

export async function requestNotifications(): Promise<NotifyPermission> {
  if (typeof Notification === "undefined") return "unsupported";
  try { return (await Notification.requestPermission()) as NotifyPermission; } catch { return notifyPermission(); }
}

export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (notifyPermission() !== "granted") return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) { await reg.showNotification(title, { body, tag, icon: "/icons/icon-192.png" } as NotificationOptions); return; }
  } catch { /* fall through to the page constructor */ }
  try { new Notification(title, { body, tag }); } catch { /* some browsers allow neither */ }
}
