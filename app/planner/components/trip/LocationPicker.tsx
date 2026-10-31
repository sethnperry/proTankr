"use client";
// app/planner/components/trip/LocationPicker.tsx
//
// The one delivery-location list. Used to pick a delivery (the left three quarters of a card selects it)
// and, with no onPick (the Delivery Locations page), to manage them (the whole card opens it). The right
// quarter of every card opens the editor. "Showing Tampa, FL · Change" narrows State > County > City,
// the search box finds a store by number, name or city anywhere, and "+ New location" adds one.

import React, { useEffect, useMemo, useState } from "react";
import { AreaChooser } from "./AreaChooser";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import {
  byNumberThenName,
  defaultLocationCity,
  filterLocations,
  locationTitle,
  type DeliveryLocation,
  type LatLon,
  type LocationTank,
} from "@/lib/trips/deliveryLocations";
import { cityOptions, inArea, type AreaPick } from "@/lib/trips/areaTree";
import { stateName } from "@/lib/geo/usStates";
import type { DeliveryDestination } from "@/lib/trips/tripFlow";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { linkBtn } from "./tripUi";
import { CAPS, FIELD, HAIR, MUTE, PANEL } from "./deliveryUi";
import { LocationEditor } from "./LocationEditor";

const PAGE = 60;

export function LocationBrowser({
  origin = null, locations, tanks = [], companyId, userId, onPick, onChanged, selectedLocationId = null, onToggleStar,
}: {
  origin?: LatLon | null;
  locations: DeliveryLocation[];
  tanks?: LocationTank[];
  companyId: string | null;
  userId: string | null;
  /** Select a delivery. Without it (the manage page) the whole card opens the editor. */
  onPick?: (to: DeliveryDestination) => void;
  /** After a location is added, edited or retired, so the caller can reload its list. */
  onChanged?: () => void;
  selectedLocationId?: string | null;
  /** Star or unstar a location (kept per driver). */
  onToggleStar?: (locationId: string, star: boolean) => void | Promise<void>;
}) {
  const [area, setArea] = useState<AreaPick | null>(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [showAll, setShowAll] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  // Starred cities are kept on this phone, per driver; starred stores are kept in the database.
  const starsKey = `proTankr:deliveryCityStars:${userId || "anon"}`;
  const [cityStars, setCityStars] = useState<Set<string>>(new Set());
  useEffect(() => {
    try { const raw = JSON.parse(localStorage.getItem(starsKey) || "[]"); setCityStars(new Set(Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === "string") : [])); } catch { setCityStars(new Set()); }
  }, [starsKey]);
  const cityKey = (st: string, c: string) => `${st.trim().toUpperCase()}||${c.trim().toLowerCase()}`;
  const toggleCity = (st: string, c: string) => setCityStars((prev) => {
    const next = new Set(prev); const k = cityKey(st, c);
    next.has(k) ? next.delete(k) : next.add(k);
    try { localStorage.setItem(starsKey, JSON.stringify([...next])); } catch { /* storage blocked */ }
    return next;
  });
  // undefined = the list; null = a new location; a row = editing it.
  const [editing, setEditing] = useState<DeliveryLocation | null | undefined>(undefined);
  const { data: products } = useProductsCatalog();

  // Open on the selected delivery's city, else the one nearest the pickup, else the first.
  useEffect(() => {
    if (area || locations.length === 0) return;
    const key = defaultLocationCity(locations, { selectedId: selectedLocationId, origin });
    const l = key ? locations.find((x) => `${(x.city ?? "").trim().toLowerCase()}|${(x.state ?? "").trim().toUpperCase()}` === key) : null;
    setArea({ state: l ? (l.state ?? "").trim().toUpperCase() : "", county: "", city: "" });
  }, [area, locations, selectedLocationId, origin]);

  const searching = !!query.trim();
  const list = useMemo(() => {
    const base = searching ? filterLocations(locations, { origin: null, nearMe: false, query }) : inArea(locations, area ?? { state: "", county: "", city: "" });
    return [...base].sort(byNumberThenName);
  }, [locations, area, query, searching]);
  // Starred stores are always up top, in every area; the rest of the area waits behind "Show all".
  const favorites = useMemo(() => locations.filter((l) => l.starred && l.is_active !== false).sort(byNumberThenName), [locations]);
  const others = useMemo(() => list.filter((l) => !l.starred), [list]);
  const shown = searching ? list : showAll || favorites.length === 0 ? others : [];

  const cityList = useMemo(() => cityOptions(locations, area?.state ?? "", area?.county ?? ""), [locations, area?.state, area?.county]);
  const favCities = cityList.filter((c) => cityStars.has(cityKey(area?.state ?? "", c.value)));
  const restCities = cityList.filter((c) => !cityStars.has(cityKey(area?.state ?? "", c.value)));
  // A starred store whose city isn't starred still shows up top.
  const favStoresElsewhere = useMemo(() => locations.filter((l) => l.starred && l.is_active !== false
    && !cityStars.has(cityKey((l.state ?? "").trim(), (l.city ?? "").trim()))).sort(byNumberThenName), [locations, cityStars]);

  const pick = (l: DeliveryLocation) => onPick?.({ locationId: l.location_id, oneOffName: null, deliveryType: l.delivery_type });
  const done = () => { onChanged?.(); setEditing(undefined); };

  if (editing !== undefined && companyId && userId) {
    return (
      <>
        <button type="button" onClick={() => setEditing(undefined)} style={{ ...linkBtn, marginBottom: 12 }}>‹ Back to list</button>
        <LocationEditor
          key={editing?.location_id ?? "new"}
          companyId={companyId}
          userId={userId}
          location={editing}
          tanks={tanks}
          existing={locations}
          products={products}
          seedName={editing ? "" : query.trim()}
          onSaved={(l) => { onChanged?.(); if (!editing && onPick) pick(l); else setEditing(undefined); }}
          onUseExisting={(l) => (onPick && !editing ? pick(l) : setEditing(l))}
          onRetired={done}
        />
      </>
    );
  }

  // Cities and stores look like the terminal Select Location screen: starred first, the rest behind a toggle.
  const row = (key: string, starred: boolean, onStar: () => void, onTap: () => void, active: boolean, title: string, sub?: string, onEdit?: () => void) => (
    <div key={key} role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      className={["flex items-center rounded-[2px] border cursor-pointer select-none hover:bg-white/5", active ? "border-white/30 bg-white/5" : "border-white/10"].join(" ")}>
      <button type="button" aria-label={starred ? "Unstar" : "Star"} onClick={(e) => { e.stopPropagation(); onStar(); }}
        style={{ flexShrink: 0, width: 26, height: 26, marginLeft: 12, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, lineHeight: 1, cursor: "pointer", background: "transparent",
          border: `1px solid ${starred ? "rgba(234,179,8,0.55)" : "rgba(255,255,255,0.30)"}`, color: starred ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.30)" }}>{starred ? "★" : "☆"}</button>
      <div className="min-w-0 flex-1 px-3 py-3">
        <div className="text-sm font-semibold text-white truncate">{title}</div>
        {sub ? <div className="text-xs text-white/50 truncate mt-0.5">{sub}</div> : null}
      </div>
      {onEdit && (
        <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(); }} aria-label={`Edit ${title}`}
          style={{ flexShrink: 0, padding: "0 14px", alignSelf: "stretch", background: "transparent", border: "none", borderLeft: `1px solid ${HAIR}`, color: MUTE, ...CAPS, cursor: "pointer" }}>Edit ›</button>
      )}
    </div>
  );
  const toggleBtn = (open: boolean, onClick: () => void, label: string) => (
    <button type="button" onClick={onClick}
      className="w-full flex items-center justify-between rounded-[2px] border border-white/10 px-3 py-2.5 text-xs font-semibold text-white/50 hover:bg-white/5">
      <span>{label}</span><span className="text-white/30">{open ? "▲" : "▼"}</span>
    </button>
  );
  const heading = (t: string) => <div className="mb-2 text-xs uppercase tracking-wide text-white/50">{t}</div>;
  const storeRow = (l: DeliveryLocation, withCity: boolean) =>
    row(l.location_id, l.starred, () => void onToggleStar?.(l.location_id, !l.starred), () => (onPick ? pick(l) : setEditing(l)),
      l.location_id === selectedLocationId, locationTitle(l),
      [withCity ? [l.city, l.state].filter(Boolean).join(", ") : null, l.address, l.delivery_type === "pump_off" ? "Pump off" : null].filter(Boolean).join(" · ") || undefined,
      () => setEditing(l));

  const newBtn = companyId && userId ? (
    <button type="button" onClick={() => setEditing(null)}
      style={{ width: "100%", marginTop: 14, padding: "14px 0", border: `1px solid ${HAIR}`, background: "#050505", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
      + New location{query.trim() ? ` “${query.trim()}”` : ""}
    </button>
  ) : null;

  const cityObj = area?.city ? { state: area.state, city: area.city } : null;
  const storesHere = cityObj ? list : [];
  const favStores = storesHere.filter((l) => l.starred);
  const otherStores = storesHere.filter((l) => !l.starred);

  return (
    <>
      <AreaChooser noCity open={areaOpen} locations={locations} value={area ?? { state: "", county: "", city: "" }}
        onPick={(p) => { setArea({ ...p, city: "" }); setLimit(PAGE); setQuery(""); setShowAll(false); setCitiesOpen(false); }} onClose={() => setAreaOpen(false)} />
      {locations.length === 0 ? (
        <div style={{ ...PANEL, fontSize: 14, color: MUTE, padding: 14 }}>No saved locations yet.</div>
      ) : (
        <div className="space-y-4">
          <input value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} placeholder="Search number, name or city" style={FIELD} />

          {searching ? (
            <div className="grid grid-cols-1 gap-2">
              {list.length === 0 && <div style={{ fontSize: 14, color: MUTE }}>No matches.</div>}
              {list.slice(0, limit).map((l) => storeRow(l, true))}
              {list.length > limit && toggleBtn(false, () => setLimit((n) => n + PAGE), `Show ${Math.min(PAGE, list.length - limit)} more`)}
            </div>
          ) : cityObj ? (
            <>
              <div className="text-sm text-white/70 flex items-center justify-between gap-2">
                <span>Showing stores in <span className="text-white">{cityObj.city}, {cityObj.state}</span></span>
                <button type="button" onClick={() => { setArea({ state: cityObj.state, county: area?.county ?? "", city: "" }); setShowAll(false); }}
                  className="shrink-0 text-xs font-semibold text-white/45 hover:text-white/70">Cities</button>
              </div>
              {favStores.length > 0 && <div>{heading("Favorites")}<div className="grid grid-cols-1 gap-2">{favStores.map((l) => storeRow(l, false))}</div></div>}
              {otherStores.length > 0 && favStores.length > 0 && toggleBtn(showAll, () => setShowAll((v) => !v), showAll ? "Hide all stores" : `Show all stores (${otherStores.length})`)}
              {(showAll || favStores.length === 0) && <div className="grid grid-cols-1 gap-2">{otherStores.slice(0, limit).map((l) => storeRow(l, false))}</div>}
              {newBtn}
            </>
          ) : (
            <>
              <div className="text-sm text-white/70 flex items-center justify-between gap-2">
                <span>Showing cities in <span className="text-white">{area?.county ? `${area.county}, ` : ""}{stateName(area?.state ?? "") || "all states"}</span></span>
                <button type="button" onClick={() => setAreaOpen(true)} className="shrink-0 text-xs font-semibold text-white/45 hover:text-white/70">Change</button>
              </div>
              <div>
                {heading("Favorites")}
                {favCities.length === 0 && favStoresElsewhere.length === 0 ? (
                  <div className="text-sm text-white/40">No favorites yet. Tap the star on a city or a store to pin it here.</div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {favCities.map((c) => row(`c-${c.value}`, true, () => toggleCity(area?.state ?? "", c.value), () => setArea({ state: area?.state ?? "", county: area?.county ?? "", city: c.value }), false, c.value, `${c.count} location${c.count === 1 ? "" : "s"}`))}
                    {favStoresElsewhere.map((l) => storeRow(l, true))}
                  </div>
                )}
              </div>
              {restCities.length > 0 && toggleBtn(citiesOpen, () => setCitiesOpen((v) => !v), citiesOpen ? "Hide all cities" : `Show all cities (${restCities.length})`)}
              {(citiesOpen || (favCities.length === 0 && favStoresElsewhere.length === 0)) && (
                <div className="grid grid-cols-1 gap-2">
                  {restCities.map((c) => row(`c-${c.value}`, false, () => toggleCity(area?.state ?? "", c.value), () => setArea({ state: area?.state ?? "", county: area?.county ?? "", city: c.value }), false, c.value, `${c.count} location${c.count === 1 ? "" : "s"}`))}
                </div>
              )}
              {newBtn}
            </>
          )}
        </div>
      )}
    </>
  );
}

export function LocationPicker({
  open, title, origin = null, locations, tanks = [], companyId, userId, onPick, onClose, onLocationAdded, selectedLocationId = null, onToggleStar,
}: {
  open: boolean;
  title: string;
  origin?: LatLon | null;
  locations: DeliveryLocation[];
  onPick: (to: DeliveryDestination) => void;
  onClose: () => void;
  tanks?: LocationTank[];
  companyId: string | null;
  userId: string | null;
  // Called after a location is added, edited or retired, so the caller can reload its list.
  onLocationAdded?: () => void;
  selectedLocationId?: string | null;
  onToggleStar?: (locationId: string, star: boolean) => void | Promise<void>;
}) {
  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      {open && (
        <LocationBrowser origin={origin} locations={locations} tanks={tanks} companyId={companyId} userId={userId}
          onPick={onPick} onChanged={onLocationAdded} selectedLocationId={selectedLocationId} onToggleStar={onToggleStar} />
      )}
    </FullscreenModal>
  );
}
