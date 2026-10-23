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

import React, { useEffect, useMemo, useRef, useState } from "react";
import { KeypadToggle, keypadInputProps } from "@/lib/ui/KeypadToggle";
import { slotLetter, type PresetSummary } from "@/lib/trips/tripPlan";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { StartLoadDelivery } from "@/lib/trips/tripLogic";
import { locationPlace, locationTitle, type DeliveryLocation, type LatLon, type LocationTank } from "@/lib/trips/deliveryLocations";
import { LocationPicker } from "./trip/LocationPicker";
import { currentCity, type StartPlace } from "@/lib/trips/startPlace";
import { SupplierPicker } from "./trip/SupplierPicker";
import { useTerminalSuppliers } from "@/lib/suppliers/useTerminalSuppliers";
import type { SupplierRow } from "@/lib/trips/types";
import type { TripSupplier } from "@/lib/trips/tripSupplier";

export type StartLoadValues = {
  orderNumber: string;
  extraOrderNumbers: string[];
  shipper: string;
  customer: string;
  deliveries: StartLoadDelivery[];
  beginMiles: string;
  startCity: string;
  startState: string;
  // Preset (1-5) the Planner loads when it opens for this trip. null = leave the Planner as is.
  planSlot: number | null;
  // Supplier dispatch named. Preset at every rack on the trip; changeable there.
  supplier: TripSupplier | null;
};

const label: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)", padding: "12px 12px", fontSize: 16,
  color: "#fff", boxSizing: "border-box",
};
const row: React.CSSProperties = { marginBottom: 16 };
const addBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.25)",
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
  pickupTerminalId,
  onChangePickup,
  suppliers,
  onAddSupplier,
  presets,
  productColor,
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
  suggestStart,
  liveMiles,
  breakNote,
}: {
  // Shown only when the 30-minute break isn't done and driving is already well along since the last one.
  breakNote?: string | null;
  // The truck's odometer from telematics. Fills beginning miles unless one was typed.
  liveMiles?: number | null;
  open: boolean;
  editing: boolean;
  initial: StartLoadValues;
  pickupLabel: string | null;
  pickupTerminalId: string | null;
  onChangePickup: () => void;
  suppliers: SupplierRow[];
  onAddSupplier: (name: string) => SupplierRow | null;
  presets: PresetSummary[];
  productColor: (productId: string) => string;
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
  // Prefill for "Starting from" when the card opens with it blank.
  suggestStart?: () => Promise<StartPlace | null>;
}) {
  const [breakAck, setBreakAck] = useState(false);
  useEffect(() => { if (open) setBreakAck(false); }, [open]);
  const [v, setV] = useState<StartLoadValues>(initial);
  const orderRef = useRef<HTMLInputElement | null>(null);
  const [orderAlpha, setOrderAlpha] = useState(false);

  // Re-seed each time the card opens, so a reopen reflects the current trip.
  useEffect(() => {
    if (open) setV(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const initialMiles = initial.beginMiles;
  useEffect(() => {
    if (!open || liveMiles == null || editing) return;
    setV((s) => (s.beginMiles === initialMiles ? { ...s, beginMiles: String(liveMiles) } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, liveMiles]);

  // "Starting from": the truck's last delivery city, else the phone's city if
  // location is already allowed (no surprise permission prompt). Never
  // overwrites something typed.
  const [locating, setLocating] = useState(false);
  const fillStart = (p: StartPlace | null) => {
    if (p) setV((s) => (s.startCity.trim() ? s : { ...s, startCity: p.city, startState: p.state ?? s.startState }));
  };
  useEffect(() => {
    if (!open || initial.startCity.trim()) return;
    let cancelled = false;
    (async () => {
      let p = suggestStart ? await suggestStart() : null;
      if (!p) {
        const granted = await navigator.permissions?.query({ name: "geolocation" as PermissionName })
          .then((r) => r.state === "granted").catch(() => false);
        if (granted) p = await currentCity();
      }
      if (!cancelled) fillStart(p);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const locateMe = async () => {
    setLocating(true);
    const p = await currentCity();
    setLocating(false);
    if (p) setV((s) => ({ ...s, startCity: p.city, startState: p.state ?? "" }));
  };

  const byId = useMemo(() => new Map(locations.map((l) => [l.location_id, l])), [locations]);
  const [picking, setPicking] = useState<number | null>(null);

  const setDelivery = (i: number, patch: Partial<StartLoadDelivery>) =>
    setV((s) => ({ ...s, deliveries: s.deliveries.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  // Supplier: asked right after a pickup terminal is picked, and tappable any
  // time. That terminal's suppliers are listed first.
  const [supplierOpen, setSupplierOpen] = useState(false);
  const termSuppliers = useTerminalSuppliers(companyId, pickupTerminalId);
  const terminalSupplierIds = useMemo(() => new Set(termSuppliers.bySupplier.keys()), [termSuppliers.bySupplier]);
  const lastPickupRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { lastPickupRef.current = null; return; }
    if (lastPickupRef.current === null) { lastPickupRef.current = pickupTerminalId ?? ""; return; }
    if ((pickupTerminalId ?? "") !== lastPickupRef.current) {
      lastPickupRef.current = pickupTerminalId ?? "";
      if (pickupTerminalId) setSupplierOpen(true);
    }
  }, [open, pickupTerminalId]);

  const milesOk = v.beginMiles.trim() === "" || Number.isFinite(Number(v.beginMiles));

  return (
    <>
    <FullscreenModal
      open={open}
      title={editing ? "Edit Trip" : "Begin Trip"}
      onClose={onClose}
      footer={
        <div style={{ padding: "12px 16px" }}>
          {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <button
            type="button"
            disabled={busy || !milesOk}
            onClick={() => onSubmit(v)}
            style={{
              width: "100%", padding: "16px 0", borderRadius: 2, border: "none",
              background: "#fff", color: "#000", fontSize: 17, fontWeight: 800,
              opacity: busy || !milesOk ? 0.5 : 1, cursor: busy ? "default" : "pointer",
            }}
          >
            {editing ? "Save" : "Begin Trip"}
          </button>
        </div>
      }
    >
      <div style={{ padding: "4px 16px 24px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 16 }}>{equipmentLabel}</div>
        {breakNote && !breakAck && !editing && (
          <div style={{ border: "1px solid rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.08)", padding: "10px 12px", marginBottom: 16, borderRadius: 2 }}>
            <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.4 }}>{breakNote}</div>
            <button type="button" onClick={() => setBreakAck(true)}
              style={{ marginTop: 8, padding: "7px 14px", borderRadius: 2, border: "1px solid rgba(251,191,36,0.7)", background: "transparent", color: "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              Got it
            </button>
          </div>
        )}

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
          <div style={label}>Order number</div>
          <div style={{ position: "relative" }}>
            <input
              ref={orderRef}
              style={{ ...input, paddingRight: 64 }}
              value={v.orderNumber}
              onChange={(e) => setV((s) => ({ ...s, orderNumber: e.target.value }))}
              placeholder="Order #"
              autoFocus={!editing}
              {...keypadInputProps(orderAlpha)}
            />
            <KeypadToggle alpha={orderAlpha} onToggle={setOrderAlpha} inputRef={orderRef}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)" }} />
          </div>
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
                {...keypadInputProps(orderAlpha)}
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
          <div style={{ ...label, display: "flex", justifyContent: "space-between" }}>
            <span>Starting from</span>
            <button aria-busy={!!(locating)} type="button" onClick={() => void locateMe()} disabled={locating}
              style={{ ...removeBtn, fontSize: 12, padding: 0, color: "rgba(255,255,255,0.75)", fontWeight: 700 }}>
              {locating ? "Locating…" : "Use my location"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input style={{ ...input, flex: 3 }} value={v.startCity}
              onChange={(e) => setV((s) => ({ ...s, startCity: e.target.value }))} placeholder="City" />
            <input style={{ ...input, flex: 1, textTransform: "uppercase" }} value={v.startState} maxLength={2}
              onChange={(e) => setV((s) => ({ ...s, startState: e.target.value.toUpperCase() }))} placeholder="ST" />
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

        <div style={row}>
          <div style={label}>Supplier</div>
          <button type="button" onClick={() => setSupplierOpen(true)}
            style={{ ...input, textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: v.supplier ? "#fff" : "rgba(255,255,255,0.45)" }}>{v.supplier?.name ?? "Supplier from dispatch"}</span>
            <span style={{ color: "rgba(255,255,255,0.4)" }}>›</span>
          </button>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 6 }}>
            {v.supplier ? "Preset at the rack for the whole trip. You can change it there." : "Optional. Type it exactly as dispatch shows it."}
          </div>
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
          <div style={label}>Plan</div>
          {presets.length === 0 ? (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)" }}>No saved plans for this equipment yet. Set it in the Planner.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {presets.map((p) => {
                const on = v.planSlot === p.slot;
                return (
                  <button key={p.slot} type="button"
                    onClick={() => setV((s) => ({ ...s, planSlot: on ? null : p.slot }))}
                    style={{
                      ...input, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left",
                      borderColor: on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.14)",
                      background: on ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                    }}>
                    <span style={{ fontWeight: 800, color: on ? "#fff" : "rgba(255,255,255,0.6)", width: 14 }}>{slotLetter(p.slot)}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "rgba(255,255,255,0.85)" }}>
                      {p.name ?? `Plan ${slotLetter(p.slot)}`}
                    </span>
                    <span style={{ display: "flex", gap: 5 }}>
                      {p.comps.map((c, i) => (
                        <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c ? productColor(c) : "#000", border: "1px solid rgba(255,255,255,0.25)" }} />
                      ))}
                    </span>
                    {on && <span style={{ color: "#fff", fontWeight: 800 }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                {v.planSlot ? "The Planner opens with this plan. You can still change it before loading." : "Optional. Tap a plan to have it ready in the Planner."}
              </div>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="button" style={addBtn}
            onClick={() => setV((s) => ({ ...s, extraOrderNumbers: [...s.extraOrderNumbers, ""] }))}>+ Order number</button>
          <button type="button" style={addBtn}
            onClick={() => setV((s) => ({ ...s, deliveries: [...s.deliveries, { locationId: null, oneOffName: "", deliveryType: "drop" }] }))}>+ Delivery</button>
        </div>
      </div>
    </FullscreenModal>
    <SupplierPicker
      open={open && supplierOpen}
      title="Supplier from dispatch"
      subtitle={pickupLabel ? `At ${pickupLabel}` : undefined}
      suppliers={suppliers}
      current={v.supplier?.name ?? null}
      onAdd={onAddSupplier}
      terminalSupplierIds={pickupTerminalId ? terminalSupplierIds : undefined}
      terminalName={pickupLabel}
      onPick={(sp) => { setV((st) => ({ ...st, supplier: sp })); setSupplierOpen(false); }}
      onClose={() => setSupplierOpen(false)}
      onSkip={v.supplier ? () => { setV((st) => ({ ...st, supplier: null })); setSupplierOpen(false); } : undefined}
    />
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
