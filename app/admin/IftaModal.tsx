"use client";
// app/admin/IftaModal.tsx
//
// Company Dashboard → IFTA. Miles by state (Geotab GPS trail scaled to the
// odometer) and gallons purchased by state (the company's fuel stops) for one
// quarter, fleet-wide and per truck, with a CSV. A working figure, not a
// certified filing.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { buildIftaReport, iftaCsv, purchaseState, quarterOf, quarterRange, type GallonsRow, type MilesRow } from "@/lib/ifta/report";
import type { StateOf } from "@/lib/ifta/milesByState";

const STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
type Purchase = { id: string; truck_id: string | null; state: string | null; lat: number | null; lon: number | null; gallons: number; at: string; place: string };

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 };
const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 12px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer", border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)", background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.85)" });
const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

export default function IftaModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const now = quarterOf(new Date().toISOString().slice(0, 10));
  const [sel, setSel] = useState<{ year: number; q: 1 | 2 | 3 | 4 }>(now);
  const [miles, setMiles] = useState<MilesRow[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stateOf, setStateOf] = useState<StateOf | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  // The state lookup (Census boundaries) loads when the report opens, for stops saved without a state.
  useEffect(() => {
    if (!open || stateOf) return;
    void Promise.all([import("@/lib/ifta/milesByState"), import("us-atlas/states-10m.json")]).then(([m, t]) => setStateOf(() => m.makeStateOf((t as { default: unknown }).default)));
  }, [open, stateOf]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [err, setErr] = useState<string | null>(null);
  const [openTruck, setOpenTruck] = useState<string | null>(null);
  const range = quarterRange(sel.year, sel.q);

  useEffect(() => {
    if (!open) return;
    let off = false;
    setMiles(null); setErr(null);
    void (async () => {
      const [m, g, t] = await Promise.all([
        supabase.from("ifta_daily_miles").select("truck_id, state, miles").eq("company_id", companyId).gte("day", range.from).lte("day", range.to).limit(50000),
        supabase.from("fuel_purchases").select("id, truck_id, state, lat, lon, diesel_gallons, started_at, store_name, city").eq("company_id", companyId).eq("status", "complete")
          .gte("started_at", `${range.from}T00:00:00Z`).lte("started_at", `${range.to}T23:59:59Z`).limit(20000),
        supabase.from("trucks").select("truck_id, truck_name").eq("company_id", companyId),
      ]);
      if (off) return;
      if (m.error) { setErr(m.error.message); setMiles([]); return; }
      setMiles(((m.data ?? []) as MilesRow[]).map((r) => ({ ...r, miles: Number(r.miles) })));
      setPurchases(((g.data ?? []) as { id: string; truck_id: string | null; state: string | null; lat: number | null; lon: number | null; diesel_gallons: number | null; started_at: string; store_name: string | null; city: string | null }[])
        .map((r) => ({ id: r.id, truck_id: r.truck_id, state: r.state, lat: r.lat, lon: r.lon, gallons: Number(r.diesel_gallons ?? 0), at: r.started_at, place: [r.store_name, r.city].filter(Boolean).join(" · ") }))
        .sort((a, b) => b.at.localeCompare(a.at)));
      setNames(new Map(((t.data ?? []) as { truck_id: string; truck_name: string }[]).map((x) => [x.truck_id, x.truck_name])));
    })();
    return () => { off = true; };
  }, [open, companyId, range.from, range.to]);

  const stateFor = (p: Purchase) => purchaseState(p, stateOf ?? (() => null));
  const gallons = useMemo<GallonsRow[]>(() => purchases.map((p) => ({ truck_id: p.truck_id, state: stateFor(p), gallons: p.gallons })), [purchases, stateOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const report = useMemo(() => buildIftaReport(miles ?? [], gallons, (id) => names.get(id) ?? "Truck"), [miles, gallons, names]);
  const unknown = purchases.filter((p) => p.gallons > 0 && !stateFor(p));
  const setState = async (p: Purchase) => {
    const st = pick[p.id];
    if (!st) return;
    setMsg(null);
    const { error } = await supabase.from("fuel_purchases").update({ state: st }).eq("id", p.id).select("id");
    if (error) return setMsg(error.message);
    setPurchases((xs) => xs.map((x) => (x.id === p.id ? { ...x, state: st } : x)));
  };
  const years = [now.year, now.year - 1];
  const download = () => {
    const blob = new Blob([iftaCsv(report, range.label)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ifta_${range.label.replace(" ", "_")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <FullscreenModal open={open} title="IFTA" onClose={onClose}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {years.flatMap((y) => ([4, 3, 2, 1] as const).map((q) => ({ y, q }))).filter(({ y, q }) => y < now.year || q <= now.q).slice(0, 6).map(({ y, q }) => (
          <button key={`${y}${q}`} type="button" style={chip(sel.year === y && sel.q === q)} onClick={() => setSel({ year: y, q })}>Q{q} {y}</button>
        ))}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}
      {miles === null ? <div style={{ color: muted }}>Loading…</div> : report.states.length === 0 ? (
        <div style={{ ...card, color: muted, fontSize: 14, lineHeight: 1.5 }}>
          No miles for {range.label} yet. Miles are worked out once a day from each linked truck's Geotab trail, starting the day after the Geotab link is set up.
        </div>
      ) : (
        <>
          <div style={{ ...card, display: "flex", gap: 8, textAlign: "center" }}>
            {[["Miles", num(report.totalMiles)], ["Gallons", num(report.totalGallons)], ["MPG", report.mpg != null ? report.mpg.toFixed(2) : "—"]].map(([l, v]) => (
              <div key={l} style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{v}</div>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: muted, marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By state · all trucks</div>
            {report.states.map((s) => (
              <div key={s.state} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                <span style={{ fontWeight: 700 }}>{s.state === "OUT" ? "Outside the 50 states" : s.state}</span>
                <span className="dash-num" style={{ color: muted }}>{num(s.miles)} mi · {num(s.gallons)} gal</span>
              </div>
            ))}
            {report.gallonsNoState > 0 && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 6 }}>{num(report.gallonsNoState)} gal from fuel stops with no state recorded are in the totals but not in a state.</div>}
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By truck</div>
            {report.trucks.map((t) => (
              <div key={t.truckId}>
                <button type="button" onClick={() => setOpenTruck(openTruck === t.truckId ? null : t.truckId)}
                  style={{ display: "flex", width: "100%", justifyContent: "space-between", background: "none", border: "none", color: "#fff", fontSize: 14, padding: "6px 0", cursor: "pointer" }}>
                  <span style={{ fontWeight: 700 }}>Truck {t.name} {openTruck === t.truckId ? "–" : "+"}</span>
                  <span className="dash-num" style={{ color: muted }}>{num(t.miles)} mi · {num(t.gallons)} gal</span>
                </button>
                {openTruck === t.truckId && t.states.map((s) => (
                  <div key={s.state} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "2px 0 2px 12px", color: muted }}>
                    <span>{s.state}</span><span className="dash-num">{num(s.miles)} mi · {num(s.gallons)} gal</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Fuel purchases · {purchases.length}</div>
            {unknown.length > 0 && <div style={{ fontSize: 12, color: "#fbbf24", marginBottom: 8 }}>{unknown.length} {unknown.length === 1 ? "stop has" : "stops have"} no state. Pick one so the gallons count for IFTA.</div>}
            {msg && <div style={{ fontSize: 12, color: "#f87171", marginBottom: 8 }}>{msg}</div>}
            {purchases.length === 0 && <div style={{ fontSize: 13, color: muted }}>No completed fuel stops this quarter.</div>}
            {purchases.map((p) => {
              const st = stateFor(p);
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "5px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className="dash-num" style={{ color: muted, width: 44 }}>{p.at.slice(5, 10).replace("-", "/")}</span>
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.truck_id ? names.get(p.truck_id) ?? "Truck" : "Truck ?"}{p.place ? <span style={{ color: muted }}> · {p.place}</span> : null}
                  </span>
                  <span className="dash-num">{num(p.gallons)} gal</span>
                  {st ? <span style={{ fontWeight: 800, width: 28, textAlign: "right" }}>{st}</span> : (
                    <span style={{ display: "flex", gap: 4 }}>
                      <select value={pick[p.id] ?? ""} onChange={(e) => setPick((x) => ({ ...x, [p.id]: e.target.value }))} style={{ background: "rgba(255,255,255,0.06)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 2, fontSize: 13, padding: "3px 4px" }}>
                        <option value="">State</option>
                        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <button type="button" disabled={!pick[p.id]} onClick={() => void setState(p)} style={{ border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 12, borderRadius: 2, padding: "3px 8px", cursor: "pointer", opacity: pick[p.id] ? 1 : 0.4 }}>Set</button>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={download} style={{ width: "100%", padding: "12px 0", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>Download CSV</button>
          <div style={{ fontSize: 12, color: muted, marginTop: 10, lineHeight: 1.5 }}>
            A working figure: miles come from the truck's GPS trail scaled to its odometer (state lines can be off by about a mile; the Census boundaries are used), gallons from this company's fuel stops. It leaves out Canadian provinces and tax-paid gallons, so check it before filing.
          </div>
        </>
      )}
    </FullscreenModal>
  );
}
