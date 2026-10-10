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
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../CalculatorShellContext";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { filterLocations, locationPlace, locationTitle, type DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import type { DeliveryType } from "@/lib/trips/types";
import {
  dashedBtn,
  fieldInput,
  fieldLabel,
  linkBtn,
  muted,
  numOrNull,
  primaryBtn,
  sectionCard,
  sectionTitle,
  smallInput,
} from "../components/trip/tripUi";

type TankDraft = { tank_id: string | null; tank_number: string; product_id: string; capacity: string };
type Draft = {
  location_id: string | null;
  name: string;
  location_number: string;
  address: string;
  city: string;
  state: string;
  lat: number | null;
  lon: number | null;
  delivery_type: DeliveryType;
  notes: string;
  tanks: TankDraft[];
  removedTankIds: string[];
};

const blank = (): Draft => ({
  location_id: null, name: "", location_number: "", address: "", city: "", state: "",
  lat: null, lon: null, delivery_type: "drop", notes: "", tanks: [], removedTankIds: [],
});

async function geocode(city: string, state: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/geocode?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { lat: number; lon: number };
    return Number.isFinite(j.lat) && Number.isFinite(j.lon) ? j : null;
  } catch {
    return null;
  }
}

export default function LocationsPage() {
  const shell = useCalculatorShell();
  const router = useRouter();
  const userId = shell.effectiveUserId || null;
  const companyId = shell.companyId || null;
  const locList = useDeliveryLocationList(companyId, userId);
  const { data: products } = useProductsCatalog();

  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [geoPinned, setGeoPinned] = useState(false); // coordinates came from GPS, keep them
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);

  const list = useMemo(
    () => filterLocations(locList.locations, { origin: null, nearMe: false, query }),
    [locList.locations, query],
  );
  const productOptions = useMemo(() => [
    { value: "", label: "Product (optional)" },
    ...products.filter((p) => p.active !== false).map((p) => ({ value: p.product_id, label: String(p.display_name || p.product_name) })),
  ], [products]);

  const open = (l: DeliveryLocation | null) => {
    setErr(null);
    setConfirmRetire(false);
    setGeoPinned(false);
    if (!l) return setDraft(blank());
    setDraft({
      location_id: l.location_id, name: l.name, location_number: l.location_number ?? "", address: l.address ?? "",
      city: l.city ?? "", state: l.state ?? "", lat: l.lat, lon: l.lon, delivery_type: l.delivery_type, notes: l.notes ?? "",
      tanks: locList.tanks.filter((t) => t.location_id === l.location_id)
        .sort((a, b) => a.tank_number.localeCompare(b.tank_number, undefined, { numeric: true }))
        .map((t) => ({ tank_id: t.tank_id, tank_number: t.tank_number, product_id: t.product_id ?? "", capacity: t.capacity_gallons == null ? "" : String(t.capacity_gallons) })),
      removedTankIds: [],
    });
  };
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchTank = (i: number, p: Partial<TankDraft>) =>
    setDraft((d) => (d ? { ...d, tanks: d.tanks.map((t, j) => (j === i ? { ...t, ...p } : t)) } : d));

  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr("This device can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => { patch({ lat: pos.coords.latitude, lon: pos.coords.longitude }); setGeoPinned(true); setErr(null); },
      () => setErr("Couldn't get your location. Check location permission."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async () => {
    if (!draft || !companyId || !userId) return;
    if (!draft.name.trim()) return setErr("Enter a name.");
    const nums = draft.tanks.map((t) => t.tank_number.trim()).filter(Boolean);
    if (new Set(nums).size !== nums.length) return setErr("Two tanks have the same number.");
    setBusy(true);
    setErr(null);
    try {
      let { lat, lon } = draft;
      const original = draft.location_id ? locList.locations.find((l) => l.location_id === draft.location_id) : null;
      const placeChanged = !original || original.city !== (draft.city.trim() || null) || original.state !== (draft.state.trim() || null);
      if (!geoPinned && draft.city.trim() && draft.state.trim() && (lat == null || placeChanged)) {
        const g = await geocode(draft.city.trim(), draft.state.trim());
        if (g) ({ lat, lon } = g);
      }
      const now = new Date().toISOString();
      const row = {
        company_id: companyId,
        name: draft.name.trim(),
        location_number: draft.location_number.trim() || null,
        address: draft.address.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim().toUpperCase() || null,
        lat, lon,
        delivery_type: draft.delivery_type,
        notes: draft.notes.trim() || null,
        client_updated_at: now,
      };
      const res = draft.location_id
        ? await supabase.from("delivery_locations").update(row).eq("location_id", draft.location_id).select("location_id").single()
        : await supabase.from("delivery_locations").insert({ ...row, created_by: userId }).select("location_id").single();
      if (res.error) throw new Error(res.error.message);
      const locationId = (res.data as { location_id: string }).location_id;

      // Tanks: existing ones by id, new ones by number, removed ones retired.
      const keep = draft.tanks.filter((t) => t.tank_number.trim());
      const existing = keep.filter((t) => t.tank_id).map((t) => ({
        tank_id: t.tank_id, location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), is_active: true, client_updated_at: now,
      }));
      const added = keep.filter((t) => !t.tank_id).map((t) => ({
        location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), is_active: true, client_updated_at: now,
      }));
      const retired = draft.removedTankIds;
      if (retired.length) {
        const r = await supabase.from("delivery_location_tanks").update({ is_active: false, client_updated_at: now }).in("tank_id", retired);
        if (r.error) throw new Error(r.error.message);
      }
      if (existing.length) {
        const r = await supabase.from("delivery_location_tanks").upsert(existing, { onConflict: "tank_id" });
        if (r.error) throw new Error(r.error.message);
      }
      if (added.length) {
        // A number that was retired earlier comes back to life on the same row.
        const r = await supabase.from("delivery_location_tanks").upsert(added, { onConflict: "location_id,tank_number" });
        if (r.error) throw new Error(r.error.message);
      }
      await locList.reload();
      setDraft(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!draft?.location_id) return;
    setBusy(true);
    const { error } = await supabase.from("delivery_locations")
      .update({ is_active: false, client_updated_at: new Date().toISOString() }).eq("location_id", draft.location_id);
    setBusy(false);
    if (error) return setErr(error.message);
    await locList.reload();
    setDraft(null);
  };

  const toggle = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer",
    border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
    background: on ? "rgba(255,255,255,0.12)" : "transparent", color: on ? "#fff" : muted,
  });

  // ── Edit form ──────────────────────────────────────────────────────────────
  if (draft) {
    return (
      <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
        <button type="button" onClick={() => setDraft(null)} style={{ ...linkBtn, marginBottom: 12 }}>‹ Locations</button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 14px" }}>{draft.location_id ? "Edit location" : "New location"}</h1>

        <div style={sectionCard}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><div style={fieldLabel}>Name</div><input value={draft.name} onChange={(e) => patch({ name: e.target.value })} style={fieldInput} /></div>
            <div><div style={fieldLabel}>Number</div><input value={draft.location_number} onChange={(e) => patch({ location_number: e.target.value })} style={fieldInput} placeholder="Store #" /></div>
          </div>
          <div style={fieldLabel}>Address</div>
          <input value={draft.address} onChange={(e) => patch({ address: e.target.value })} style={{ ...fieldInput, marginBottom: 10 }} />
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
            <div><div style={fieldLabel}>City</div><input value={draft.city} onChange={(e) => { patch({ city: e.target.value }); setGeoPinned(false); }} style={fieldInput} /></div>
            <div><div style={fieldLabel}>State</div><input value={draft.state} maxLength={2} onChange={(e) => { patch({ state: e.target.value }); setGeoPinned(false); }} style={fieldInput} placeholder="FL" /></div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: muted }}>
            <span>{draft.lat != null && draft.lon != null ? `${draft.lat.toFixed(3)}, ${draft.lon.toFixed(3)}${geoPinned ? " (GPS)" : ""}` : "No coordinates yet"}</span>
            <button type="button" onClick={useMyLocation} style={linkBtn}>Use my location</button>
          </div>
          <div style={{ fontSize: 12, color: muted, marginTop: 6 }}>Standing at the site? Use your location. Otherwise the city is looked up on save.</div>
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Delivery type</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={toggle(draft.delivery_type === "drop")} onClick={() => patch({ delivery_type: "drop" })}>Drop</button>
            <button type="button" style={toggle(draft.delivery_type === "pump_off")} onClick={() => patch({ delivery_type: "pump_off" })}>Pump off</button>
          </div>
          <div style={{ ...fieldLabel, marginTop: 12 }}>Notes</div>
          <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} rows={3}
            placeholder="Gate code, hose length, where the fills are…" style={{ ...fieldInput, resize: "vertical", fontFamily: "inherit" }} />
        </div>

        <div style={sectionCard}>
          <div style={sectionTitle}>Tanks</div>
          {draft.tanks.length === 0 && <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>None yet. Tanks are also remembered as you deliver.</div>}
          {draft.tanks.map((t, i) => (
            <div key={t.tank_id ?? `new-${i}`} style={{ display: "grid", gridTemplateColumns: "70px 1fr 90px 28px", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <input value={t.tank_number} onChange={(e) => patchTank(i, { tank_number: e.target.value })} placeholder="Tank" style={smallInput} />
              <CustomSelect value={t.product_id} onChange={(v) => patchTank(i, { product_id: v })} options={productOptions} buttonStyle={smallInput} />
              <input value={t.capacity} onChange={(e) => patchTank(i, { capacity: e.target.value })} placeholder="Gal" inputMode="numeric" style={smallInput} />
              <button type="button" aria-label="Remove tank"
                onClick={() => setDraft((d) => d ? { ...d, tanks: d.tanks.filter((_, j) => j !== i), removedTankIds: t.tank_id ? [...d.removedTankIds, t.tank_id] : d.removedTankIds } : d)}
                style={{ border: "none", background: "transparent", color: muted, fontSize: 18, cursor: "pointer" }}>×</button>
            </div>
          ))}
          <button type="button" onClick={() => setDraft((d) => d ? { ...d, tanks: [...d.tanks, { tank_id: null, tank_number: "", product_id: "", capacity: "" }] } : d)} style={dashedBtn}>
            + Tank
          </button>
        </div>

        {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
        <button type="button" onClick={save} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save"}</button>

        {draft.location_id && (
          <div style={{ textAlign: "center", marginTop: 18 }}>
            {!confirmRetire ? (
              <button type="button" onClick={() => setConfirmRetire(true)} style={{ ...linkBtn, color: "#f87171" }}>Retire this location</button>
            ) : (
              <div>
                <div style={{ fontSize: 14, marginBottom: 8 }}>Hide it from everyone in the company? Past trips keep it.</div>
                <button type="button" onClick={retire} disabled={busy} style={{ ...linkBtn, color: "#f87171", marginRight: 16 }}>Retire</button>
                <button type="button" onClick={() => setConfirmRetire(false)} style={linkBtn}>Keep</button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── List ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "12px 16px 40px", maxWidth: 640, margin: "0 auto", color: "#fff" }}>
      <button type="button" onClick={() => router.push("/planner/home")} style={{ ...linkBtn, marginBottom: 12 }}>‹ Driver Dashboard</button>
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
            <div key={l.location_id} style={{ display: "flex", alignItems: "center", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)" }}>
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
