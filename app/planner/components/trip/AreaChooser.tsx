"use client";
// app/planner/components/trip/AreaChooser.tsx
//
// The Change window for delivery locations: State, then County (or borough), then City, each a list
// with a count. A level with only one choice is skipped. Used by the delivery picker and the Delivery
// Locations page. `requireCity` (the picker) must end on one city; otherwise every level has an "All" row.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { DeliveryLocation } from "@/lib/trips/deliveryLocations";
import { cityOptions, countyOptions, stateOptions, type AreaOption, type AreaPick } from "@/lib/trips/areaTree";
import { linkBtn } from "./tripUi";
import { CAPS, HAIR, MUTE, PANEL } from "./deliveryUi";

type Step = "state" | "county" | "city";

// Starred delivery cities, kept on this phone per user ("STATE||city").
const starsKey = (userId?: string | null) => `proTankr:deliveryCityStars:${userId || "anon"}`;
const keyOf = (state: string, city: string) => `${state.trim().toUpperCase()}||${city.trim().toLowerCase()}`;

export function AreaChooser({ userId, open, locations, value, requireCity, noCounty, onPick, onSearch, onClose }: {
  userId?: string | null;
  open: boolean;
  locations: DeliveryLocation[];
  value: AreaPick;
  requireCity?: boolean;
  /** Terminals: state, then city, no county step. */
  noCounty?: boolean;
  onPick: (p: AreaPick) => void;
  /** Optional: "Search by number, name or city" instead of narrowing by area. */
  onSearch?: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("state");
  const [pick, setPick] = useState<AreaPick>(value);
  const [stars, setStars] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    if (!open) return;
    try { const raw = JSON.parse(localStorage.getItem(starsKey(userId)) || "[]"); setStars(new Set(Array.isArray(raw) ? raw.filter((x: unknown) => typeof x === "string") : [])); } catch { setStars(new Set()); }
    setShowAll(false);
  }, [open, userId]);
  const toggleStar = (state: string, city: string) => setStars((prev) => {
    const next = new Set(prev); const k = keyOf(state, city);
    next.has(k) ? next.delete(k) : next.add(k);
    try { localStorage.setItem(starsKey(userId), JSON.stringify([...next])); } catch {}
    return next;
  });
  // Every starred city that has locations, any state, for the quick list.
  const starredAll = useMemo(() => {
    const seen = new Map<string, { state: string; city: string; count: number }>();
    for (const l of locations) {
      if (l.is_active === false) continue;
      const st = (l.state ?? "").trim().toUpperCase(), c = (l.city ?? "").trim();
      if (!st || !c || !stars.has(keyOf(st, c))) continue;
      const k = keyOf(st, c); const cur = seen.get(k);
      seen.set(k, { state: st, city: c, count: (cur?.count ?? 0) + 1 });
    }
    return [...seen.values()].sort((x, y) => (x.state + x.city).localeCompare(y.state + y.city));
  }, [locations, stars]);

  const states = useMemo(() => stateOptions(locations), [locations]);
  const counties = useMemo(() => countyOptions(locations, pick.state), [locations, pick.state]);
  const cities = useMemo(() => cityOptions(locations, pick.state, pick.county), [locations, pick.state, pick.county]);

  // Each open starts at the top, skipping levels with a single choice.
  useEffect(() => {
    if (!open) return;
    setPick({ state: "", county: "", city: "" });
    setStep(states.length === 1 ? (noCounty ? "city" : "county") : "state");
    if (states.length === 1) setPick({ state: states[0].value, county: "", city: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const afterState = (state: string) => {
    const cs = noCounty ? [] : countyOptions(locations, state);
    if (cs.length <= 1) { setPick({ state, county: cs[0]?.value ?? "", city: "" }); setStep("city"); }
    else { setPick({ state, county: "", city: "" }); setStep("county"); }
  };
  const afterCounty = (county: string) => { setPick((p) => ({ ...p, county, city: "" })); setStep("city"); };
  const finish = (city: string) => { onPick({ ...pick, city }); onClose(); };

  const star = (state: string, city: string) => {
    const on = stars.has(keyOf(state, city));
    return (
      <span role="button" aria-label={on ? "Unstar city" : "Star city"} tabIndex={0}
        onClick={(e) => { e.stopPropagation(); toggleStar(state, city); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggleStar(state, city); } }}
        style={{ flexShrink: 0, width: 26, height: 26, marginLeft: 12, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer",
          border: `1px solid ${on ? "rgba(234,179,8,0.55)" : "rgba(255,255,255,0.30)"}`, color: on ? "rgba(234,179,8,0.95)" : "rgba(255,255,255,0.30)" }}>{on ? "★" : "☆"}</span>
    );
  };
  const row = (o: AreaOption, onTap: () => void, selected: boolean, starFor?: { state: string; city: string }) => (
    <div key={o.value + (starFor?.state ?? "")} role="button" tabIndex={0} onClick={onTap}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onTap(); } }}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: starFor ? "13px 14px 13px 0" : "13px 14px 13px 0", cursor: "pointer", color: "#fff", borderTop: `1px solid ${HAIR}`, background: "#0f0f10" }}>
      <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: selected ? "#fff" : "transparent", flexShrink: 0 }} />
      {starFor && star(starFor.state, starFor.city)}
      <span style={{ flex: 1, fontSize: 15, fontWeight: 700, paddingLeft: starFor ? 0 : 0 }}>{o.label}</span>
      <span className="dash-num" style={{ fontSize: 12, color: MUTE }}>{o.count}</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </div>
  );
  const allRow = (label: string, count: number, onTap: () => void) => row({ value: "", label, count }, onTap, false);
  const total = (os: AreaOption[]) => os.reduce((t, o) => t + o.count, 0);
  const sub = { ...CAPS, margin: "0 0 8px" } as React.CSSProperties;

  const title = "Select Location";
  const back = step === "city" && !noCounty && (counties.length > 1) ? () => setStep("county")
    : step !== "state" && states.length > 1 ? () => setStep("state") : null;
  const crumb = step === "state" ? "State" : step === "county" ? `Counties${pick.state ? ` · ${pick.state}` : ""}` : `Cities${pick.county ? ` · ${pick.county}` : pick.state ? ` · ${pick.state}` : ""}`;
  const favCities = cities.filter((o) => stars.has(keyOf(pick.state, o.value)));
  const restCities = cities.filter((o) => !stars.has(keyOf(pick.state, o.value)));
  const cityList = showAll || favCities.length === 0 ? restCities : [];

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {back ? <button type="button" onClick={back} style={linkBtn}>‹ Back</button> : <span style={sub}>{crumb}</span>}
        {onSearch && <button type="button" onClick={onSearch} style={linkBtn}>Search by number or name</button>}
      </div>
      {step === "state" && starredAll.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={sub}>Favorites</div>
          <div style={{ ...PANEL, display: "flex", flexDirection: "column" }}>
            {starredAll.map((f) => row({ value: f.city, label: `${f.city}, ${f.state}`, count: f.count }, () => { onPick({ state: f.state, county: "", city: f.city }); onClose(); }, f.state === value.state && f.city.toLowerCase() === value.city.toLowerCase(), { state: f.state, city: f.city }))}
          </div>
        </div>
      )}
      {step === "city" && <div style={sub}>{`${crumb} · favorites`}</div>}
      <div style={{ ...PANEL, display: "flex", flexDirection: "column" }}>
        {step === "state" && (
          <>
            {!requireCity && allRow("All states", total(states), () => { onPick({ state: "", county: "", city: "" }); onClose(); })}
            {states.map((o) => row(o, () => afterState(o.value), o.value === value.state))}
          </>
        )}
        {step === "county" && (
          <>
            {allRow(`All counties${pick.state ? ` in ${pick.state}` : ""}`, total(counties), () => afterCounty(""))}
            {counties.map((o) => row(o, () => afterCounty(o.value), o.value === value.county))}
          </>
        )}
        {step === "city" && (
          <>
            {!requireCity && allRow(`All cities${pick.county ? "" : pick.state ? ` in ${pick.state}` : ""}`, total(cities), () => finish(""))}
            {favCities.length === 0 && <div style={{ padding: 14, fontSize: 13, color: MUTE, borderTop: `1px solid ${HAIR}` }}>No favorite cities here yet. Tap a star to pin one.</div>}
            {favCities.map((o) => row(o, () => finish(o.value), o.value.toLowerCase() === value.city.toLowerCase(), { state: pick.state, city: o.value }))}
            {restCities.length > 0 && favCities.length > 0 && (
              <button type="button" onClick={() => setShowAll((v) => !v)}
                style={{ display: "flex", justifyContent: "space-between", padding: "12px 14px", border: "none", borderTop: `1px solid ${HAIR}`, background: "#050505", color: MUTE, ...CAPS, cursor: "pointer" }}>
                <span>{showAll ? "Hide all cities" : `Show all cities (${restCities.length})`}</span><span>{showAll ? "▲" : "▼"}</span>
              </button>
            )}
            {cityList.map((o) => row(o, () => finish(o.value), o.value.toLowerCase() === value.city.toLowerCase(), { state: pick.state, city: o.value }))}
          </>
        )}
      </div>
    </FullscreenModal>
  );
}
