// lib/callouts/send.ts
//
// The phone's side of "send the call-out email": ask the server once the call-out has synced. One that can't be
// sent yet (no signal, not synced) is remembered and retried; one the server answered for is dropped. Browser only.

import { supabase } from "@/lib/supabase/client";
import type { CalloutEvent } from "./callout";

export type SendResult = "sent" | "waiting" | "not_sent";
const key = (userId: string) => `proTankr:u:${userId}:calloutPending`;
type Pending = { id: string; event: CalloutEvent; tz: string };
const read = (userId: string): Pending[] => { try { return JSON.parse(window.localStorage.getItem(key(userId)) ?? "[]") as Pending[]; } catch { return []; } };
const write = (userId: string, l: Pending[]) => { try { window.localStorage.setItem(key(userId), JSON.stringify(l)); } catch { /* still in the offline store */ } };
export const remember = (userId: string, p: Pending) => write(userId, [...read(userId).filter((x) => !(x.id === p.id && x.event === p.event)), p]);

export async function sendCallout(userId: string, p: Pending): Promise<SendResult> {
  const drop = () => write(userId, read(userId).filter((x) => !(x.id === p.id && x.event === p.event)));
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "waiting";
    const res = await fetch("/api/callouts", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ calloutId: p.id, event: p.event, tz: p.tz }) });
    if (!res.ok) { if (res.status >= 500) return "waiting"; drop(); return "not_sent"; }
    const j = await res.json();
    if (j.sent) { drop(); return "sent"; }
    if (j.reason === "not_synced") return "waiting";
    drop(); return "not_sent";
  } catch { return "waiting"; }
}

export async function retryPending(userId: string): Promise<void> { for (const p of read(userId)) await sendCallout(userId, p); }
