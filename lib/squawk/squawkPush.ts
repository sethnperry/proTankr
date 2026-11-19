// lib/squawk/squawkPush.ts
//
// A Squawk message pushed to everyone in its channel (and to the sender, so they see what the others see). Run right after
// a message is sent. Service client; never import from the browser. Who is "in" a channel is the database's own
// squawk_member(), the same rule that decides who can read it.

import { getServiceSupabase } from "@/lib/supabase/serviceClient";
import { sendPush, type StoredSub } from "@/lib/push/send";
import { SQUAWK_TYPES, type SquawkType } from "./squawk";
import { squawkPushText } from "./squawkText";

export async function pushSquawkMessage(messageId: string, senderId: string): Promise<number> {
  const admin = getServiceSupabase();
  const { data: m } = await admin.from("squawk_messages")
    .select("id, sender_id, channel_type, channel_key, sender_label, body, attachments, retracted_at, created_at").eq("id", messageId).maybeSingle();
  const msg = m as { id: string; sender_id: string; channel_type: SquawkType; channel_key: string; sender_label: string | null; body: string; attachments: unknown[] | null; retracted_at: string | null; created_at: string } | null;
  if (!msg || msg.sender_id !== senderId || msg.retracted_at) return 0; // only the sender may trigger it, and only for a live message
  if (Date.now() - Date.parse(msg.created_at) > 10 * 60_000) return 0;  // no late replays
  const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth, user_id");
  const rows = (subs ?? []) as (StoredSub & { user_id: string })[];
  const users = [...new Set(rows.map((r) => r.user_id))].slice(0, 500);
  const inChannel: string[] = [];
  await Promise.all(users.map(async (u) => {
    const { data } = await admin.rpc("squawk_member", { p_type: msg.channel_type, p_key: msg.channel_key, p_user: u });
    if (data === true) inChannel.push(u);
  }));
  const label = SQUAWK_TYPES.find((t) => t.type === msg.channel_type)?.label ?? "Squawk";
  const body = squawkPushText(msg.sender_label, msg.body, Array.isArray(msg.attachments) ? msg.attachments.length : 0);
  let sent = 0;
  for (const u of inChannel) {
    sent += await sendPush(rows.filter((r) => r.user_id === u), { title: `Squawk · ${label}`, body, url: "/planner/home", tag: `squawk-${msg.id}` });
  }
  return sent;
}
