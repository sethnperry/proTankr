"use client";
// app/planner/components/equipment/EquipmentBoard.tsx
//
// THE equipment list. Every "pick equipment" screen in the app draws this: connected combos
// on top (a truck and its trailer on one row, one wide tap target), a gap, then the loose
// trucks on the left and loose trailers on the right, all in natural numeric order.
//
// Every card is the same size and shows only the unit number and its status. The truck reads
// "In Use · SP" (the driver's initials) unless it has a fleet status. A trailer carries its compartments
// down its right edge: comp 1 on top, each as tall as it is big; filled in the product's color when
// loaded, outlined in the last product's color when empty (residue), a gray outline when new or washed.

import React from "react";
import type { TrackRows, TrackUnit } from "@/lib/equipment/trackList";
import type { StripSeg } from "@/lib/equipment/trailerStrip";
import { BirdTab } from "../TrailerViews";
import { truckLine } from "@/lib/equipment/boardStatus";
import { fleetStatusColor, fleetStatusLabel } from "../../modals/EquipmentStatusModal";

const MUTED = "rgba(255,255,255,0.35)";

const header: React.CSSProperties = {
  fontSize: 12, fontWeight: 800, color: MUTED, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8, textAlign: "center",
};
const TILE_H = 64;
const tileBase: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)",
  height: TILE_H, padding: "0 10px", display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textAlign: "center", userSelect: "none", color: "rgba(255,255,255,0.85)", minWidth: 0, boxSizing: "border-box",
};
const tileMine: React.CSSProperties = { background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.45)", color: "#fff" };
const plus: React.CSSProperties = {
  borderRadius: 2, border: "1px dashed rgba(255,255,255,0.18)", background: "transparent", height: TILE_H, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 10px",
  textAlign: "center", cursor: "pointer", fontWeight: 900, fontSize: 20, color: "rgba(255,255,255,0.35)",
};

export type LongPress = (u: TrackUnit) => { handlers: Record<string, unknown>; didFire: () => boolean };

type Props = {
  rows: TrackRows;
  /** user_id holding each combo, for the truck's "In Use · SP" line. */
  claimedByCombo: Record<string, string | null>;
  initials: Record<string, string>;
  /** What each holder is doing right now (En route, Loading, …), by user id. */
  activity?: Record<string, string>;
  /** Where a loaded trailer is headed, by trailer id. */
  destByTrailer?: Record<string, string>;
  /** Compartment strip per trailer id (see useEquipmentBoardStatus). */
  strips?: Record<string, StripSeg[]>;
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
  loading?: boolean;
  emptyNote?: string;
};

function Tile({ children, strip, style, ...rest }: { children: React.ReactNode; strip?: StripSeg[]; style?: React.CSSProperties } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} style={{ ...tileBase, ...(strip && strip.length > 0 ? { paddingRight: 0, gap: 0 } : {}), ...style }}>
      <div style={{ flex: 1, minWidth: 0, ...(strip && strip.length > 0 ? { paddingLeft: 10 } : {}) }}>{children}</div>
      {strip && strip.length > 0 && <BirdTab segs={strip} />}
    </div>
  );
}

const loadedText = (segs?: StripSeg[]) => !!segs?.some((g) => g.kind === "loaded");

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
              const segs = p.strips?.[c.trailer.id];
              const mine = isMine(c.truck.id, c.trailer.id);
              const tile = { ...tileBase, ...(mine ? tileMine : {}) };
              return (
                <div key={c.comboId} role="button" tabIndex={0}
                  onClick={() => p.onCombo?.(c)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); p.onCombo?.(c); } }}
                  style={{ display: "grid", gridTemplateColumns: "1fr 26px 1fr", alignItems: "stretch", cursor: "pointer" }}>
                  <Tile style={tile as React.CSSProperties}>
                    <Name>{c.truck.name}</Name>
                    {tl.tone !== "none" && (
                      <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: tl.tone === "status" ? fleetStatusColor(c.truck.statusCode ?? "") : mine && tl.tone === "use" ? "#fff" : "rgba(255,255,255,0.6)" }}>
                        {/* The driver's own equipment reads "Mine"; everyone else's keeps In Use plus initials. */}
                        {mine && tl.tone === "use" ? "Mine" : tl.tone === "use" && holder && p.activity?.[holder] ? `${p.initials[holder] ?? ""}${p.initials[holder] ? " · " : ""}${p.activity[holder]}` : tl.text}
                      </div>
                    )}
                  </Tile>
                  <div aria-hidden style={{ alignSelf: "center", height: 2, background: "rgba(255,255,255,0.45)" }} />
                  <Tile style={tile as React.CSSProperties} strip={segs}>
                    <Name>{c.trailer.name}</Name>
                    {loadedText(segs) ? (
                      p.destByTrailer?.[c.trailer.id] ? <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: "rgba(255,255,255,0.7)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.destByTrailer[c.trailer.id]}</div> : null
                    ) : <StatusLine u={c.trailer} />}
                  </Tile>
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
                  <Tile key={u.id} style={{ ...(mine ? tileMine : {}), ...(pending ? { border: "2px solid #fff", background: "rgba(255,255,255,0.14)" } : {}), cursor: "pointer" }}
                    onClick={() => { if (!lp || !lp.didFire()) p.onTruck?.(u); }} {...(lp?.handlers as object)}>
                    <Name>{u.name}</Name>
                    <StatusLine u={u} />
                  </Tile>
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
                const segs = p.strips?.[u.id];
                return (
                  <Tile key={u.id} strip={segs} style={{ ...(mine ? tileMine : {}), ...(pending ? { border: "2px solid #fff", background: "rgba(255,255,255,0.14)" } : {}), cursor: "pointer" }}
                    onClick={() => { if (!lp || !lp.didFire()) p.onTrailer?.(u); }} {...(lp?.handlers as object)}>
                    <Name>{u.name}</Name>
                    {loadedText(segs) ? <div style={{ fontSize: 12, fontWeight: 800, marginTop: 3, color: "rgba(255,255,255,0.7)" }}>Loaded</div> : <StatusLine u={u} />}
                  </Tile>
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
