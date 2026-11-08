// lib/dispatch/driverNotices.ts
//
// Plain notices from dispatch to a driver's dashboard. The table is created by
// supabase/migrations/20261125000000_driver_notices.sql (not applied yet): reads
// fail open, and sending says so honestly until it exists.
import { supabase } from "@/lib/supabase/client";

export type DriverNotice = { notice_id: string; title: string; body: string | null; kind: string; created_at: string };

export function meetNotices(i: {
  companyId: string; fromUserId: string; terminal: string;
  mine: { id: string; name: string; etaText: string };      // the driver without access
  carded: { id: string; name: string; etaText: string };    // the driver who has it
}): { company_id: string; user_id: string; from_user_id: string; kind: string; title: string; body: string; payload: unknown }[] {
  const base = { company_id: i.companyId, from_user_id: i.fromUserId, kind: "meet" };
  return [
    { ...base, user_id: i.mine.id, title: `Meet ${i.carded.name} at ${i.terminal} to load`, body: `${i.carded.name} arrives about ${i.carded.etaText}. You load together (training load). Add any wait to your trip with a note.`, payload: { terminal: i.terminal, with: i.carded.id } },
    { ...base, user_id: i.carded.id, title: `${i.mine.name} will load with you at ${i.terminal}`, body: `${i.mine.name} is not carded there and arrives about ${i.mine.etaText}. Load together (training load for them). Add any wait to your trip with a note.`, payload: { terminal: i.terminal, with: i.mine.id } },
  ];
}

export async function sendDriverNotices(rows: ReturnType<typeof meetNotices>): Promise<string | null> {
  const { error } = await supabase.from("driver_notices").insert(rows);
  if (!error) return null;
  return /driver_notices|42P01|PGRST205/.test(`${error.code} ${error.message}`) ? "Driver notices aren't set up yet (the driver_notices table hasn't been created)." : error.message;
}

export async function fetchOpenNotices(userId: string): Promise<DriverNotice[]> {
  const { data, error } = await supabase.from("driver_notices").select("notice_id, title, body, kind, created_at")
    .eq("user_id", userId).is("seen_at", null).order("created_at", { ascending: false }).limit(10);
  return error ? [] : ((data ?? []) as DriverNotice[]);
}

export async function dismissNotice(id: string): Promise<void> {
  await supabase.from("driver_notices").update({ seen_at: new Date().toISOString() }).eq("notice_id", id);
}
