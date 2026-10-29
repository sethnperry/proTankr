"use client";
// app/planner/locations/page.tsx
//
// Delivery locations (docs/trip-workflow-design.md §4): the company's shared
// list of customer sites, each with its tanks. Any company member can add and
// edit (RLS allows it); nothing is deleted, a location is retired instead.
//
// Coordinates feed Near Me. "Use my location" takes the phone's GPS while
// standing at the site; otherwise the city/state is geocoded on save.

import React, { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { linkBtn, muted } from "../components/trip/tripUi";
import { LocationBrowser } from "../components/trip/LocationPicker";
import { supabase } from "@/lib/supabase/client";

import { usePending } from "@/lib/ui/pending";
export default function LocationsPage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const nav = usePending();
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const locList = useDeliveryLocationList(companyId, userId);

  // Counties are looked up from each location's address, a few at a time, until none are left.
  const sweeping = useRef(false);
  useEffect(() => {
    if (sweeping.current || locList.loading) return;
    if (!locList.locations.some((l) => l.county == null)) return;
    sweeping.current = true;
    void (async () => {
      try {
        for (let i = 0; i < 40; i++) {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          if (!token) break;
          const res = await fetch("/api/locations/county-backfill", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) break;
          const j = (await res.json()) as { done: number; remaining: number };
          if (!j.done || !j.remaining) break;
        }
        await locList.reload();
      } catch { /* try again next visit */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locList.loading, locList.locations.length]);

  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
      <button type="button" onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else nav.go("back", shell.role === "dispatch" || shell.role === "admin" ? "/planner/dispatch" : "/planner/home"); }} aria-busy={nav.is("back")} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 14px" }}>Delivery Locations</h1>
      {locList.loading && locList.locations.length === 0 ? (
        <div style={{ fontSize: 14, color: muted }}>Loading…</div>
      ) : (
        <LocationBrowser locations={locList.locations} tanks={locList.tanks} companyId={companyId} userId={userId} onChanged={() => void locList.reload()} />
      )}
    </div>
  );
}
