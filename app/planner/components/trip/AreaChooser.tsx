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
import { HAIR, MUTE, PANEL } from "./deliveryUi";

type Step = "state" | "county" | "city";

export function AreaChooser({ open, locations, value, requireCity, noCounty, noCity, onPick, onSearch, onClose }: {
  open: boolean;
  locations: DeliveryLocation[];
  value: AreaPick;
  requireCity?: boolean;
  /** Terminals: state, then city, no county step. */
  noCounty?: boolean;
  /** Stop at the state (and county): the caller lists the cities itself. */
  noCity?: boolean;
  onPick: (p: AreaPick) => void;
  /** Optional: "Search by number, name or city" instead of narrowing by area. */
  onSearch?: () => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>("state");
  const [pick, setPick] = useState<AreaPick>(value);

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
    if (cs.length <= 1) {
      if (noCity) { onPick({ state, county: cs[0]?.value ?? "", city: "" }); onClose(); return; }
      setPick({ state, county: cs[0]?.value ?? "", city: "" }); setStep("city");
    }
    else { setPick({ state, county: "", city: "" }); setStep("county"); }
  };
  const afterCounty = (county: string) => {
    if (noCity) { onPick({ ...pick, county, city: "" }); onClose(); return; }
    setPick((p) => ({ ...p, county, city: "" })); setStep("city");
  };
  const finish = (city: string) => { onPick({ ...pick, city }); onClose(); };

  const row = (o: AreaOption, onTap: () => void, selected: boolean) => (
    <button key={o.value} type="button" onClick={onTap}
      style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px 13px 0", cursor: "pointer", textAlign: "left", color: "#fff", border: "none", borderTop: `1px solid ${HAIR}`, background: "#0f0f10" }}>
      <span aria-hidden style={{ width: 4, alignSelf: "stretch", background: selected ? "#fff" : "transparent", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{o.label}</span>
      <span className="dash-num" style={{ fontSize: 12, color: MUTE }}>{o.count}</span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
  const allRow = (label: string, count: number, onTap: () => void) => row({ value: "", label, count }, onTap, false);
  const total = (os: AreaOption[]) => os.reduce((t, o) => t + o.count, 0);

  const title = "Select Location";
  const back = step === "city" && !noCounty && (counties.length > 1) ? () => setStep("county")
    : step !== "state" && states.length > 1 ? () => setStep("state") : null;

  return (
    <FullscreenModal open={open} title={title} onClose={onClose} footer={null}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 12 }}>
        {back ? <button type="button" onClick={back} style={linkBtn}>‹ Back</button> : <span />}
        {onSearch && <button type="button" onClick={onSearch} style={linkBtn}>Search by number or name</button>}
      </div>
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
            {cities.map((o) => row(o, () => finish(o.value), o.value.toLowerCase() === value.city.toLowerCase() && o.value !== ""))}
          </>
        )}
      </div>
    </FullscreenModal>
  );
}
