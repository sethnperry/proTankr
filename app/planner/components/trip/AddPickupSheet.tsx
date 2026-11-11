"use client";
// app/planner/components/trip/AddPickupSheet.tsx
//
// Add another pickup to a partly loaded trailer. Outside any normal plan, so
// it doesn't go through the Planner:
//   1. Check: what's aboard, the current gross, and whether there's room.
//      Blocks when every compartment is loaded or the gross is at legal.
//   2. Pick the empty compartments to fill.
//   3. Pick the terminal (the shared terminal picker, opened by the parent).
//   4. Pick the order it loads under (the trip's, or a different one) and
//      the product for each compartment.
// Confirm adds the pickup with those compartments; arriving there opens the
// Planner on just them (app/planner/page.tsx, planned_comps).

import React, { useEffect, useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { supabase } from "@/lib/supabase/client";
import { grossColor, type AddPickupCheck } from "@/lib/trips/addPickupCheck";
import { BLEND_CHOICES, canSplashInto, roughLbsPerGal, topOffPlan, validPct } from "@/lib/trips/splash";
import { productColorFor } from "@/app/planner/utils/productColor";
import { CompartmentStrip } from "./CompartmentStrip";
import type { OrderChoice } from "./OrderChooser";
import type { TripOrderRow } from "@/lib/trips/types";
import { muted, primaryBtn, sectionCard, sectionTitle } from "./tripUi";

export type AddPickupProduct = { product_id: string; name: string; code: string; hex: string | null };

export type AddPickupDraft = {
  stage: "comps" | "products";
  comps: number[];
  products: Record<number, string>;
  order: OrderChoice;
  /** Splash blend: load on top of loaded compartments instead of filling empty ones. */
  splash?: boolean;
  /** The first product's share of the blend, in percent. */
  pct?: number;
};

const chip = (on: boolean): React.CSSProperties => ({
  padding: "9px 12px", borderRadius: 2, fontSize: 14, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)",
  background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.85)",
});

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function AddPickupSheet({
  open, draft, setDraft, check, compSizes, aboard, catalog, terminalLabel, rackId, splashPlan, weightRoomLbs,
  orders, orderError, busy, onPickTerminal, onConfirm, onClose,
}: {
  open: boolean;
  draft: AddPickupDraft;
  setDraft: (d: AddPickupDraft) => void;
  check: AddPickupCheck;
  compSizes: Record<number, number>;
  /** What is in each compartment. `rows` is more than 1 once a compartment has been splash blended. */
  aboard: Record<number, { product_id: string | null; gallons: number | null; rows?: number }>;
  catalog: AddPickupProduct[];
  terminalLabel: string | null;
  rackId: string | null;
  /** The trip's splash blend per compartment: its additive, base and share. */
  splashPlan?: Record<number, { additiveProductId: string; baseProductId: string; pct: number }>;
  /** Pounds left under the legal gross; the top-off never goes past it. */
  weightRoomLbs?: number | null;
  orders: TripOrderRow[];
  orderError: string | null;
  busy: boolean;
  onPickTerminal: () => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const byId = useMemo(() => new Map(catalog.map((p) => [p.product_id, p])), [catalog]);
  const colorOf = (id: string | null | undefined) => {
    const p = id ? byId.get(id) : null;
    return p ? p.hex ?? productColorFor(p.name) : null;
  };

  // Products sold at the picked rack; "Show all" falls back to the catalog.
  const [rackIds, setRackIds] = useState<string[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setRackIds(null);
    setShowAll(false);
    if (!open || draft.stage !== "products" || !rackId) return;
    let alive = true;
    void supabase.from("rack_product_status").select("product_id, active").eq("rack_id", rackId).then(({ data }) => {
      if (!alive) return;
      const ids = ((data ?? []) as any[]).filter((r) => r.active !== false).map((r) => String(r.product_id));
      setRackIds(ids);
    });
    return () => { alive = false; };
  }, [open, draft.stage, rackId]);
  const choices = useMemo(() => {
    const list = !showAll && rackIds && rackIds.length ? catalog.filter((p) => rackIds.includes(p.product_id)) : catalog;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, rackIds, showAll]);

  const allComps = Object.keys(compSizes).map(Number);
  const empty = new Set(check.emptyComps);
  const splash = !!draft.splash;
  const pct = draft.pct ?? 10;
  const splashable = (n: number) => canSplashInto({ max: compSizes[n] || 0, aboard: aboard[n]?.gallons ?? null, rows: aboard[n]?.rows ?? 1 });
  const splashComps = [...allComps].sort((a, b) => a - b).filter(splashable);
  const toggleComp = (n: number) => {
    if (splash ? !splashable(n) : !empty.has(n)) return;
    const on = draft.comps.includes(n);
    setDraft({ ...draft, comps: on ? draft.comps.filter((c) => c !== n) : [...draft.comps, n].sort((a, b) => a - b) });
  };

  const slots = allComps.map((n) => {
    const a = aboard[n];
    const picked = draft.products[n];
    const loadedColor = a ? colorOf(a.product_id) ?? "#888" : null;
    const plannedColor = draft.stage === "products" && picked ? colorOf(picked) : null;
    return {
      comp: n,
      size: compSizes[n] || 1,
      color: loadedColor ?? plannedColor,
      selected: draft.comps.includes(n),
      title: a ? `C${n} · ${byId.get(a.product_id ?? "")?.name ?? "Loaded"}` : `C${n} · empty`,
      onClick: draft.stage === "comps" && (splash ? splashable(n) : empty.has(n)) ? () => toggleComp(n) : undefined,
    };
  });

  const warnColor = !check.canAdd ? "#f87171"
    : check.level === "over_target" || check.level === "near_target" ? "#fbbf24" : muted;
  const orderOk = draft.order.kind === "existing" || !!draft.order.number.trim();
  const pctFor = (n: number) => splashPlan?.[n]?.pct ?? pct;
  const lbsPerGal = (id: string | null) => roughLbsPerGal(byId.get(id ?? "")?.name ?? "");
  const plans = topOffPlan(draft.comps.map((n) => ({
    n, aboardProductId: aboard[n]?.product_id ?? null, aboardGallons: aboard[n]?.gallons ?? 0, max: compSizes[n] || 0,
    pct: pctFor(n), additiveProductId: splashPlan?.[n]?.additiveProductId ?? null, topProductId: draft.products[n] ?? null,
  })), weightRoomLbs ?? null, lbsPerGal);
  const splashReady = draft.comps.length > 0 && draft.comps.every((n) => validPct(pctFor(n)) && (plans.get(n)?.add ?? 0) > 0);
  // The product on top defaults to the other one of the plan's blend.
  useEffect(() => {
    if (!open || !splash || draft.stage !== "products" || !splashPlan) return;
    const fill: Record<number, string> = {};
    for (const n of draft.comps) {
      const sp = splashPlan[n];
      if (!sp || draft.products[n]) continue;
      fill[n] = aboard[n]?.product_id === sp.additiveProductId ? sp.baseProductId : sp.additiveProductId;
    }
    if (Object.keys(fill).length) setDraft({ ...draft, products: { ...draft.products, ...fill } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, splash, draft.stage]);
  const startSplash = () => setDraft({ ...draft, stage: "comps", comps: [], products: {}, splash: true, pct: 10 });
  const endSplash = () => setDraft({ ...draft, stage: "comps", comps: [], products: {}, splash: false });
  const allPicked = draft.comps.length > 0 && draft.comps.every((n) => !!draft.products[n]) && orderOk && !busy;

  return (
    <FullscreenModal open={open} title={splash ? "Splash Blend" : "Add Another Pickup"} onClose={onClose} footer={null}>
      <div style={sectionCard}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}><CompartmentStrip slots={slots} height={draft.stage === "comps" ? 34 : 16} gap={5} /></div>
          {check.gross != null && (
            <div style={{ fontSize: 16, fontWeight: 900, color: grossColor(check.gross, check.target), whiteSpace: "nowrap" }}>
              {fmt(check.gross)}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 10, fontSize: 13 }}>
          {[...allComps].sort((a, b) => a - b).map((n) => {
            const a = aboard[n];
            const p = a ? byId.get(a.product_id ?? "") : null;
            return (
              <span key={n} style={{ color: a ? "rgba(255,255,255,0.8)" : muted }}>
                C{n} {a ? `${p?.code ?? "Loaded"}${a.gallons ? ` ${fmt(a.gallons)}` : ""}` : "empty"}
              </span>
            );
          })}
        </div>
        {check.message && !(splash && check.canSplash) && <div style={{ fontSize: 14, fontWeight: 700, color: warnColor, marginTop: 10 }}>{check.message}</div>}
      </div>

      {check.canAdd && !splash && draft.stage === "comps" && (
        <>
          <div style={sectionCard}>
            <div style={sectionTitle}>Compartments to load</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {check.emptyComps.map((n) => (
                <button key={n} type="button" style={chip(draft.comps.includes(n))} onClick={() => toggleComp(n)}>
                  C{n} · {fmt(compSizes[n] || 0)}
                </button>
              ))}
            </div>
          </div>
          <button type="button" disabled={!draft.comps.length} onClick={onPickTerminal}
            style={{ ...primaryBtn, opacity: draft.comps.length ? 1 : 0.5 }}>
            Next · Pick the Terminal
          </button>
        </>
      )}

      {!splash && draft.stage === "comps" && check.canSplash && (
        <button type="button" onClick={startSplash}
          style={{ ...primaryBtn, marginTop: 10, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
          Splash Blend · load on top of a loaded compartment
        </button>
      )}

      {splash && draft.stage === "comps" && (
        <>
          <div style={sectionCard}>
            <div style={sectionTitle}>Loaded compartments</div>
            {splashComps.length === 0
              ? <div style={{ fontSize: 14, color: muted }}>No compartment can take more on top (empty, full, or already blended).</div>
              : (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {splashComps.map((n) => {
                    const a = aboard[n];
                    return (
                      <button key={n} type="button" style={chip(draft.comps.includes(n))} onClick={() => toggleComp(n)}>
                        C{n} · {byId.get(a?.product_id ?? "")?.code ?? "Loaded"} {fmt(a?.gallons ?? 0)} · room {fmt(Math.max(0, (compSizes[n] || 0) - (a?.gallons ?? 0)))}
                      </button>
                    );
                  })}
                </div>
              )}
          </div>
          <div style={sectionCard}>
            <div style={sectionTitle}>Blend</div>
            <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>{splashPlan && draft.comps.some((n) => splashPlan[n]) ? "From the plan." : "The share of the finished compartment that is what is already aboard."}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {BLEND_CHOICES.map((c) => (
                <button key={c} type="button" style={chip(pct === c)} onClick={() => setDraft({ ...draft, pct: c })}>{c}%</button>
              ))}
              <input inputMode="decimal" value={BLEND_CHOICES.some((c) => c === pct) ? "" : String(pct)} placeholder="Other %"
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => { const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")); setDraft({ ...draft, pct: Number.isFinite(v) ? v : 0 }); }}
                style={{ width: 90, padding: "9px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 2, color: "#fff", fontSize: 15, fontWeight: 700 }} />
            </div>
            {draft.comps.map((n) => {
              const pl = plans.get(n)!;
              return (
                <div key={n} style={{ marginTop: 10, fontSize: 14 }}>
                  <b>C{n}</b>{" "}
                  {pl.add > 0
                    ? <>load <b>{fmt(pl.add)} gal</b> on top of {fmt(aboard[n]?.gallons ?? 0)}: {fmt((aboard[n]?.gallons ?? 0) + pl.add)} gal, <b>{pl.blend!.toFixed(1)}%</b> {pl.firstIsAdditive ? "additive" : "additive (loaded on top)"}</>
                    : <span style={{ color: "#f87171" }}>nothing fits on top</span>}
                  {pl.limitedBy === "weight" && <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginTop: 2 }}>Held to the {fmt(Math.max(0, weightRoomLbs ?? 0))} lbs left under legal, so this ends off the {pctFor(n)}% target.</div>}
                  {pl.limitedBy === "room" && <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginTop: 2 }}>Only {fmt(pl.room)} gal of room, so this compartment ends off the {pctFor(n)}% target.</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={endSplash}
              style={{ ...primaryBtn, flex: 1, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
              Back
            </button>
            <button type="button" disabled={!splashReady} onClick={onPickTerminal} style={{ ...primaryBtn, flex: 2, opacity: splashReady ? 1 : 0.5 }}>
              Next · Pick the Terminal
            </button>
          </div>
        </>
      )}

      {(splash || check.canAdd) && draft.stage === "products" && (
        <>
          <div style={sectionCard}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <div style={{ ...sectionTitle, flex: 1, marginBottom: 0 }}>{terminalLabel ?? "Terminal"}</div>
              <button type="button" onClick={onPickTerminal}
                style={{ background: "none", border: "none", color: "#93c5fd", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                Change
              </button>
            </div>
          </div>
          {draft.comps.map((n) => (
            <div key={n} style={sectionCard}>
              <div style={sectionTitle}>
                C{n} · {splash ? `product on top of ${byId.get(aboard[n]?.product_id ?? "")?.code ?? "the load"}${plans.get(n)?.add ? ` · ${fmt(plans.get(n)!.add)} gal` : ""}` : "product"}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {choices.map((p) => {
                  const on = draft.products[n] === p.product_id;
                  return (
                    <button key={p.product_id} type="button" style={{ ...chip(on), display: "flex", alignItems: "center", gap: 6 }}
                      onClick={() => setDraft({ ...draft, products: { ...draft.products, [n]: p.product_id } })}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: p.hex ?? productColorFor(p.name) }} />
                      {p.code}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {rackIds && rackIds.length > 0 && (
            <button type="button" onClick={() => setShowAll((v) => !v)}
              style={{ background: "none", border: "none", color: muted, fontSize: 13, cursor: "pointer", marginBottom: 12, padding: 0 }}>
              {showAll ? "Only this rack's products" : "Show all products"}
            </button>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setDraft({ ...draft, stage: "comps" })}
              style={{ ...primaryBtn, flex: 1, background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}>
              Back
            </button>
            <button type="button" disabled={!allPicked} onClick={onConfirm} style={{ ...primaryBtn, flex: 2, opacity: allPicked ? 1 : 0.5 }}>
              Add Pickup
            </button>
          </div>
        </>
      )}

      {!check.canAdd && !splash && (
        <button type="button" onClick={onClose} style={{ ...primaryBtn, marginTop: 10 }}>Close</button>
      )}
    </FullscreenModal>
  );
}
