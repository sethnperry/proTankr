"use client";
// app/planner/components/trip/OrderChooser.tsx
//
// Which order a pickup loads under. A driver sent to more than one terminal
// can load each under a different order number: pick one already on the trip
// or type a new one. Used by Add Another Pickup and by tapping a pickup's
// order on the Driver Dashboard.

import React, { useEffect, useRef, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import type { TripOrderRow } from "@/lib/trips/types";
import { fieldInput, muted, primaryBtn, sectionCard, sectionTitle } from "./tripUi";

export type OrderChoice = { kind: "existing"; orderId: string } | { kind: "new"; number: string };

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 12px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.85)",
});

// Orders worth offering: the primary (even unnumbered) and any with a number.
export function orderOptions(orders: TripOrderRow[]): TripOrderRow[] {
  return [...orders]
    .filter((o) => o.is_primary || !!o.order_number)
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
}

export function OrderChooser({ orders, value, onChange, error, title = "Order number" }: {
  orders: TripOrderRow[];
  value: OrderChoice;
  onChange: (v: OrderChoice) => void;
  error?: string | null;
  title?: string;
}) {
  const opts = orderOptions(orders);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isNew = value.kind === "new";
  useEffect(() => { if (isNew) inputRef.current?.focus(); }, [isNew]);
  return (
    <div style={sectionCard}>
      <div style={sectionTitle}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {opts.map((o) => (
          <button key={o.order_id} type="button"
            style={chip(value.kind === "existing" && value.orderId === o.order_id)}
            onClick={() => onChange({ kind: "existing", orderId: o.order_id })}>
            {o.order_number || "No number"}
          </button>
        ))}
        <button type="button" style={chip(isNew)} onClick={() => onChange({ kind: "new", number: isNew ? value.number : "" })}>
          + Different order
        </button>
      </div>
      {isNew && (
        <input ref={inputRef} value={value.number} placeholder="Order number" inputMode="text" autoCapitalize="characters"
          onChange={(e) => onChange({ kind: "new", number: e.target.value })}
          style={{ ...fieldInput, marginTop: 10 }} />
      )}
      {error ? (
        <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{error}</div>
      ) : (
        <div style={{ color: muted, fontSize: 12, marginTop: 8 }}>
          Sent to load under a different order here? Pick or add it.
        </div>
      )}
    </div>
  );
}

// Change the order one pickup loaded (or will load) under.
export function PickupOrderSheet({ open, rackName, orders, initial, busy, error, onSave, onClose }: {
  open: boolean;
  rackName: string;
  orders: TripOrderRow[];
  initial: OrderChoice;
  busy: boolean;
  error: string | null;
  onSave: (v: OrderChoice) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState<OrderChoice>(initial);
  useEffect(() => { if (open) setValue(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const blankNew = value.kind === "new" && !value.number.trim();
  return (
    <FullscreenModal open={open} title={`Order at ${rackName}`} onClose={onClose} footer={null}>
      <OrderChooser orders={orders} value={value} onChange={setValue} error={error} />
      <button type="button" disabled={busy || blankNew} onClick={() => onSave(value)}
        style={{ ...primaryBtn, opacity: busy || blankNew ? 0.5 : 1 }}>
        Save
      </button>
    </FullscreenModal>
  );
}
