"use client";
// lib/trips/trailerAlerts.ts
//
// The note left on a trailer with product still aboard (Retain on the delivery screen). Written straight to the
// server (every driver in the company can read it); if there is no signal the note waits on the phone and goes
// up the next time the dashboard loads.

import { supabase } from "@/lib/supabase/client";

export type TrailerAlert = { alert_id: string; trailer_id: string; trip_id: string | null; note: string; compartments: number[]; created_by: string | null; created_at: string };
type Pending = { company_id: string; trailer_id: string; trip_id: string | null; note: string; compartments: number[]; created_by: string };

const KEY = "proTankr:pendingTrailerAlerts";
const readPending = (): Pending[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const writePending = (p: Pending[]) => { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } };

export async function addTrailerAlert(a: Pending): Promise<void> {
  const { error } = await supabase.from("trailer_alerts").insert(a);
  if (error) writePending([...readPending(), a]);
}

export async function sendPendingTrailerAlerts(): Promise<void> {
  const list = readPending();
  if (!list.length) return;
  const left: Pending[] = [];
  for (const a of list) {
    const { error } = await supabase.from("trailer_alerts").insert(a);
    if (error) left.push(a);
  }
  writePending(left);
}

export async function fetchTrailerAlerts(trailerId: string): Promise<TrailerAlert[]> {
  const { data } = await supabase.from("trailer_alerts").select("alert_id,trailer_id,trip_id,note,compartments,created_by,created_at").eq("trailer_id", trailerId).is("cleared_at", null).order("created_at", { ascending: false });
  return (data ?? []) as TrailerAlert[];
}

export async function clearTrailerAlerts(trailerId: string, userId: string): Promise<boolean> {
  const { error } = await supabase.from("trailer_alerts").update({ cleared_at: new Date().toISOString(), cleared_by: userId }).eq("trailer_id", trailerId).is("cleared_at", null);
  return !error;
}
