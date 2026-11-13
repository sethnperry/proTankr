"use client";
// lib/trips/useTripPackagePrefs.ts
//
// The driver's "email me a trip package when a trip finishes" switch (profiles.email_trip_package, off by default)
// and what the package screens need to call the send route.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export function useEmailTripPackage(userId: string | null) {
  const [on, setOnState] = useState<boolean | null>(null);
  useEffect(() => {
    if (!userId) { setOnState(null); return; }
    let off = false;
    void supabase.from("profiles").select("email_trip_package").eq("user_id", userId).maybeSingle()
      .then(({ data, error }) => { if (!off) setOnState(error ? false : Boolean((data as { email_trip_package?: boolean } | null)?.email_trip_package)); });
    return () => { off = true; };
  }, [userId]);
  const setOn = useCallback(async (v: boolean) => {
    const prev = on;
    setOnState(v);
    const { error } = await supabase.rpc("set_email_trip_package", { p_on: v });
    if (error) { setOnState(prev); return false; }
    return true;
  }, [on]);
  return { on, setOn };
}

export type SendResult = { ok: true; to?: string[]; skipped?: string } | { ok: false; error: string };

/** Asks the server to build and email a trip package. `auto` goes to the driver's own address only. */
export async function sendTripPackage(tripId: string, mode: "auto" | "manual", to?: string[]): Promise<SendResult> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: "Not signed in." };
    const r = await fetch("/api/trips/package", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ tripId, mode, to }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, error: j?.error ?? `Couldn't send (${r.status}).` };
    return { ok: true, to: j.to, skipped: j.skipped };
  } catch {
    return { ok: false, error: "No signal. Try again when you have service." };
  }
}
