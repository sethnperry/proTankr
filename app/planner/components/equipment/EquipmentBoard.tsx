"use client";
// app/planner/components/equipment/EquipmentBoard.tsx
//
// THE equipment list. Every "pick equipment" screen in the app draws this: connected combos
// on top (a truck and its trailer on one row, one wide tap target), a gap, then the loose
// trucks on the left and loose trailers on the right, all in natural numeric order.
//
// Under a combo's numbers: the truck reads "In Use · SP" (the driver's initials) unless it has
// a fleet status; the trailer reads "Loaded" with one colored dot per loaded compartment.
// A loose unit shows its fleet status (Readyline, Deadline) like it always has.

import React from "react";
import type { TrackRows, TrackUnit } from "@/lib/equipment/trackList";
import type { LoadedDot } from "@/lib/equipment/boardStatus";
import { truckLine } from "@/lib/equipment/boardStatus";
import { fleetStatusColor, fleetStatusLabel } from "../../modals/EquipmentStatusModal";

const MUTED = "rgba(255,255,255,0.35)";

const header: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, textAlign: "center",
};
const tileBase: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  padding: "12px 10px", textAlign: "center", userSelect: "none", color: "rgba(255,255,255,0.85)", minWidth: 0, boxSizing: "border-box",
};
const tileMine: React.CSSProperties = { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff" };
const plus: React.CSSProperties = {
  borderRadius: 2, border: "1px dashed rgba(255,255,255,0.18)", background: "transparent", padding: "14px 10px",
  textAlign: "center", cursor: "pointer", fontWeight: 900, fontSize: 20, color: "rgba(255,255,255,0.35)",
};

export type LongPress = (u: TrackUnit) => { handlers: Record<string, unknown>; didFire: () => boolean };

type Props = {
  rows: TrackRows;
  /** user_id holding each combo, for the truck's "In Use · SP" line. */
  claimedByCombo: Record<string, string | null>;
  initials: Record<string, string>;
  loadedByTrailer: Record<string, LoadedDot[]>;
  /** The viewer's own pair (highlighted). */
  mine?: { truckId: string | null; trailerId: string | null };
  /** A loose unit waiting to be coupled (outlined). */
  pendingId?: string | null;
  onCombo?: (row: TrackRows["combos"][number]) => void;
  onTruck?: (u: TrackUnit) => void;
  onTrailer?: (u: TrackUnit) => void;
  /** Hide the loose columns (pick-a-combo screens). */
  combosOnly?: boolean;
  canAdd?: boolean;
  onAddTruck?: () => void;
  onAddTrailer?: () => void;
  longPress?: LongPress;
  renderExtra?: (u: TrackUnit) => React.ReactNode;
  /** Draws a status line for a loose unit's away caption etc. */
  looseCaption?: (u: TrackUnit) => React.ReactNode;
  loading?: boolean;
  emptyNote?: string;
};

function Dots({ dots }: { dots: LoadedDot[] }) {
  return (
    <span style={{ display: "inline-flex", gap: 3, marginLeft: 6, verticalAlign: "middle" }}>
      {dots.map((d) => (
        <span key={d.comp} aria-hidden style={{ width: 9, height: 9, borderRadius: "50%", background: d.color, border: "1px solid rgba(255,255,255,0.35)" }} />
      ))}
    </span>
  );
}

function Name({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 17, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>;
}

function StatusLine({ u }: { u: TrackUnit }) {
  if (!u.statusCode || u.statusCode === "in_use") return null;
  return (
    <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: fleetStatusColor(u.statusCode), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
      {fleetStatusLabel(u.statusCode) || u.statusCode}{u.subStatus ? ` · ${u.subStatus}` : ""}
    </div>
  );
}

export function EquipmentBoard(p: Props) {
  const { rows } = p;
  const isMine = (truckId: string, trailerId: string) => !!p.mine && p.mine.truckId === truckId && p.mine.trailerId === trailerId;

  return (
    <div>
      {rows.combos.length > 0 && (
        <>
          <div style={{ ...header, textAlign: "left" }}>Combos · {rows.combos.length}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {rows.combos.map((c) => {
              const holder = p.claimedByCombo[c.comboId] ?? null;
              const tl = truckLine({
                statusLabel: c.truck.statusCode ? fleetStatusLabel(c.truck.statusCode) || c.truck.statusCode : null,
                statusCode: c.truck.statusCode, claimedBy: holder, initials: holder ? p.initials[holder] ?? "" : "",
              });
              const dots = p.loadedByTrailer[c.trailer.id];
              const mine = isMine(c.truck.id, c.trailer.id);
              const tile = { ...tileBase, ...(mine ? tileMine : {}) };
              return (
                <div key={c.comboId} role="button" tabIndex={0}
                  onClick={() => p.onCombo?.(c)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onCombo?.(c); } }}
                  style={{ display: "grid", gridTemplateColumns: "1fr 26px 1fr", alignItems: "stretch", cursor: "pointer" }}>
                  <div style={tile}>
                    <Name>{c.truck.name}</Name>
                    {tl.tone !== "none" && (
                      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: tl.tone === "status" ? fleetStatusColor(c.truck.statusCode ?? "") : "rgba(255,255,255,0.6)" }}>{tl.text}</div>
                    )}
                    {p.renderExtra?.(c.truck)}
                  </div>
                  <div aria-hidden style={{ alignSelf: "center", height: 2, background: "rgba(255,255,255,0.45)" }} />
                  <div style={tile}>
                    <Name>{c.trailer.name}</Name>
                    {dots ? (
                      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: "rgba(255,255,255,0.7)" }}>Loaded<Dots dots={dots} /></div>
                    ) : <StatusLine u={c.trailer} />}
                    {p.renderExtra?.(c.trailer)}
                  </div>
                </div>
              );
            })}
          </div>
          {!p.combosOnly && <div style={{ height: 22 }} />}
        </>
      )}

      {!p.combosOnly && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div>
            <div style={header}>Trucks</div>
            <div style={{ display: "grid", gap: 8 }}>
              {rows.trucks.map((u) => {
                const lp = p.longPress?.(u);
                const mine = p.mine?.truckId === u.id;
                const pending = p.pendingId === u.id;
                return (
                  <div key={u.id} style={{ ...tileBase, ...(mine ? tileMine : {}), ...(pending ? { border: "2px solid #fff", background: "rgba(255,255,255,0.14)" } : {}), cursor: "pointer" }}
                    onClick={() => { if (!lp || !lp.didFire()) p.onTruck?.(u); }} {...(lp?.handlers as object)}>
                    <Name>{u.name}</Name>
                    <StatusLine u={u} />
                    {p.looseCaption?.(u)}
                    {p.renderExtra?.(u)}
                  </div>
                );
              })}
              {p.canAdd && <div style={plus} onClick={p.onAddTruck}>+</div>}
            </div>
          </div>
          <div>
            <div style={header}>Trailers</div>
            <div style={{ display: "grid", gap: 8 }}>
              {rows.trailers.map((u) => {
                const lp = p.longPress?.(u);
                const mine = p.mine?.trailerId === u.id;
                const pending = p.pendingId === u.id;
                const dots = p.loadedByTrailer[u.id];
                return (
                  <div key={u.id} style={{ ...tileBase, ...(mine ? tileMine : {}), ...(pending ? { border: "2px solid #fff", background: "rgba(255,255,255,0.14)" } : {}), cursor: "pointer" }}
                    onClick={() => { if (!lp || !lp.didFire()) p.onTrailer?.(u); }} {...(lp?.handlers as object)}>
                    <Name>{u.name}</Name>
                    {dots ? <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: "rgba(255,255,255,0.7)" }}>Loaded<Dots dots={dots} /></div> : <StatusLine u={u} />}
                    {p.looseCaption?.(u)}
                    {p.renderExtra?.(u)}
                  </div>
                );
              })}
              {p.canAdd && <div style={plus} onClick={p.onAddTrailer}>+</div>}
            </div>
          </div>
        </div>
      )}

      {!p.loading && rows.combos.length + (p.combosOnly ? 0 : rows.trucks.length + rows.trailers.length) === 0 && (
        <div style={{ fontSize: 14, color: MUTED, textAlign: "center", padding: "16px 0" }}>{p.emptyNote ?? "No equipment found."}</div>
      )}
    </div>
  );
}
