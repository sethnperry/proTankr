// lib/push/send.ts
//
// Sends a web push to a set of stored subscriptions. A subscription the push
// service says is gone (404 / 410) is deleted. Needs VAPID_PUBLIC_KEY (or the
// NEXT_PUBLIC one), VAPID_PRIVATE_KEY and VAPID_SUBJECT on the server.

import webpush from "web-push";
import { getServiceSupabase } from "@/lib/supabase/serviceClient";

export type StoredSub = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag: string };

let configured = false;
function configure(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@protankr.com", pub, priv);
  configured = true;
  return true;
}

export async function sendPush(subs: StoredSub[], payload: PushPayload): Promise<number> {
  if (!configure() || !subs.length) return 0;
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, urgency: "high" });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await getServiceSupabase().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      else console.warn("[push] send failed:", code ?? (e as Error).message);
    }
  }));
  return sent;
}
