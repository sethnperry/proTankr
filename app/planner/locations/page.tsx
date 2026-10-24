"use client";
// app/planner/locations/page.tsx
//
// Delivery locations (docs/trip-workflow-design.md §4): the company's shared
// list of customer sites, each with its tanks. Any company member can add and
// edit (RLS allows it); nothing is deleted, a location is retired instead.
//
// Coordinates feed Near Me. "Use my location" takes the phone's GPS while
// standing at the site; otherwise the city/state is geocoded on save.

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { filterLocations, locationPlace, locationTitle, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { dashedBtn, fieldInput, linkBtn, muted } from "../components/trip/tripUi";
import { LocationEditor } from "../components/trip/LocationEditor";

import { usePending } from "@/lib/ui/pending";
export default function LocationsPage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const nav = usePending();
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const locList = useDeliveryLocationList(companyId, userId);
  const { data: products } = useProductsCatalog();

  const [query, setQuery] = useState("");
  // undefined = list; null = new location; a row = editing it.
  const [editing, setEditing] = useState<DeliveryLocation | null | undefined>(undefined);

  const list = useMemo(
    () => filterLocations(locList.locations, { origin: null, nearMe: false, query }),
    [locList.locations, query],
  );
  const open = (l: DeliveryLocation | null) => setEditing(l);
  const done = () => { void locList.reload(); setEditing(undefined); };

  // ── Edit form ──────────────────────────────────────────────────────────────
  if (editing !== undefined && companyId && userId) {
    return (
      <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
        <button type="button" onClick={() => setEditing(undefined)} style={{ ...linkBtn, marginBottom: 12 }}>‹ Locations</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 14px" }}>{editing ? "Edit location" : "New location"}</h1>
        <LocationEditor
          key={editing?.location_id ?? "new"}
          companyId={companyId}
          userId={userId}
          location={editing}
          tanks={locList.tanks}
          existing={locList.locations}
          products={products}
          onSaved={done}
          onUseExisting={(l) => setEditing(l)}
          onRetired={done}
        />
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
      <button type="button" onClick={() => { if (typeof window !== "undefined" && window.history.length > 1) router.back(); else nav.go("back", shell.role === "dispatch" || shell.role === "admin" ? "/planner/dispatch" : "/planner/home"); }} aria-busy={nav.is("back")} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 14px" }}>Delivery Locations</h1>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number, name or city" style={{ ...fieldInput, marginBottom: 10 }} />
      <button type="button" onClick={() => open(null)} style={{ ...dashedBtn, marginBottom: 12 }}>+ New location</button>
      {locList.loading && locList.locations.length === 0 && <div style={{ fontSize: 14, color: muted }}>Loading…</div>}
      {!locList.loading && list.length === 0 && (
        <div style={{ fontSize: 14, color: muted }}>{locList.locations.length === 0 ? "No saved locations yet." : "No matches."}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {list.map((l) => {
          const tankCount = locList.tanks.filter((t) => t.location_id === l.location_id).length;
          return (
            <div key={l.location_id} style={{ display: "flex", alignItems: "center", borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
              <button type="button" aria-label={l.starred ? "Unstar" : "Star"}
                onClick={() => void locList.toggleStar(l.location_id, !l.starred).catch(() => undefined)}
                style={{ border: "none", background: "transparent", color: l.starred ? "#fbbf24" : "rgba(255,255,255,0.3)", fontSize: 20, cursor: "pointer", padding: "0 4px 0 10px" }}>
                {l.starred ? "★" : "☆"}
              </button>
              <button type="button" onClick={() => open(l)}
                style={{ flex: 1, minWidth: 0, textAlign: "left", border: "none", background: "transparent", color: "#fff", padding: "12px 10px 12px 0", cursor: "pointer" }}>
                <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{locationTitle(l)}</div>
                <div style={{ fontSize: 12, color: muted }}>
                  {[locationPlace(l), l.delivery_type === "pump_off" ? "Pump off" : "Drop",
                    tankCount ? `${tankCount} tank${tankCount === 1 ? "" : "s"}` : null,
                    l.lat == null ? "no coordinates" : null].filter(Boolean).join(" · ")}
                </div>
              </button>
              <span style={{ color: muted, padding: "0 12px" }}>›</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
