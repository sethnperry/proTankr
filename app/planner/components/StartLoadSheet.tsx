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
import ValueEntryOverlay from "./ValueEntryOverlay";
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
  // Dispatch's plan only: save it as a plan slot (optionally opening the Planner to change it first). null = run it as a temporary plan.
  savePlan: { modify: boolean } | null;
};

const addBtn: React.CSSProperties = {
  flex: 1, padding: "10px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.25)",
  background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const hair = "1px solid rgba(255,255,255,0.08)";
const lineLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase",
  color: "rgba(255,255,255,0.45)", flexShrink: 0, width: 92,
};
const removeBtn: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.45)",
  fontSize: 13, cursor: "pointer", padding: 0, fontWeight: 700,
};

// One line of the report: label on the left, the value (tap to change) on the right.
function Line({ label, value, onTap, missing, sub, last }: {
  label: string; value: string | null; onTap: () => void; missing?: boolean; sub?: string | null; last?: boolean;
}) {
  return (
    <button type="button" onClick={onTap}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 0", border: "none", borderBottom: last ? "none" : hair, background: "transparent", cursor: "pointer", textAlign: "left", color: "#fff" }}>
      <span style={lineLabel}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, textAlign: "right" }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value ? "#fff" : missing ? "#fbbf24" : "rgba(255,255,255,0.4)" }}>
          {value || (missing ? "Add" : "None")}
        </span>
        {sub && <span style={{ display: "block", fontSize: 11, color: "rgba(255,255,255,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>}
      </span>
      <span style={{ color: "rgba(255,255,255,0.35)" }}>›</span>
    </button>
  );
}

type EditKey = "miles" | "order" | "shipper" | "customer" | "start" | `order:${number}`;
const AUTO_KEYS: EditKey[] = ["miles", "order"];

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
  dispatchPlan,
  dispatchMatch,
  saveSlot,
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
  // The plan dispatch sent (product per compartment, highest comp first). Replaces the plan list.
  dispatchPlan?: (string | null)[] | null;
  // The driver's own saved plan with the same layout as the one dispatch sent, if any.
  dispatchMatch?: PresetSummary | null;
  // Where "save as a plan slot" would go.
  saveSlot?: { slot: number; replacing: boolean } | null;
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

  // Pop-out editing: one value at a time. A new trip opens the first thing
  // still missing (miles, then the order number) so the driver just types,
  // then skims the rest.
  const [edit, setEdit] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState("");
  const [draft2, setDraft2] = useState("");
  const [queue, setQueue] = useState<EditKey[]>([]);
  const [planOpen, setPlanOpen] = useState(false);

  const openEdit = (k: EditKey, vals: StartLoadValues = v) => {
    setEdit(k);
    if (k === "miles") setDraft(vals.beginMiles);
    else if (k === "order") setDraft(vals.orderNumber);
    else if (k === "shipper") setDraft(vals.shipper);
    else if (k === "customer") setDraft(vals.customer);
    else if (k === "start") { setDraft(vals.startCity); setDraft2(vals.startState); }
    else if (k.startsWith("order:")) setDraft(vals.extraOrderNumbers[Number(k.slice(6))] ?? "");
  };

  // Re-seed each time the card opens, so a reopen reflects the current trip.
  useEffect(() => {
    if (!open) { setEdit(null); setQueue([]); return; }
    setV(initial);
    if (!editing) {
      const missing = AUTO_KEYS.filter((k) => (k === "miles" ? !initial.beginMiles.trim() : !initial.orderNumber.trim()));
      if (missing.length) { setQueue(missing.slice(1)); openEdit(missing[0], initial); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const initialMiles = initial.beginMiles;
  useEffect(() => {
    if (!open || liveMiles == null || editing) return;
    setV((s) => (s.beginMiles === initialMiles ? { ...s, beginMiles: String(liveMiles) } : s));
    setDraft((d) => (edit === "miles" && !d.trim() ? String(liveMiles) : d));
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
    if (p) { setDraft(p.city); setDraft2(p.state ?? ""); }
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

  // Pop-out save: write the value, then move to the next missing one.
  const commitEdit = () => {
    if (!edit) return;
    setV((s) => {
      if (edit === "miles") return { ...s, beginMiles: draft.trim() };
      if (edit === "order") return { ...s, orderNumber: draft.trim() };
      if (edit === "shipper") return { ...s, shipper: draft.trim() };
      if (edit === "customer") return { ...s, customer: draft.trim() };
      if (edit === "start") return { ...s, startCity: draft.trim(), startState: draft2.trim().toUpperCase().slice(0, 2) };
      const i = Number(edit.slice(6));
      return { ...s, extraOrderNumbers: s.extraOrderNumbers.map((x, j) => (j === i ? draft.trim() : x)) };
    });
    const [next, ...rest] = queue;
    setQueue(rest);
    if (next) openEdit(next, { ...v, beginMiles: edit === "miles" ? draft.trim() : v.beginMiles });
    else setEdit(null);
  };
  const cancelEdit = () => { setEdit(null); setQueue([]); };

  const title = (k: EditKey) =>
    k === "miles" ? "Beginning miles" : k === "order" ? "Order number" : k === "shipper" ? "Shipper" : k === "customer" ? "Customer" : k === "start" ? "Starting from" : `Order number ${Number(k.slice(6)) + 2}`;

  const chosenPreset = presets.find((p) => p.slot === v.planSlot) ?? null;
  const dots = (comps: (string | null)[]) => (
    <span style={{ display: "inline-flex", gap: 5, verticalAlign: "middle" }}>
      {comps.map((c, i) => (
        <span key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: c ? productColor(c) : "#000", border: "1px solid rgba(255,255,255,0.25)" }} />
      ))}
    </span>
  );

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
      <div style={{ padding: "0 16px 16px" }}>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>{equipmentLabel} · tap any value to change it</div>
        {breakNote && !breakAck && !editing && (
          <div style={{ border: "1px solid rgba(251,191,36,0.55)", background: "rgba(251,191,36,0.08)", padding: "10px 12px", marginBottom: 8, borderRadius: 2 }}>
            <div style={{ fontSize: 14, color: "#fff", lineHeight: 1.4 }}>{breakNote}</div>
            <button type="button" onClick={() => setBreakAck(true)}
              style={{ marginTop: 8, padding: "7px 14px", borderRadius: 2, border: "1px solid rgba(251,191,36,0.7)", background: "transparent", color: "#fbbf24", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
              Got it
            </button>
          </div>
        )}

        <div style={{ borderTop: hair }}>
          <Line label="Begin miles" value={v.beginMiles || null} missing onTap={() => openEdit("miles")} />
          <Line label="Order #" value={v.orderNumber || null} missing onTap={() => openEdit("order")} />
          {v.extraOrderNumbers.map((n, i) => (
            <Line key={`order-${i}`} label={`Order # ${i + 2}`} value={n || null} missing onTap={() => openEdit(`order:${i}`)} />
          ))}
          <Line label="Shipper" value={v.shipper || null} onTap={() => openEdit("shipper")} />
          <Line label="Customer" value={v.customer || null} onTap={() => openEdit("customer")} />
          <Line label="Starting from" value={[v.startCity, v.startState].filter((x) => x.trim()).join(", ") || null} missing onTap={() => openEdit("start")} />
          <Line label="Pickup" value={pickupLabel} missing onTap={onChangePickup} />
          <Line label="Supplier" value={v.supplier?.name ?? null} onTap={() => setSupplierOpen(true)} />
          {v.deliveries.map((d, i) => {
            const loc = d.locationId ? byId.get(d.locationId) : null;
            const text = loc ? locationTitle(loc) : d.locationId ? "Saved location" : d.oneOffName?.trim() ? `${d.oneOffName.trim()} (not saved)` : null;
            const sub = loc ? [locationPlace(loc), loc.delivery_type === "pump_off" ? "Pump off" : "Drop"].filter(Boolean).join(" · ") : null;
            return (
              <div key={`delivery-${i}`} style={{ display: "flex", alignItems: "center", borderBottom: hair }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Line label={`Delivery${v.deliveries.length > 1 ? ` ${i + 1}` : ""}`} value={text} sub={sub} missing onTap={() => setPicking(i)} last />
                </div>
                {i > 0 && (
                  <button type="button" aria-label="Remove delivery" style={{ ...removeBtn, paddingLeft: 10 }}
                    onClick={() => setV((s) => ({ ...s, deliveries: s.deliveries.filter((_, j) => j !== i) }))}>Remove</button>
                )}
              </div>
            );
          })}
          {dispatchPlan ? (
            <Line label="Plan" value="Sent by dispatch" last onTap={() => undefined} sub={null} />
          ) : (
            <Line label="Plan" value={chosenPreset ? `${slotLetter(chosenPreset.slot)}${chosenPreset.name ? ` · ${chosenPreset.name}` : ""}` : presets.length ? null : "No saved plans"}
              onTap={() => presets.length && setPlanOpen(true)} last />
          )}
        </div>

        {dispatchPlan && (
          <div style={{ marginTop: 8, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 2 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>Dispatch's plan</span>
              {dots(dispatchPlan)}
            </div>
            {dispatchMatch ? (
              <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 8, lineHeight: 1.4 }}>
                You already have this layout as <b>Plan {slotLetter(dispatchMatch.slot)}{dispatchMatch.name ? ` · ${dispatchMatch.name}` : ""}</b>.
                Your caps and CG apply.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 10 }}>
                  <button type="button" onClick={() => setV((s) => ({ ...s, savePlan: null }))}
                    style={{ padding: "10px 6px", borderRadius: 2, cursor: "pointer", fontSize: 13, fontWeight: 800, border: `1px solid ${!v.savePlan ? "#fff" : "rgba(255,255,255,0.14)"}`, background: !v.savePlan ? "#fff" : "transparent", color: !v.savePlan ? "#000" : "#fff" }}>
                    Quick load
                  </button>
                  <button type="button" onClick={() => setV((s) => ({ ...s, savePlan: { modify: true } }))}
                    style={{ padding: "10px 6px", borderRadius: 2, cursor: "pointer", fontSize: 13, fontWeight: 800, border: `1px solid ${v.savePlan ? "#fff" : "rgba(255,255,255,0.14)"}`, background: v.savePlan ? "#fff" : "transparent", color: v.savePlan ? "#000" : "#fff" }}>
                    Customize
                  </button>
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 6 }}>
                  {v.savePlan
                    ? `Opens the Planner to set your caps and CG, and saves it as Plan ${saveSlot ? slotLetter(saveSlot.slot) : ""}${saveSlot?.replacing ? " (all plan slots are full, so this replaces it)" : ""}.`
                    : "Runs this load as a temporary plan: no caps, CG centered. Nothing is saved."}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button type="button" style={addBtn}
            onClick={() => { setV((s) => ({ ...s, extraOrderNumbers: [...s.extraOrderNumbers, ""] })); openEdit(`order:${v.extraOrderNumbers.length}`, { ...v, extraOrderNumbers: [...v.extraOrderNumbers, ""] }); }}>+ Order number</button>
          <button type="button" style={addBtn}
            onClick={() => setV((s) => ({ ...s, deliveries: [...s.deliveries, { locationId: null, oneOffName: "", deliveryType: "drop" }] }))}>+ Delivery</button>
        </div>
      </div>
    </FullscreenModal>

    <ValueEntryOverlay
      open={open && edit != null}
      title={edit ? title(edit) : ""}
      fields={edit === "start"
        ? [
            { key: "city", label: "City", value: draft, onChange: setDraft, plain: true },
            { key: "st", label: "State", value: draft2, onChange: (x: string) => setDraft2(x.toUpperCase().slice(0, 2)), plain: true },
          ]
        : edit === "shipper" || edit === "customer"
          ? [{ key: "v", label: title(edit), value: draft, onChange: setDraft, plain: true }]
          : edit === "miles"
            ? [{ key: "v", label: "Odometer", value: draft, onChange: setDraft, decimal: true, showLabel: true }]
            : [{ key: "v", label: "Order #", value: draft, onChange: setDraft, text: true, showLabel: true }]}
      footer={edit === "start" ? (
        <button type="button" onClick={() => void locateMe()} disabled={locating} aria-busy={locating}
          style={{ ...removeBtn, color: "rgba(255,255,255,0.75)" }}>{locating ? "Locating…" : "Use my location"}</button>
      ) : edit && edit.startsWith("order:") ? (
        <button type="button" style={removeBtn}
          onClick={() => { const i = Number(edit.slice(6)); setV((s) => ({ ...s, extraOrderNumbers: s.extraOrderNumbers.filter((_, j) => j !== i) })); cancelEdit(); }}>Remove this order number</button>
      ) : undefined}
      cancelLabel={queue.length || edit === "order" || edit === "miles" ? "Skip" : "Cancel"}
      submitLabel={queue.length ? "Next" : "Set"}
      onCancel={() => { const [next, ...rest] = queue; if (next && (edit === "miles")) { setQueue(rest); openEdit(next); } else cancelEdit(); }}
      onSubmit={commitEdit}
    />

    <FullscreenModal open={open && planOpen} title="Plan" onClose={() => setPlanOpen(false)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
        <button type="button" onClick={() => { setV((s) => ({ ...s, planSlot: null })); setPlanOpen(false); }}
          style={{ padding: "12px", borderRadius: 2, textAlign: "left", cursor: "pointer", border: "1px solid rgba(255,255,255,0.14)", background: "transparent", color: "rgba(255,255,255,0.7)", fontSize: 15 }}>
          Leave the Planner as it is
        </button>
        {presets.map((p) => {
          const on = v.planSlot === p.slot;
          return (
            <button key={p.slot} type="button" onClick={() => { setV((s) => ({ ...s, planSlot: p.slot })); setPlanOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px", borderRadius: 2, cursor: "pointer", textAlign: "left", color: "#fff", fontSize: 15,
                border: `1px solid ${on ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.14)"}`, background: on ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)" }}>
              <span style={{ fontWeight: 800, width: 14 }}>{slotLetter(p.slot)}</span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name ?? `Plan ${slotLetter(p.slot)}`}</span>
              {dots(p.comps)}
              {on && <span style={{ fontWeight: 800 }}>✓</span>}
            </button>
          );
        })}
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
