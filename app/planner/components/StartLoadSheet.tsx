"use client";
// app/planner/components/StartLoadSheet.tsx
//
// Start Load: one review card, everything prefilled (docs/trip-workflow-design.md
// §9). On a normal load the order number is the only thing typed. Add-ons at
// the bottom (+ Order number, + Delivery) only show their rows when tapped.
//
// Presentational: the caller supplies the prefills and does the writing.
// Deliveries are picked from the saved location list (the same picker as the
// dashboard, with "+ New location"), never typed as free text.

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { StartLoadDelivery } from "@/lib/trips/tripLogic";
import { locationPlace, locationTitle, type DeliveryLocation, type LatLon, type LocationTank } from "@/lib/trips/deliveryLocations";
import { LocationPicker } from "./trip/LocationPicker";

export type StartLoadValues = {
  orderNumber: string;
  extraOrderNumbers: string[];
  shipper: string;
  customer: string;
  deliveries: StartLoadDelivery[];
  beginMiles: string;
};

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", borderRadius: 8, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)", padding: "12px 12px", fontSize: 16,
  color: "#fff", boxSizing: "border-box",
};
const row: React.CSSProperties = { marginBottom: 16 };
const addBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.25)",
  background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
const removeBtn: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.45)",
  fontSize: 20, cursor: "pointer", padding: "0 6px", lineHeight: 1,
};

export function StartLoadSheet({
  open,
  editing,
  initial,
  pickupLabel,
  onChangePickup,
  planLabel,
  equipmentLabel,
  locations,
  tanks,
  origin,
  companyId,
  userId,
  onToggleStar,
  onLocationAdded,
  busy,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  editing: boolean;
  initial: StartLoadValues;
  pickupLabel: string | null;
  onChangePickup: () => void;
  planLabel: string;
  equipmentLabel: string;
  locations: DeliveryLocation[];
  tanks: LocationTank[];
  origin: LatLon | null;
  companyId: string | null;
  userId: string | null;
  onToggleStar: (locationId: string, star: boolean) => void;
  onLocationAdded: () => void;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (v: StartLoadValues) => void;
}) {
  const [v, setV] = useState<StartLoadValues>(initial);

  // Re-seed each time the card opens, so a reopen reflects the current trip.
  useEffect(() => {
    if (open) setV(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const byId = useMemo(() => new Map(locations.map((l) => [l.location_id, l])), [locations]);
  const [picking, setPicking] = useState<number | null>(null);

  const setDelivery = (i: number, patch: Partial<StartLoadDelivery>) =>
    setV((s) => ({ ...s, deliveries: s.deliveries.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  const milesOk = v.beginMiles.trim() === "" || Number.isFinite(Number(v.beginMiles));

  return (
    <>
    <FullscreenModal
      open={open}
      title={editing ? "Edit Load" : "Start Load"}
      onClose={onClose}
      footer={
        <div style={{ padding: "12px 16px" }}>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button
            type="button"
            disabled={busy || !milesOk}
            onClick={() => onSubmit(v)}
            style={{
              width: "100%", padding: "16px 0", borderRadius: 12, border: "none",
              background: "#fff", color: "#000", fontSize: 17, fontWeight: 800,
              opacity: busy || !milesOk ? 0.5 : 1, cursor: busy ? "default" : "pointer",
            }}
          >
            {editing ? "Save" : "Start Load"}
          </button>
        </div>
      }
    >
      <div style={{ padding: "4px 16px 24px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>{equipmentLabel}</div>

        <div style={row}>
          <div style={label}>Order number</div>
          <input
            style={input}
            value={v.orderNumber}
            onChange={(e) => setV((s) => ({ ...s, orderNumber: e.target.value }))}
            placeholder="Order #"
            autoFocus={!editing}
            inputMode="text"
          />
        </div>

        {v.extraOrderNumbers.map((n, i) => (
          <div key={`order-${i}`} style={row}>
            <div style={label}>Order number {i + 2}</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <input
                style={input}
                value={n}
                onChange={(e) => setV((s) => ({ ...s, extraOrderNumbers: s.extraOrderNumbers.map((x, j) => (j === i ? e.target.value : x)) }))}
                placeholder="Order #"
              />
              <button type="button" aria-label="Remove order number" style={removeBtn}
                onClick={() => setV((s) => ({ ...s, extraOrderNumbers: s.extraOrderNumbers.filter((_, j) => j !== i) }))}>×</button>
            </div>
          </div>
        ))}

        <div style={{ display: "flex", gap: 10, ...row }}>
          <div style={{ flex: 1 }}>
            <div style={label}>Shipper</div>
            <input style={input} value={v.shipper} onChange={(e) => setV((s) => ({ ...s, shipper: e.target.value }))} placeholder="Shipper" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={label}>Customer</div>
            <input style={input} value={v.customer} onChange={(e) => setV((s) => ({ ...s, customer: e.target.value }))} placeholder="Customer" />
          </div>
        </div>

        <div style={row}>
          <div style={label}>Pickup</div>
          <button type="button" onClick={onChangePickup}
            style={{ ...input, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: pickupLabel ? "#fff" : "rgba(255,255,255,0.45)" }}>{pickupLabel ?? "Select a terminal"}</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
          </button>
        </div>

        {v.deliveries.map((d, i) => {
          const loc = d.locationId ? byId.get(d.locationId) : null;
          const text = loc ? locationTitle(loc) : d.locationId ? "Saved location" : d.oneOffName?.trim() ? `${d.oneOffName.trim()} (not saved)` : null;
          const sub = loc ? [locationPlace(loc), loc.delivery_type === "pump_off" ? "Pump off" : "Drop"].filter(Boolean).join(" · ") : null;
          return (
            <div key={`delivery-${i}`} style={row}>
              <div style={{ ...label, display: "flex", justifyContent: "space-between" }}>
                <span>Delivery{v.deliveries.length > 1 ? ` ${i + 1}` : ""}</span>
                {i > 0 && (
                  <button type="button" aria-label="Remove delivery" style={{ ...removeBtn, fontSize: 16, padding: 0 }}
                    onClick={() => setV((s) => ({ ...s, deliveries: s.deliveries.filter((_, j) => j !== i) }))}>Remove</button>
                )}
              </div>
              <button type="button" onClick={() => setPicking(i)}
                style={{ ...input, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", color: text ? "#fff" : "rgba(255,255,255,0.45)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {text ?? "Choose a delivery location"}
                  </span>
                  {sub && <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)" }}>{sub}</span>}
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
              </button>
            </div>
          );
        })}

        <div style={row}>
          <div style={label}>Beginning miles</div>
          <input
            style={{ ...input, borderColor: milesOk ? "rgba(255,255,255,0.14)" : "#f87171" }}
            value={v.beginMiles}
            onChange={(e) => setV((s) => ({ ...s, beginMiles: e.target.value }))}
            placeholder="Odometer"
            inputMode="decimal"
          />
        </div>

        <div style={row}>
          <div style={label}>Plan</div>
          <div style={{ fontSize: 15, color: "rgba(255,255,255,0.8)" }}>{planLabel}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="button" style={addBtn}
            onClick={() => setV((s) => ({ ...s, extraOrderNumbers: [...s.extraOrderNumbers, ""] }))}>+ Order number</button>
          <button type="button" style={addBtn}
            onClick={() => setV((s) => ({ ...s, deliveries: [...s.deliveries, { locationId: null, oneOffName: "", deliveryType: "drop" }] }))}>+ Delivery</button>
        </div>
      </div>
    </FullscreenModal>
    <LocationPicker
      open={open && picking != null}
      title={picking != null && v.deliveries.length > 1 ? `Delivery ${picking + 1}` : "Delivery"}
      origin={origin}
      locations={locations}
      tanks={tanks}
      companyId={companyId}
      userId={userId}
      onToggleStar={onToggleStar}
      onLocationAdded={onLocationAdded}
      onPick={(to) => {
        if (picking != null) setDelivery(picking, { locationId: to.locationId, oneOffName: null, deliveryType: to.deliveryType });
        setPicking(null);
      }}
      onClose={() => setPicking(null)}
    />
    </>
  );
}
