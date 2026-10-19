"use client";
// app/planner/components/trip/LocationEditor.tsx
//
// Add or edit one delivery location (docs/trip-workflow-design.md §4). Used by
// the Delivery Locations page and by the delivery picker's "+ New location",
// so a driver adds a real saved location instead of typing a one-off name.
//
// Before a new location is saved it is checked against the company list
// (same name and number, or same street address in the same city). A match
// offers "Use this one" so the list doesn't fill with duplicates.
//
// Coordinates feed Near Me: "Use my location" takes the phone's GPS while
// standing at the site; otherwise the city/state is looked up on save.

import React, { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { locationPlace, locationTitle, type DeliveryLocation, type LocationTank } from "@/lib/trips/deliveryLocations";
import { similarLocations } from "@/lib/trips/refs";
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
} from "./tripUi";

type TankDraft = { tank_id: string | null; tank_number: string; product_id: string; capacity: string };
type Draft = {
  location_id: string | null;
  name: string;
  location_number: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  lat: number | null;
  lon: number | null;
  delivery_type: DeliveryType;
  notes: string;
  hose: string;
  tanks: TankDraft[];
  removedTankIds: string[];
};

function toDraft(l: DeliveryLocation | null, tanks: LocationTank[], seedName: string): Draft {
  if (!l) {
    return {
      location_id: null, name: seedName, location_number: "", address: "", city: "", state: "", zip: "",
      lat: null, lon: null, delivery_type: "drop", notes: "", hose: "", tanks: [], removedTankIds: [],
    };
  }
  return {
    location_id: l.location_id, name: l.name, location_number: l.location_number ?? "", address: l.address ?? "",
    city: l.city ?? "", state: l.state ?? "", zip: l.zip ?? "", lat: l.lat, lon: l.lon,
    delivery_type: l.delivery_type, notes: l.notes ?? "",
    hose: l.hose_length_ft == null ? "" : String(l.hose_length_ft),
    tanks: tanks
      .filter((t) => t.location_id === l.location_id)
      .sort((a, b) => a.tank_number.localeCompare(b.tank_number, undefined, { numeric: true }))
      .map((t) => ({ tank_id: t.tank_id, tank_number: t.tank_number, product_id: t.product_id ?? "", capacity: t.capacity_gallons == null ? "" : String(t.capacity_gallons) })),
    removedTankIds: [],
  };
}

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

export function LocationEditor({
  companyId,
  userId,
  location,
  tanks,
  existing,
  products,
  seedName = "",
  onSaved,
  onUseExisting,
  onRetired,
}: {
  companyId: string;
  userId: string;
  location: DeliveryLocation | null;
  tanks: LocationTank[];
  existing: DeliveryLocation[];
  products: { product_id: string; product_name?: string | null; display_name?: string | null; active?: boolean | null }[];
  seedName?: string;
  onSaved: (loc: DeliveryLocation) => void;
  onUseExisting?: (loc: DeliveryLocation) => void;
  onRetired?: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(location, tanks, seedName));
  const [geoPinned, setGeoPinned] = useState(false); // coordinates came from GPS, keep them
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [ackSimilar, setAckSimilar] = useState(false);

  const productOptions = useMemo(() => [
    { value: "", label: "Product (optional)" },
    ...products.filter((p) => p.active !== false).map((p) => ({ value: p.product_id, label: String(p.display_name || p.product_name || "") })),
  ], [products]);

  const similar = useMemo(
    () => (draft.name.trim() || draft.address.trim()
      ? similarLocations(existing, {
          name: draft.name, location_number: draft.location_number || null,
          address: draft.address || null, city: draft.city || null, state: draft.state || null,
        }, draft.location_id)
      : []),
    [existing, draft.name, draft.location_number, draft.address, draft.city, draft.state, draft.location_id],
  );

  const patch = (p: Partial<Draft>) => { setDraft((d) => ({ ...d, ...p })); setAckSimilar(false); };
  const patchTank = (i: number, p: Partial<TankDraft>) =>
    setDraft((d) => ({ ...d, tanks: d.tanks.map((t, j) => (j === i ? { ...t, ...p } : t)) }));

  const useMyLocation = () => {
    if (!navigator.geolocation) return setErr("This device can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setDraft((d) => ({ ...d, lat: pos.coords.latitude, lon: pos.coords.longitude })); setGeoPinned(true); setErr(null); },
      () => setErr("Couldn't get your location. Check location permission."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const save = async () => {
    if (!draft.name.trim()) return setErr("Enter a name.");
    if (!draft.city.trim() || !draft.state.trim()) return setErr("Enter the city and state.");
    const nums = draft.tanks.map((t) => t.tank_number.trim()).filter(Boolean);
    if (new Set(nums).size !== nums.length) return setErr("Two tanks have the same number.");
    // A likely duplicate needs one more tap, so it's a choice, not an accident.
    if (similar.length > 0 && !ackSimilar) {
      setAckSimilar(true);
      return setErr("Tap Save again to add it as a new location, or use the saved one.");
    }
    setBusy(true);
    setErr(null);
    try {
      let { lat, lon } = draft;
      const placeChanged = !location || location.city !== (draft.city.trim() || null) || location.state !== (draft.state.trim().toUpperCase() || null);
      if (!geoPinned && (lat == null || placeChanged)) {
        const g = await geocode(draft.city.trim(), draft.state.trim());
        if (g) ({ lat, lon } = g);
      }
      const now = new Date().toISOString();
      const row = {
        company_id: companyId,
        name: draft.name.trim().replace(/\s+/g, " "),
        location_number: draft.location_number.trim() || null,
        address: draft.address.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim().toUpperCase() || null,
        zip: draft.zip.trim() || null,
        lat, lon,
        delivery_type: draft.delivery_type,
        notes: draft.notes.trim() || null,
        hose_length_ft: draft.hose.trim() && Number.isFinite(Number(draft.hose)) ? Number(draft.hose) : null,
        client_updated_at: now,
      };
      const write = (r: Partial<typeof row>) => draft.location_id
        ? supabase.from("delivery_locations").update(r).eq("location_id", draft.location_id).select("location_id").single()
        : supabase.from("delivery_locations").insert({ ...r, created_by: userId }).select("location_id").single();
      let res = await write(row);
      // Older databases lack hose_length_ft (2026-10-19) or zip (2026-10-11);
      // save without whichever is missing.
      if (res.error && /hose_length_ft/i.test(res.error.message)) {
        const { hose_length_ft: _h, ...noHose } = row;
        res = await write(noHose);
        if (res.error && /zip/i.test(res.error.message)) {
          const { zip: _zip, ...noZip } = noHose;
          res = await write(noZip);
        }
      } else if (res.error && /zip/i.test(res.error.message)) {
        const { zip: _zip, ...noZip } = row;
        res = await write(noZip);
      }
      if (res.error) throw new Error(res.error.message);
      const locationId = (res.data as { location_id: string }).location_id;

      // Tanks: existing ones by id, new ones by number, removed ones retired.
      const keep = draft.tanks.filter((t) => t.tank_number.trim());
      const kept = keep.filter((t) => t.tank_id).map((t) => ({
        tank_id: t.tank_id, location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), is_active: true, client_updated_at: now,
      }));
      const added = keep.filter((t) => !t.tank_id).map((t) => ({
        location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), is_active: true, client_updated_at: now,
      }));
      if (draft.removedTankIds.length) {
        const r = await supabase.from("delivery_location_tanks").update({ is_active: false, client_updated_at: now }).in("tank_id", draft.removedTankIds);
        if (r.error) throw new Error(r.error.message);
      }
      if (kept.length) {
        const r = await supabase.from("delivery_location_tanks").upsert(kept, { onConflict: "tank_id" });
        if (r.error) throw new Error(r.error.message);
      }
      if (added.length) {
        // A number that was retired earlier comes back to life on the same row.
        const r = await supabase.from("delivery_location_tanks").upsert(added, { onConflict: "location_id,tank_number" });
        if (r.error) throw new Error(r.error.message);
      }
      onSaved({ ...row, location_id: locationId, is_active: true, starred: location?.starred ?? false });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const retire = async () => {
    if (!draft.location_id) return;
    setBusy(true);
    const { error } = await supabase.from("delivery_locations")
      .update({ is_active: false, client_updated_at: new Date().toISOString() }).eq("location_id", draft.location_id);
    setBusy(false);
    if (error) return setErr(error.message);
    onRetired?.();
  };

  const toggle = (on: boolean): React.CSSProperties => ({
    flex: 1, padding: "9px 0", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
    border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.15)",
    background: on ? "rgba(255,255,255,0.12)" : "transparent", color: on ? "#fff" : muted,
  });

  return (
    <div>
      <div style={sectionCard}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><div style={fieldLabel}>Name</div><input value={draft.name} onChange={(e) => patch({ name: e.target.value })} style={fieldInput} placeholder="Loves" /></div>
          <div><div style={fieldLabel}>Number</div><input value={draft.location_number} onChange={(e) => patch({ location_number: e.target.value })} style={fieldInput} placeholder="Store #" /></div>
        </div>
        <div style={fieldLabel}>Street address</div>
        <input value={draft.address} onChange={(e) => patch({ address: e.target.value })} style={{ ...fieldInput, marginBottom: 10 }} placeholder="123 Main St" />
        <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 1fr", gap: 10, marginBottom: 10 }}>
          <div><div style={fieldLabel}>City</div><input value={draft.city} onChange={(e) => { patch({ city: e.target.value }); setGeoPinned(false); }} style={fieldInput} /></div>
          <div><div style={fieldLabel}>State</div><input value={draft.state} maxLength={2} onChange={(e) => { patch({ state: e.target.value }); setGeoPinned(false); }} style={fieldInput} placeholder="FL" /></div>
          <div><div style={fieldLabel}>Zip</div><input value={draft.zip} maxLength={10} inputMode="numeric" onChange={(e) => patch({ zip: e.target.value })} style={fieldInput} /></div>
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
        <div style={{ ...fieldLabel, marginTop: 12 }}>Hose length needed (ft)</div>
        <input value={draft.hose} onChange={(e) => patch({ hose: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal"
          placeholder="e.g. 50" style={fieldInput} />
        <div style={{ ...fieldLabel, marginTop: 12 }}>Notes</div>
        <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} rows={3}
          placeholder="Gate code, where the fills are, anything to know before you get out…" style={{ ...fieldInput, resize: "vertical", fontFamily: "inherit" }} />
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
              onClick={() => setDraft((d) => ({ ...d, tanks: d.tanks.filter((_, j) => j !== i), removedTankIds: t.tank_id ? [...d.removedTankIds, t.tank_id] : d.removedTankIds }))}
              style={{ border: "none", background: "transparent", color: muted, fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft((d) => ({ ...d, tanks: [...d.tanks, { tank_id: null, tank_number: "", product_id: "", capacity: "" }] }))} style={dashedBtn}>
          + Tank
        </button>
      </div>

      {similar.length > 0 && (
        <div style={{ ...sectionCard, border: "1px solid rgba(251,191,36,0.5)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", marginBottom: 8 }}>
            {similar.length === 1 ? "This looks like a saved location" : "These look like saved locations"}
          </div>
          {similar.slice(0, 3).map((l) => (
            <div key={l.location_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{locationTitle(l)}</div>
                <div style={{ fontSize: 12, color: muted }}>{[l.address, locationPlace(l)].filter(Boolean).join(", ")}</div>
              </div>
              {onUseExisting && (
                <button type="button" onClick={() => onUseExisting(l)} style={{ ...linkBtn, fontWeight: 700 }}>Use this one</button>
              )}
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      <button aria-busy={!!(busy)} type="button" onClick={() => void save()} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>
        {busy ? "Saving…" : similar.length > 0 && ackSimilar ? "Save as a new location anyway" : "Save"}
      </button>

      {draft.location_id && onRetired && (
        <div style={{ textAlign: "center", marginTop: 18 }}>
          {!confirmRetire ? (
            <button type="button" onClick={() => setConfirmRetire(true)} style={{ ...linkBtn, color: "#f87171" }}>Retire this location</button>
          ) : (
            <div>
              <div style={{ fontSize: 14, marginBottom: 8 }}>Hide it from everyone in the company? Past trips keep it.</div>
              <button type="button" onClick={() => void retire()} disabled={busy} style={{ ...linkBtn, color: "#f87171", marginRight: 16 }}>Retire</button>
              <button type="button" onClick={() => setConfirmRetire(false)} style={linkBtn}>Keep</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
