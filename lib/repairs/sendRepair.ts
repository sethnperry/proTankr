// lib/repairs/sendRepair.ts
//
// The phone's side of "send the repair email": ask the server to send it once the work order has synced.
// A request that can't be sent yet (no signal, row not synced) is remembered and retried; one the server has
// answered for is dropped. Browser only (fetch, localStorage).

import { supabase } from "@/lib/supabase/client";

export type SendResult = "sent" | "waiting" | "not_sent";
const key = (userId: string) => `proTankr:u:${userId}:repairPending`;

function pending(userId: string): string[] {
  try { return JSON.parse(window.localStorage.getItem(key(userId)) ?? "[]") as string[]; } catch { return []; }
}
function setPending(userId: string, ids: string[]) {
  try { window.localStorage.setItem(key(userId), JSON.stringify([...new Set(ids)])); } catch { /* the request is still saved in the offline store */ }
}
export const remember = (userId: string, id: string) => setPending(userId, [...pending(userId), id]);
export const pendingRepairs = pending;

/** "sent": email went (or already had). "not_sent": the server answered and won't send (no approver set, email down). "waiting": try again later. */
export async function sendRepair(userId: string, workOrderId: string): Promise<SendResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return "waiting";
    const res = await fetch("/api/repair-requests", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ workOrderId }) });
    if (!res.ok) return res.status >= 500 ? "waiting" : "not_sent";
    const j = await res.json();
    if (j.sent) { setPending(userId, pending(userId).filter((x) => x !== workOrderId)); return "sent"; }
    if (j.reason === "not_synced") return "waiting";
    setPending(userId, pending(userId).filter((x) => x !== workOrderId));
    return "not_sent";
  } catch { return "waiting"; }
}

export async function retryPending(userId: string): Promise<void> {
  for (const id of pending(userId)) await sendRepair(userId, id);
}
