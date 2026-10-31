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
import dynamic from "next/dynamic";
import { supabase } from "@/lib/supabase/client";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { locationPlace, locationTitle, type DeliveryLocation, type LocationTank } from "@/lib/trips/deliveryLocations";
import { sameStore, similarLocations } from "@/lib/trips/refs";
import type { DeliveryType } from "@/lib/trips/types";
import { linkBtn, numOrNull } from "./tripUi";
import { CAPS, Chip, FIELD, FIELD_SM, Field, HAIR, Label, MUTE, PANEL, Segmented, primary } from "./deliveryUi";

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
  const [geoPinned, setGeoPinned] = useState(false); // coordinates came from GPS or the map, keep them
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

  // Zip code from the street address, once the address, city and state are in (and only while the zip is blank).
  useEffect(() => {
    const { address, city, state, zip } = draft;
    if (zip.trim() || !address.trim() || !city.trim() || state.trim().length < 2) return;
    let off = false;
    const t = window.setTimeout(async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const q = new URLSearchParams({ zip: "1", address: address.trim(), city: city.trim(), state: state.trim() });
        const res = await fetch(`/api/geocode?${q}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const j = (await res.json()) as { zip?: string | null };
        if (!off && j.zip) setDraft((d) => (d.zip.trim() ? d : { ...d, zip: j.zip! }));
      } catch { /* the zip can be typed */ }
    }, 900);
    return () => { off = true; window.clearTimeout(t); };
  }, [draft.address, draft.city, draft.state, draft.zip]);
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

  const F = (label: string, node: React.ReactNode, style?: React.CSSProperties) => <Field label={label} style={style}>{node}</Field>;
  const chips = (items: string[], cur: string, onTap: (v: string) => void) => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((r) => <Chip key={r} on={cur === r} onClick={() => onTap(r)}>{r}</Chip>)}
    </div>
  );

  return (
    <div>
      <Label first>Location</Label>
      <div style={{ ...PANEL, padding: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginBottom: 12 }}>
          {F("Name", <input value={draft.name} onChange={(e) => patch({ name: e.target.value })} style={FIELD} placeholder="Loves" />)}
          {F("Number", <input value={draft.location_number} onChange={(e) => patch({ location_number: e.target.value })} style={FIELD} placeholder="Store #" />)}
        </div>
        {F("Street address", <input value={draft.address} onChange={(e) => patch({ address: e.target.value })} style={FIELD} placeholder="123 Main St" />, { marginBottom: 12 })}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 70px 1fr", gap: 10 }}>
          {F("City", <input value={draft.city} onChange={(e) => { patch({ city: e.target.value }); setGeoPinned(false); }} style={FIELD} />)}
          {F("State", <input value={draft.state} maxLength={2} onChange={(e) => { patch({ state: e.target.value }); setGeoPinned(false); }} style={FIELD} placeholder="FL" />)}
          {F("Zip", <input value={draft.zip} maxLength={10} inputMode="numeric" onChange={(e) => patch({ zip: e.target.value })} style={FIELD} />)}
        </div>
      </div>

      {(regionOptions.length > 0 || (draft.region && areaRows.some((a) => a.region === draft.region))) && (
        <>
          <Label>Territory</Label>
          <div style={{ ...PANEL, padding: 14 }}>
            {regionOptions.length > 0 && F("Region", <>
              {chips(regionOptions, draft.region, (r) => patch({ region: draft.region === r ? "" : r, local_area: "" }))}
              <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Used when a load headed here is parked.</div>
            </>)}
            {draft.region && areaRows.some((a) => a.region === draft.region) && F("Local area",
              chips(areaRows.filter((a) => a.region === draft.region).map((a) => a.name), draft.local_area, (n) => patch({ local_area: draft.local_area === n ? "" : n })),
              { marginTop: regionOptions.length > 0 ? 14 : 0 })}
          </div>
        </>
      )}

      <Label>Position</Label>
      <div style={{ ...PANEL, padding: 14, display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="dash-num" style={{ fontSize: 15, fontWeight: 700 }}>
            {draft.lat != null && draft.lon != null ? `${draft.lat.toFixed(3)}, ${draft.lon.toFixed(3)}${geoPinned ? " · pinned" : ""}` : "No coordinates yet"}
          </div>
          <div style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>At the site? Use your location. Otherwise the city is looked up on save.</div>
        </div>
        <button type="button" onClick={useMyLocation} style={{ flexShrink: 0, padding: "9px 12px", border: `1px solid ${HAIR}`, background: "#050505", color: "#fff", ...CAPS, letterSpacing: "0.1em", cursor: "pointer" }}>Use mine</button>
      </div>

      <Label>Delivery type</Label>
      <div style={{ ...PANEL, padding: 14 }}>
        <Segmented value={draft.delivery_type as "drop" | "pump_off"} onChange={(v) => patch({ delivery_type: v })}
          options={[{ id: "drop", label: "Drop" }, { id: "pump_off", label: "Pump off" }]} />
        {F("Notes", <textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} rows={3}
          placeholder="Gate code, where the fills are, anything to know before you get out…" style={{ ...FIELD, resize: "vertical", fontFamily: "inherit" }} />, { marginTop: 14 })}
      </div>

      <Label right={<span className="dash-num" style={{ fontSize: 12, color: MUTE }}>{draft.tanks.length}</span>}>Tanks</Label>
      <div style={{ ...PANEL }}>
        {draft.tanks.length === 0 && <div style={{ fontSize: 14, color: MUTE, padding: 14 }}>None yet. Tanks are also remembered as you deliver.</div>}
        {draft.tanks.map((t, i) => (
          <div key={t.tank_id ?? `new-${i}`} style={{ display: "grid", gridTemplateColumns: "56px 1fr 70px 62px 24px", gap: 6, alignItems: "center", padding: "10px 12px", borderTop: i ? `1px solid ${HAIR}` : "none" }}>
            <input value={t.tank_number} onChange={(e) => patchTank(i, { tank_number: e.target.value })} placeholder="Tank" style={FIELD_SM} />
            <CustomSelect value={t.product_id} onChange={(v) => patchTank(i, { product_id: v })} options={productOptions} buttonStyle={FIELD_SM} />
            <input value={t.capacity} onChange={(e) => patchTank(i, { capacity: e.target.value })} placeholder="Gal" inputMode="numeric" style={FIELD_SM} />
            <input value={t.hose} onChange={(e) => patchTank(i, { hose: e.target.value.replace(/[^0-9.]/g, "") })} placeholder="Hose ft" inputMode="decimal" style={FIELD_SM} />
            <button type="button" aria-label="Remove tank"
              onClick={() => setDraft((d) => ({ ...d, tanks: d.tanks.filter((_, j) => j !== i), removedTankIds: t.tank_id ? [...d.removedTankIds, t.tank_id] : d.removedTankIds }))}
              style={{ border: "none", background: "transparent", color: MUTE, fontSize: 18, cursor: "pointer" }}>×</button>
          </div>
        ))}
        <button type="button" onClick={() => setDraft((d) => ({ ...d, tanks: [...d.tanks, { tank_id: null, tank_number: "", product_id: "", capacity: "", hose: "" }] }))}
          style={{ width: "100%", padding: "12px 0", border: "none", borderTop: `1px solid ${HAIR}`, background: "#050505", color: "#fff", ...CAPS, letterSpacing: "0.1em", cursor: "pointer" }}>
          + Tank
        </button>
      </div>

      {similar.length > 0 && (
        <div style={{ ...PANEL, border: "1px solid rgba(251,191,36,0.5)", padding: 14, marginTop: 18 }}>
          <div style={{ ...CAPS, color: "#fbbf24", marginBottom: 8 }}>
            {similar.length === 1 ? "This looks like a saved location" : "These look like saved locations"}
          </div>
          {similar.slice(0, 3).map((l) => (
            <div key={l.location_id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{locationTitle(l)}</div>
                <div style={{ fontSize: 12, color: MUTE }}>{[l.address, locationPlace(l)].filter(Boolean).join(", ")}</div>
              </div>
              {onUseExisting && (
                <button type="button" onClick={() => onUseExisting(l)} style={{ ...linkBtn, fontWeight: 700 }}>Use this one</button>
              )}
            </div>
          ))}
        </div>
      )}

      {err && <div style={{ color: "#f87171", fontSize: 14, margin: "14px 0 0" }}>{err}</div>}
      <button aria-busy={!!(busy)} type="button" onClick={() => void save()} disabled={busy || sameStores.length > 0}
        style={{ ...primary, marginTop: 18, opacity: busy || sameStores.length > 0 ? 0.5 : 1 }}>
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
