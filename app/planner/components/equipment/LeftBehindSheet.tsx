"use client";
// app/planner/components/equipment/LeftBehindSheet.tsx
//
// A trailer the tracker showed a driver taking, with nobody saying what it holds. Asked of whoever holds it next:
// empty (and what it last held), partial, or preloaded. Preloaded and partial become a parked trip for the loading
// driver, so Take Over Trip and the usual delivery logging apply. Empty sets the residue. The Plan chips fill every
// compartment from one of the driver's saved plans.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useProductsCatalog } from "@/lib/queries/useProductsCatalog";
import { fetchTrailerResidue } from "@/lib/equipment/fetchTrailerResidue";
import { fetchPresets, slotLetter, type PresetSummary } from "@/lib/trips/tripPlan";
import { createLeftBehindTrip } from "@/lib/trips/tripFlow";
import { productColorFor } from "../../utils/productColor";
import { CodeDash } from "../CodeDash";

type Kind = "empty" | "partial" | "preloaded";
type Handoff = { handoff_id: string; user_id: string; truck_id: string | null };

const MUTE = "rgba(255,255,255,0.55)", HAIR = "rgba(255,255,255,0.16)";
const big = (primary: boolean): React.CSSProperties => ({ width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 800, cursor: "pointer", marginTop: 10, border: primary ? "none" : `1px solid ${HAIR}`, background: primary ? "#fff" : "transparent", color: primary ? "#000" : "#fff", borderRadius: 2 });

export function LeftBehindHost({ userId, companyId, trailerId, trailerName, store, syncNow }: { userId: string | null; companyId: string | null; trailerId: string | null; trailerName: string | null; store: any; syncNow: () => unknown }) {
  const [handoff, setHandoff] = useState<Handoff | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  useEffect(() => {
    setHandoff(null);
    if (!trailerId) return;
    let alive = true;
    void (async () => {
      try {
        const { data } = await supabase.from("equipment_handoffs").select("handoff_id, user_id, truck_id").eq("trailer_id", trailerId).is("resolved_at", null).order("detected_at", { ascending: false }).limit(1).maybeSingle();
        if (!alive || !data) return;
        setHandoff(data as Handoff);
        const { data: nm } = await supabase.rpc("get_display_names_full", { p_user_ids: [(data as Handoff).user_id] });
        const first = ((nm ?? []) as { display_name?: string | null }[])[0];
        if (alive) setName(first?.display_name ?? null);
      } catch { /* no question */ }
    })();
    return () => { alive = false; };
  }, [trailerId]);
  if (!userId || !companyId || !trailerId || !handoff || gone === handoff.handoff_id) return null;
  return <LeftBehindSheet userId={userId} companyId={companyId} trailerId={trailerId} trailerName={trailerName} handoff={handoff} loadingDriverName={name} store={store} syncNow={syncNow} onDone={() => setGone(handoff.handoff_id)} />;
}

function LeftBehindSheet({ userId, companyId, trailerId, trailerName, handoff, loadingDriverName, store, syncNow, onDone }: {
  userId: string; companyId: string; trailerId: string; trailerName: string | null; handoff: Handoff; loadingDriverName: string | null; store: any; syncNow: () => unknown; onDone: () => void;
}) {
  const catalog = useProductsCatalog();
  const [kind, setKind] = useState<Kind | null>(null);
  const [comps, setComps] = useState<{ comp: number; size: number | null }[]>([]);
  const [pick, setPick] = useState<Record<number, string | null>>({});
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await fetchTrailerResidue([trailerId]).catch(() => null);
      const sizes = (r?.sizes[trailerId] ?? []).sort((a, b) => a.comp - b.comp);
      if (!alive) return;
      setComps(sizes);
      try {
        const { data } = await supabase.from("equipment_combos").select("combo_id").eq("trailer_id", trailerId).eq("active", true).limit(1).maybeSingle();
        const ps = await fetchPresets(userId, (data as { combo_id?: string } | null)?.combo_id ?? null, sizes.map((c) => c.comp));
        if (alive) setPresets(ps.filter((p) => p.comps.some(Boolean)));
      } catch { /* no Plan chips */ }
    })();
    return () => { alive = false; };
  }, [trailerId, userId]);

  const products = useMemo(() => catalog.data.filter((p) => p.active !== false), [catalog.data]);
  const codeOf = (id: string | null) => { const p = id ? products.find((x) => x.product_id === id) : null; return p ? String(p.button_code ?? (p.display_name || p.product_name).split(" ")[0]).toUpperCase() : null; };
  const colorOf = (id: string | null) => { const p = id ? products.find((x) => x.product_id === id) : null; return p ? p.hex_code || productColorFor(p.display_name || p.product_name) : null; };
  const ordered = [...comps].sort((a, b) => b.comp - a.comp); // highest first, like the Planner
  const filled = ordered.filter((c) => pick[c.comp]);

  const applyPlan = (pl: PresetSummary) => {
    const next: Record<number, string | null> = {};
    ordered.forEach((c, i) => { next[c.comp] = pl.comps[i] ?? null; });
    setPick(next);
  };

  const resolve = async (k: Kind | "unknown") => {
    await supabase.from("equipment_handoffs").update({ resolved_at: new Date().toISOString(), resolved_by: userId, resolved_kind: k }).eq("handoff_id", handoff.handoff_id);
  };

  const save = async () => {
    if (!kind) return;
    setBusy(true); setErr(null);
    try {
      if (kind === "empty") {
        const rows = ordered.map((c) => ({ trailer_id: trailerId, comp_number: c.comp, company_id: companyId, product_id: pick[c.comp] ?? null, set_by: userId, set_at: new Date().toISOString() }));
        if (rows.length) { const { error } = await supabase.from("trailer_residue_notes").upsert(rows, { onConflict: "trailer_id,comp_number" }); if (error) throw error; }
      } else {
        if (filled.length === 0) { setErr("Pick what is aboard in at least one compartment."); setBusy(false); return; }
        createLeftBehindTrip(store, { companyId, loadingDriverId: handoff.user_id, enteredBy: userId, truckId: handoff.truck_id, trailerId, comps: filled.map((c) => ({ comp: c.comp, productId: pick[c.comp] as string })), loadingDriverName, newId: () => crypto.randomUUID(), now: new Date() });
        void syncNow();
      }
      await resolve(kind);
      onDone();
    } catch (e: any) { setErr(e?.message ?? "Couldn't save."); setBusy(false); }
  };

  const title = trailerName ? `Trailer ${trailerName}` : "Trailer";
  return (
    <>
      <FullscreenModal open title={title} onClose={onDone} footer={null}>
        <div style={{ padding: "0 16px 16px" }}>
          <div style={{ fontSize: 15, lineHeight: 1.45, marginBottom: 6 }}>
            {loadingDriverName ?? "A driver"} was signed in to this trailer in the tracker and never confirmed it. What was it left with?
          </div>
          {!kind && (
            <>
              <button type="button" style={big(true)} onClick={() => setKind("preloaded")}>Preloaded</button>
              <button type="button" style={big(false)} onClick={() => setKind("partial")}>Partial</button>
              <button type="button" style={big(false)} onClick={() => setKind("empty")}>Empty</button>
              <button type="button" style={{ ...big(false), color: MUTE }} onClick={() => { void resolve("unknown").then(onDone); }}>Not sure</button>
            </>
          )}
          {kind && (
            <>
              <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "14px 0 6px" }}>
                {kind === "empty" ? "What it last held, by compartment" : "What is aboard, by compartment"}
              </div>
              {presets.length > 0 && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: MUTE }}>Plan</span>
                  {presets.map((p) => (
                    <button key={p.slot} type="button" onClick={() => applyPlan(p)} style={{ padding: "7px 12px", fontSize: 13, fontWeight: 800, border: `1px solid ${HAIR}`, background: "transparent", color: "#fff", cursor: "pointer", borderRadius: 2 }}>
                      {slotLetter(p.slot)}
                    </button>
                  ))}
                </div>
              )}
              {ordered.map((c) => (
                <button key={c.comp} type="button" onClick={() => { setPickFor(c.comp); setSearch(""); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", marginBottom: 6, border: `1px solid ${HAIR}`, background: "#121213", color: "#fff", cursor: "pointer", borderRadius: 2, textAlign: "left" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, width: 34 }}>C{c.comp}</span>
                  <span style={{ flex: 1 }}>
                    {pick[c.comp] ? <CodeDash items={[{ comp: c.comp, kind: "loaded", code: codeOf(pick[c.comp]) ?? "?", color: colorOf(pick[c.comp]) }]} /> : <span style={{ color: MUTE }}>{kind === "empty" ? "Clean / nothing" : "Empty"}</span>}
                  </span>
                  <span style={{ color: MUTE }}>›</span>
                </button>
              ))}
              {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}
              <button type="button" disabled={busy} style={{ ...big(true), opacity: busy ? 0.5 : 1 }} onClick={() => void save()}>
                {kind === "empty" ? "Save" : "Save and log it"}
              </button>
              <button type="button" style={big(false)} onClick={() => { setKind(null); setErr(null); }}>Back</button>
              {kind !== "empty" && <div style={{ fontSize: 12, color: MUTE, marginTop: 10 }}>This is saved as a parked load for {loadingDriverName ?? "the loading driver"}. You can take it over from the dashboard and log the delivery.</div>}
            </>
          )}
        </div>
      </FullscreenModal>
      <FullscreenModal open={pickFor != null} title={pickFor != null ? `C${pickFor}` : ""} onClose={() => setPickFor(null)} footer={null}>
        <div style={{ padding: "0 16px 16px" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products" autoCapitalize="none"
            style={{ width: "100%", padding: "11px 12px", fontSize: 16, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box", marginBottom: 8 }} />
          <button type="button" style={big(false)} onClick={() => { if (pickFor != null) setPick((x) => ({ ...x, [pickFor]: null })); setPickFor(null); }}>{kind === "empty" ? "Clean / nothing" : "Empty"}</button>
          {products.filter((p) => !search.trim() || `${p.display_name ?? ""} ${p.product_name} ${p.button_code ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 60).map((p) => (
            <button key={p.product_id} type="button" onClick={() => { if (pickFor != null) setPick((x) => ({ ...x, [pickFor]: p.product_id })); setPickFor(null); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", marginTop: 6, border: `1px solid ${HAIR}`, background: "#121213", color: "#fff", cursor: "pointer", borderRadius: 2, textAlign: "left" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.hex_code || productColorFor(p.display_name || p.product_name), flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 15, fontWeight: 700 }}>{p.display_name || p.product_name}</span>
              <span style={{ fontSize: 12, color: MUTE }}>{p.button_code ?? ""}</span>
            </button>
          ))}
        </div>
      </FullscreenModal>
    </>
  );
}
