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

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { locationPlace, locationTitle, type DeliveryLocation, type LocationTank } from "@/lib/trips/deliveryLocations";
import { sameStore, similarLocations } from "@/lib/trips/refs";
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

type TankDraft = { tank_id: string | null; tank_number: string; product_id: string; capacity: string; hose: string };
type Draft = {
  location_id: string | null;
  name: string;
  location_number: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  region: string;
  local_area: string;
  lat: number | null;
  lon: number | null;
  delivery_type: DeliveryType;
  notes: string;
  tanks: TankDraft[];
  removedTankIds: string[];
};

function toDraft(l: DeliveryLocation | null, tanks: LocationTank[], seedName: string): Draft {
  if (!l) {
    return {
      location_id: null, name: seedName, location_number: "", address: "", city: "", state: "", zip: "", region: "", local_area: "",
      lat: null, lon: null, delivery_type: "drop", notes: "", tanks: [], removedTankIds: [],
    };
  }
  return {
    location_id: l.location_id, name: l.name, location_number: l.location_number ?? "", address: l.address ?? "",
    city: l.city ?? "", state: l.state ?? "", zip: l.zip ?? "", region: l.region ?? "", local_area: l.local_area ?? "", lat: l.lat, lon: l.lon,
    delivery_type: l.delivery_type, notes: l.notes ?? "",
    tanks: tanks
      .filter((t) => t.location_id === l.location_id)
      .sort((a, b) => a.tank_number.localeCompare(b.tank_number, undefined, { numeric: true }))
      .map((t) => ({ tank_id: t.tank_id, tank_number: t.tank_number, product_id: t.product_id ?? "", capacity: t.capacity_gallons == null ? "" : String(t.capacity_gallons), hose: t.hose_length_ft == null ? "" : String(t.hose_length_ft) })),
    removedTankIds: [],
  };
}

async function countyOf(place: { address: string; city: string; state: string; zip: string }): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token || !place.city || !place.state) return null;
    const q = new URLSearchParams({ county: "1", city: place.city, state: place.state, address: place.address, zip: place.zip });
    const res = await fetch(`/api/geocode?${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const j = (await res.json()) as { county?: string | null };
    return j.county ?? null;
  } catch {
    return null;
  }
}

async function geocode(city: string, state: string): Promise<{ lat: number; lon: number; county?: string | null } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch(`/api/geocode?city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { lat: number; lon: number; county?: string | null };
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
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [areaRows, setAreaRows] = useState<{ name: string; region: string | null }[]>([]);
  useEffect(() => {
    let off = false;
    supabase.from("equipment_local_areas").select("name, equipment_regions(name)").eq("company_id", companyId).eq("is_active", true).order("name")
      .then(({ data }) => { if (!off) setAreaRows(((data ?? []) as any[]).map((a) => ({ name: String(a.name), region: a.equipment_regions?.name ?? null }))); });
    return () => { off = true; };
  }, [companyId]);
  useEffect(() => {
    let off = false;
    supabase.from("equipment_regions").select("name").eq("company_id", companyId).eq("is_active", true).order("name")
      .then(({ data }) => { if (!off) setRegionOptions(((data ?? []) as { name: string }[]).map((r) => r.name)); });
    return () => { off = true; };
  }, [companyId]);

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

  // The very same store is never saved twice.
  const sameStores = useMemo(
    () => sameStore(existing, { name: draft.name, location_number: draft.location_number || null, address: draft.address || null, city: draft.city || null, state: draft.state || null }, draft.location_id),
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
    if (sameStores.length > 0) return setErr(`${locationTitle(sameStores[0])} in ${locationPlace(sameStores[0])} is already saved. Use that one.`);
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
      // County comes from the address (or the city), never from the pin: the person adding this may not be at the site.
      const addressChanged = !location || (location.address ?? "") !== draft.address.trim();
      const county = placeChanged || addressChanged || !location?.county
        ? await countyOf({ address: draft.address.trim(), city: draft.city.trim(), state: draft.state.trim(), zip: draft.zip.trim() })
        : null;
      const now = new Date().toISOString();
      const row = {
        company_id: companyId,
        name: draft.name.trim().replace(/\s+/g, " "),
        location_number: draft.location_number.trim() || null,
        address: draft.address.trim() || null,
        city: draft.city.trim() || null,
        state: draft.state.trim().toUpperCase() || null,
        zip: draft.zip.trim() || null,
        region: draft.region.trim() || null,
        local_area: draft.local_area.trim() || null,
        lat, lon,
        ...(county ? { county } : {}),
        delivery_type: draft.delivery_type,
        notes: draft.notes.trim() || null,
        client_updated_at: now,
      };
      const write = (r: Partial<typeof row>) => draft.location_id
        ? supabase.from("delivery_locations").update(r).eq("location_id", draft.location_id).select("location_id").single()
        : supabase.from("delivery_locations").insert({ ...r, created_by: userId }).select("location_id").single();
      let res = await write(row);
      // Before the 2026-10-11 migration there is no zip column; save without it.
      if (res.error && /zip|region|local_area|county/i.test(res.error.message)) {
        const { zip: _zip, region: _region, local_area: _la, ...older } = row;
        res = await write(older);
      }
      if (res.error) throw new Error(res.error.message);
      const locationId = (res.data as { location_id: string }).location_id;

      // Tanks: existing ones by id, new ones by number, removed ones retired.
      const keep = draft.tanks.filter((t) => t.tank_number.trim());
      const kept = keep.filter((t) => t.tank_id).map((t) => ({
        tank_id: t.tank_id, location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), hose_length_ft: numOrNull(t.hose), is_active: true, client_updated_at: now,
      }));
      const added = keep.filter((t) => !t.tank_id).map((t) => ({
        location_id: locationId, tank_number: t.tank_number.trim(), product_id: t.product_id || null,
        capacity_gallons: numOrNull(t.capacity), hose_length_ft: numOrNull(t.hose), is_active: true, client_updated_at: now,
      }));
      // Before the 2026-10-19 migration tanks have no hose_length_ft column.
      const upsertTanks = async (rows: Record<string, unknown>[], onConflict: string) => {
        let r = await supabase.from("delivery_location_tanks").upsert(rows, { onConflict });
        if (r.error && /hose_length_ft/i.test(r.error.message)) {
          r = await supabase.from("delivery_location_tanks").upsert(rows.map(({ hose_length_ft: _h, ...x }) => x), { onConflict });
        }
        if (r.error) throw new Error(r.error.message);
      };
      if (draft.removedTankIds.length) {
        const r = await supabase.from("delivery_location_tanks").update({ is_active: false, client_updated_at: now }).in("tank_id", draft.removedTankIds);
        if (r.error) throw new Error(r.error.message);
      }
      if (kept.length) await upsertTanks(kept, "tank_id");
      if (added.length) {
        // A number that was retired earlier comes back to life on the same row.
        await upsertTanks(added, "location_id,tank_number");
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
        {regionOptions.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={fieldLabel}>Region</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {regionOptions.map((r) => {
                const on = draft.region === r;
                return (
                  <button key={r} type="button" onClick={() => patch({ region: on ? "" : r, local_area: "" })}
                    style={{ padding: "7px 12px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)", background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.8)" }}>{r}</button>
                );
              })}
            </div>
            <div style={{ fontSize: 12, color: muted, marginTop: 4 }}>Used when a load headed here is parked.</div>
          </div>
        )}
        {draft.region && areaRows.some((a) => a.region === draft.region) && (
          <div style={{ marginBottom: 10 }}>
            <div style={fieldLabel}>Local area</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {areaRows.filter((a) => a.region === draft.region).map((a) => {
                const on = draft.local_area === a.name;
                return (
                  <button key={a.name} type="button" onClick={() => patch({ local_area: on ? "" : a.name })}
                    style={{ padding: "7px 12px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer",
                      border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)", background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.8)" }}>{a.name}</button>
                );
              })}
            </div>
          </div>
        )}
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
          placeholder="Gate code, where the fills are, anything to know before you get out…" style={{ ...fieldInput, resize: "vertical", fontFamily: "inherit" }} />
      </div>

      <div style={sectionCard}>
        <div style={sectionTitle}>Tanks</div>
        {draft.tanks.length === 0 && <div style={{ fontSize: 14, color: muted, marginBottom: 8 }}>None yet. Tanks are also remembered as you deliver.</div>}
        {draft.tanks.map((t, i) => (
          <div key={t.tank_id ?? `new-${i}`} style={{ display: "grid", gridTemplateColumns: "56px 1fr 70px 62px 24px", gap: 6, alignItems: "center", marginBottom: 8 }}>
            <input value={t.tank_number} onChange={(e) => patchTank(i, { tank_number: e.target.value })} placeholder="Tank" style={smallInput} />
            <CustomSelect value={t.product_id} onChange={(v) => patchTank(i, { product_id: v })} options={productOptions} buttonStyle={smallInput} />
            <input value={t.capacity} onChange={(e) => patchTank(i, { capacity: e.target.value })} placeholder="Gal" inputMode="numeric" style={smallInput} />
            <input value={t.hose} onChange={(e) => patchTank(i, { hose: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Hose ft" inputMode="decimal" style={smallInput} />
            <button type="button" aria-label="Remove tank"
              onClick={() => setDraft((d) => ({ ...d, tanks: d.tanks.filter((_, j) => j !== i), removedTankIds: t.tank_id ? [...d.removedTankIds, t.tank_id] : d.removedTankIds }))}
              style={{ border: "none", background: "transparent", color: muted, fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft((d) => ({ ...d, tanks: [...d.tanks, { tank_id: null, tank_number: "", product_id: "", capacity: "", hose: "" }] }))} style={dashedBtn}>
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
      <button aria-busy={!!(busy)} type="button" onClick={() => void save()} disabled={busy || sameStores.length > 0} style={{ ...primaryBtn, opacity: busy || sameStores.length > 0 ? 0.5 : 1 }}>
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
