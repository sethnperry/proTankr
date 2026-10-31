"use client";
// app/planner/components/locations/DeliveryHub.tsx
//
// The delivery-location screen, laid out like the Terminal screen: the selected store up top (star it to
// keep it in Favorites), its tanks and hose lengths, the last deliveries there, then actions. "Search
// Locations" opens the list: your starred stores on top, everything else in the area behind an expander,
// Change to move to another state, county or city, and + New location at the bottom.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DashStyles } from "../../home/dashLook";
import { useDeliveryLocationList } from "@/lib/trips/useTripData";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { useStoreDeliveries } from "../../hooks/useDashboardCards";
import { locationTitle, type LatLon } from "@/lib/trips/deliveryLocations";
import { LocationBrowser } from "../trip/LocationPicker";
import { LocationEditor } from "../trip/LocationEditor";
import { useCountySweep } from "../trip/DeliveryLocationsModal";
import { CAPS, Label, MUTE, HAIR, PANEL, primary, dark } from "../trip/deliveryUi";
import { productColorFor } from "../../utils/productColor";
import { formatMDY } from "../../utils/dates";

function Readout({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div style={{ background: "#0f0f10", padding: "10px 12px", minWidth: 0 }}>
      <div style={CAPS}>{label}</div>
      <div className="dash-num" style={{ fontSize: 18, fontWeight: 800, marginTop: 6, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTE, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

export function DeliveryHub({ open, onClose, companyId, userId, origin = null }: { open: boolean; onClose: () => void; companyId: string | null; userId: string | null; origin?: LatLon | null }) {
  const list = useDeliveryLocationList(companyId, userId);
  useCountySweep(open, list.locations, list.loading, list.reload);
  const products = useProductsCatalog().data;

  // The one the driver last picked, remembered on this phone (the dashboard shares it).
  const key = userId ? `proTankr:u:${userId}:deliveryLocation` : null;
  const [selId, setSelId] = useState<string | null>(null);
  useEffect(() => { if (!key) return; try { setSelId(localStorage.getItem(key)); } catch { /* blocked */ } }, [key, open]);
  const select = (id: string) => { setSelId(id); if (key) try { localStorage.setItem(key, id); } catch { /* blocked */ } };

  const loc = useMemo(() => list.locations.find((l) => l.location_id === selId) ?? null, [list.locations, selId]);
  const tanks = useMemo(() => list.tanks.filter((t) => t.location_id === loc?.location_id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.tank_number.localeCompare(b.tank_number, undefined, { numeric: true })), [list.tanks, loc]);
  const recent = useStoreDeliveries(open ? loc?.location_id ?? null : null, open, 5);

  const [search, setSearch] = useState(false);
  const [editing, setEditing] = useState<"edit" | "new" | null>(null);
  // First time here with nothing picked: go straight to the search list.
  useEffect(() => { if (open && !list.loading && list.locations.length > 0 && !loc) setSearch(true); }, [open, list.loading, list.locations.length, loc]);

  const pinfo = (id: string | null) => {
    const p = id ? products.find((x) => x.product_id === id) : null;
    const nm = String(p?.display_name || p?.product_name || "Product");
    return { code: String(p?.button_code ?? (nm.split(" ")[0] || "PRD")).trim().toUpperCase(), hex: (p?.hex_code as string | null) || productColorFor(nm) };
  };
  const lastDrop = recent.items[0]?.leftAt ?? null;
  const place = loc ? [loc.city, loc.state].filter(Boolean).join(", ") : "";

  return (
    <>
      <DashStyles />
      <FullscreenModal open={open && !search && !editing} title={loc ? locationTitle(loc) : "Deliveries"} onClose={onClose} footer={null}>
        {!loc ? (
          <div style={{ ...PANEL, padding: 16, fontSize: 14, color: MUTE, marginBottom: 12 }}>No delivery location selected.</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>{locationTitle(loc)}</div>
                <div style={{ fontSize: 14, color: MUTE, marginTop: 6 }}>{[place, loc.address].filter(Boolean).join(" · ")}</div>
              </div>
              <button type="button" aria-label={loc.starred ? "Remove from Favorites" : "Add to Favorites"} onClick={() => void list.toggleStar(loc.location_id, !loc.starred)}
                style={{ background: "none", border: `1px solid ${HAIR}`, width: 40, height: 40, cursor: "pointer", fontSize: 18, color: loc.starred ? "rgba(234,179,8,0.95)" : MUTE }}>{loc.starred ? "★" : "☆"}</button>
            </div>

            <Label>Site</Label>
            <div style={{ ...PANEL, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: HAIR }}>
              <Readout label="Delivery type" value={loc.delivery_type === "pump_off" ? "Pump off" : "Drop"} />
              <Readout label="Last delivery" value={lastDrop ? formatMDY(lastDrop.slice(0, 10)) : "—"} sub={recent.items[0] ? recent.items[0].who : "None on record"} />
            </div>
            {loc.notes && <div style={{ ...PANEL, padding: 12, marginTop: 8, fontSize: 14, color: "rgba(255,255,255,0.8)", whiteSpace: "pre-wrap" }}>{loc.notes}</div>}

            <Label right={<span className="dash-num" style={{ fontSize: 12, color: MUTE }}>{tanks.length}</span>}>Tanks</Label>
            <div style={PANEL}>
              {tanks.length === 0 && <div style={{ padding: 14, fontSize: 14, color: MUTE }}>None yet. Tanks are remembered as you deliver, or add them in Edit.</div>}
              {tanks.map((t, i) => {
                const p = pinfo(t.product_id);
                return (
                  <div key={t.tank_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px 12px 0", borderTop: i ? `1px solid ${HAIR}` : "none" }}>
                    <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: p.hex }} />
                    <span className="dash-num" style={{ width: 34, fontWeight: 800 }}>{t.tank_number}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 800 }}>{t.product_id ? p.code : "—"}</span>
                    <span className="dash-num" style={{ fontSize: 14, fontWeight: 700 }}>{t.capacity_gallons ? t.capacity_gallons.toLocaleString() : "—"}</span>
                    <span className="dash-num" style={{ width: 56, textAlign: "right", fontSize: 13, color: MUTE }}>{t.hose_length_ft != null ? `${t.hose_length_ft} ft` : "—"}</span>
                  </div>
                );
              })}
            </div>

            <Label>Recent deliveries</Label>
            <div style={PANEL}>
              {recent.items.length === 0 && <div style={{ padding: 14, fontSize: 14, color: MUTE }}>{recent.loading ? "Loading…" : "None on record."}</div>}
              {recent.items.map((d, i) => (
                <div key={d.deliveryId} style={{ padding: "11px 14px", borderTop: i ? `1px solid ${HAIR}` : "none" }}>
                  <div style={{ display: "flex", gap: 8, fontSize: 14, fontWeight: 700 }}>
                    <span style={{ flex: 1 }}>{d.who}</span>
                    <span className="dash-num" style={{ color: MUTE, fontWeight: 600 }}>{d.leftAt ? formatMDY(d.leftAt.slice(0, 10)) : ""}</span>
                  </div>
                  <div style={{ fontSize: 12, color: MUTE, marginTop: 3 }}>
                    {d.products.map((p) => `${pinfo(p.productId).code} ${Math.round(p.gallons).toLocaleString()}`).join(" · ") || "—"}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 18 }}><button type="button" onClick={() => setEditing("edit")} style={primary}>Edit location</button></div>
          </>
        )}
        <div style={{ marginTop: 10 }}><button type="button" onClick={() => setSearch(true)} style={dark}>Search Locations</button></div>
      </FullscreenModal>

      <FullscreenModal open={open && search && !editing} title="Delivery locations" onClose={() => { setSearch(false); if (!loc) onClose(); }} footer={null}>
        {search && (
          <LocationBrowser origin={origin} locations={list.locations} tanks={list.tanks} companyId={companyId} userId={userId}
            selectedLocationId={loc?.location_id ?? null}
            onToggleStar={list.toggleStar}
            onChanged={() => void list.reload()}
            onPick={(to) => { if (to.locationId) select(to.locationId); setSearch(false); }} />
        )}
      </FullscreenModal>

      <FullscreenModal open={open && !!editing} title={editing === "new" ? "New location" : "Edit location"} onClose={() => setEditing(null)} footer={null}>
        {editing && companyId && userId && (
          <LocationEditor key={loc?.location_id ?? "new"} companyId={companyId} userId={userId} location={editing === "edit" ? loc : null}
            tanks={list.tanks} existing={list.locations} products={products}
            seedName="" onSaved={(l) => { void list.reload(); select(l.location_id); setEditing(null); }}
            onRetired={() => { void list.reload(); setEditing(null); }} />
        )}
      </FullscreenModal>
    </>
  );
}
