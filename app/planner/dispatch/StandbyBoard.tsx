"use client";
// app/planner/dispatch/StandbyBoard.tsx
//
// Dispatch's Standby board (the "On Call" tool): who offered extra hours and when, as a Gantt chart. Filter by
// region and local area (deselect the areas that aren't in your market), or pick a saved market to apply its areas
// and see coverage against how many drivers it wants. Markets are made on the second tab.

import React, { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { areasOf, barBox, coverage, filterSignups, normArea, type DriverLite, type Filter } from "@/lib/standby/coverage";
import { useStandbyBoard, useStandbyMarkets } from "@/lib/standby/useStandby";

const HAIR = "rgba(255,255,255,0.12)";
const MUTED = "rgba(255,255,255,0.5)";
const NAME_W = 124;
const DAY_W = 112;
const LEVEL_BG = { full: "rgba(74,222,128,0.38)", short: "rgba(251,191,36,0.38)", empty: "rgba(248,113,113,0.38)", none: "rgba(255,255,255,0.08)" } as const;
const chip = (on: boolean): React.CSSProperties => ({ padding: "8px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", borderRadius: 2, border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.2)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTED, margin: "14px 0 6px" };

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };

export function StandbyBoard({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string | null }) {
  const board = useStandbyBoard(companyId, open);
  const mk = useStandbyMarkets(companyId, open);
  const [tab, setTab] = useState<"board" | "markets">("board");
  const [region, setRegion] = useState<string | null>(null);
  const [areas, setAreas] = useState<Set<string> | null>(null);
  const [marketId, setMarketId] = useState<string | null>(null);
  const [days, setDays] = useState(7);
  const [editing, setEditing] = useState<{ market_id?: string; name: string; local_areas: string[]; required_count: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const byId = useMemo(() => new Map(board.drivers.map((d) => [d.user_id, d])), [board.drivers]);
  const regions = useMemo(() => [...new Set(board.drivers.map((d) => String(d.region ?? "").trim()).filter(Boolean))].sort(), [board.drivers]);
  const areaOpts = useMemo(() => areasOf(board.drivers, region), [board.drivers, region]);
  const market = mk.markets.find((m) => m.market_id === marketId) ?? null;
  const filter: Filter = { region, areas };
  const fromMs = useMemo(startOfToday, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const hours = days * 24;
  const live = useMemo(() => filterSignups(board.signups, byId, filter, Date.now()), [board.signups, byId, region, areas]); // eslint-disable-line react-hooks/exhaustive-deps
  const cov = useMemo(() => coverage(live, fromMs, hours, 6, market ? market.required_count : null), [live, fromMs, hours, market]);
  const rows = useMemo(() => {
    const by = new Map<string, typeof live>();
    for (const s of live) by.set(s.user_id, [...(by.get(s.user_id) ?? []), s]);
    return [...by].map(([uid, list]) => ({ d: byId.get(uid) as DriverLite, list })).sort((a, b) => a.d.name.localeCompare(b.d.name));
  }, [live, byId]);

  const chartW = days * DAY_W;
  const nowFrac = (Date.now() - fromMs) / (hours * 3600_000);
  const isOn = (key: string) => areas == null || areas.has(key);
  const toggleArea = (key: string) => {
    const all = areaOpts.map((a) => a.key);
    const cur = areas ?? new Set(all);
    const next = new Set(cur);
    next.has(key) ? next.delete(key) : next.add(key);
    setMarketId(null);
    setAreas(next.size === all.length ? null : next);
  };
  const pickMarket = (m: typeof mk.markets[number] | null) => {
    setMarketId(m?.market_id ?? null);
    setRegion(null);
    setAreas(m ? new Set(m.local_areas.map(normArea)) : null);
  };
  const dayLabels = Array.from({ length: days }, (_, i) => new Date(fromMs + i * 86400_000));
  const stepper = (n: number, set: (v: number) => void) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button type="button" onClick={() => set(Math.max(0, n - 1))} style={chip(false)}>–</button>
      <b className="dash-num" style={{ fontSize: 18, minWidth: 20, textAlign: "center" }}>{n}</b>
      <button type="button" onClick={() => set(n + 1)} style={chip(false)}>+</button>
    </span>
  );

  return (
    <FullscreenModal open={open} title="On Call" onClose={onClose} footer={null}>
      <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
        <button type="button" style={{ ...chip(tab === "board"), flex: 1 }} onClick={() => setTab("board")}>Board</button>
        <button type="button" style={{ ...chip(tab === "markets"), flex: 1 }} onClick={() => setTab("markets")}>Markets</button>
      </div>

      {tab === "board" ? (
        <>
          <div style={cap}>Market</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button type="button" style={chip(!marketId)} onClick={() => pickMarket(null)}>All</button>
            {mk.markets.map((m) => <button key={m.market_id} type="button" style={chip(marketId === m.market_id)} onClick={() => pickMarket(m)}>{m.name} · {m.required_count}</button>)}
          </div>
          <div style={cap}>Region</div>
          <CustomSelect value={region ?? ""} onChange={(v) => { setRegion(v || null); setMarketId(null); setAreas(null); }} options={[{ value: "", label: "All regions" }, ...regions.map((r) => ({ value: r, label: r }))]} />
          <div style={{ ...cap, display: "flex", alignItems: "baseline" }}>
            <span style={{ flex: 1 }}>Local areas</span>
            <button type="button" onClick={() => { setAreas(null); setMarketId(null); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>All</button>
            <button type="button" onClick={() => { setAreas(new Set()); setMarketId(null); }} style={{ background: "none", border: "none", color: "#fff", fontSize: 11, fontWeight: 800, cursor: "pointer", marginLeft: 12 }}>None</button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {areaOpts.length === 0 && <span style={{ fontSize: 13, color: MUTED }}>No local areas on any driver's profile yet.</span>}
            {areaOpts.map((a) => <button key={a.key} type="button" style={chip(isOn(a.key))} onClick={() => toggleArea(a.key)}>{a.label}</button>)}
          </div>
          <div style={{ display: "flex", gap: 6, margin: "14px 0 8px", alignItems: "center" }}>
            {[3, 7, 14].map((d) => <button key={d} type="button" style={chip(days === d)} onClick={() => setDays(d)}>{d} days</button>)}
            <span style={{ marginLeft: "auto", fontSize: 13, color: MUTED }}>{rows.length} driver{rows.length === 1 ? "" : "s"} offered</span>
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${HAIR}`, background: "#0f0f10" }}>
            <div style={{ width: NAME_W + chartW, position: "relative" }}>
              <div style={{ display: "flex", borderBottom: `1px solid ${HAIR}` }}>
                <div style={{ width: NAME_W, flexShrink: 0, position: "sticky", left: 0, background: "#0f0f10", zIndex: 2, padding: "6px 8px", fontSize: 10, color: MUTED }}>{market ? `${market.name} · wants ${market.required_count}` : "Coverage"}</div>
                <div style={{ display: "flex", width: chartW }}>
                  {dayLabels.map((d) => <div key={+d} style={{ width: DAY_W, flexShrink: 0, padding: "6px 6px", fontSize: 11, fontWeight: 800, borderLeft: `1px solid ${HAIR}` }}>{d.toLocaleDateString([], { weekday: "short", month: "numeric", day: "numeric" })}</div>)}
                </div>
              </div>
              <div style={{ display: "flex", borderBottom: `1px solid ${HAIR}` }}>
                <div style={{ width: NAME_W, flexShrink: 0, position: "sticky", left: 0, background: "#0f0f10", zIndex: 2 }} />
                <div style={{ display: "flex", width: chartW }}>
                  {cov.map((b) => (
                    <div key={b.fromMs} title={`${new Date(b.fromMs).toLocaleString([], { weekday: "short", hour: "numeric" })}: ${b.count} drivers`}
                      style={{ width: chartW / cov.length, height: 26, background: LEVEL_BG[b.level], borderLeft: "1px solid rgba(0,0,0,0.35)", fontSize: 11, fontWeight: 800, textAlign: "center", lineHeight: "26px", color: "#fff" }}>{b.count || ""}</div>
                  ))}
                </div>
              </div>
              {rows.length === 0 && <div style={{ padding: "16px 12px", fontSize: 14, color: MUTED }}>{board.loading ? "Loading…" : "Nobody has offered hours in this view."}</div>}
              {rows.map(({ d, list }) => (
                <div key={d.user_id} style={{ display: "flex", borderBottom: `1px solid ${HAIR}`, height: 38 }}>
                  <div style={{ width: NAME_W, flexShrink: 0, position: "sticky", left: 0, background: "#0f0f10", zIndex: 2, padding: "4px 8px", overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{d.name}</div>
                    <div style={{ fontSize: 10, color: MUTED, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{String(d.local_area ?? "").trim() || "No local area"}</div>
                  </div>
                  <div style={{ position: "relative", width: chartW }}>
                    {list.map((s) => {
                      const b = barBox(s, fromMs, hours);
                      if (!b) return null;
                      const a = new Date(s.start_at), z = new Date(s.end_at);
                      return <div key={s.signup_id} title={`${a.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })} to ${z.toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
                        style={{ position: "absolute", top: 7, height: 24, left: `${b.left * 100}%`, width: `${b.width * 100}%`, background: "#60a5fa", borderRadius: 2 }} />;
                    })}
                  </div>
                </div>
              ))}
              {nowFrac > 0 && nowFrac < 1 && <div style={{ position: "absolute", top: 0, bottom: 0, left: NAME_W + nowFrac * chartW, width: 2, background: "#f87171", pointerEvents: "none", zIndex: 1 }} />}
            </div>
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Blue bars are offered windows. The top row counts drivers per 6 hours{market ? `: green meets the ${market.required_count} wanted, amber is short, red is empty` : ". Pick a market to grade it"}. The red line is now.</div>
        </>
      ) : (
        <>
          {err && <div style={{ color: "#f87171", fontSize: 13, margin: "8px 0" }}>{err}</div>}
          {!editing && (
            <>
              <div style={cap}>Markets</div>
              {mk.markets.length === 0 && <div style={{ fontSize: 14, color: MUTED, marginBottom: 8 }}>A market is a saved set of local areas and how many drivers you want on standby there.</div>}
              {mk.markets.map((m) => (
                <button key={m.market_id} type="button" onClick={() => setEditing({ market_id: m.market_id, name: m.name, local_areas: m.local_areas, required_count: m.required_count })}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, background: "#0f0f10", border: `1px solid ${HAIR}`, color: "#fff", cursor: "pointer" }}>
                  <b style={{ fontSize: 15 }}>{m.name}</b><span style={{ color: MUTED, fontSize: 13 }}> · wants {m.required_count} · {m.local_areas.length} area{m.local_areas.length === 1 ? "" : "s"}</span>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{m.local_areas.join(", ") || "No areas"}</div>
                </button>
              ))}
              <button type="button" onClick={() => setEditing({ name: "", local_areas: areas ? areaOpts.filter((a) => areas.has(a.key)).map((a) => a.label) : [], required_count: 3 })}
                style={{ width: "100%", padding: "15px 0", fontSize: 15, fontWeight: 900, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}>New market{areas ? " from the board's areas" : ""}</button>
            </>
          )}
          {editing && (
            <>
              <div style={cap}>Name</div>
              <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Tampa nights"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 16, color: "#fff", background: "rgba(255,255,255,0.05)", border: `1px solid ${HAIR}`, borderRadius: 2 }} />
              <div style={cap}>Drivers wanted on standby</div>
              {stepper(editing.required_count, (v) => setEditing({ ...editing, required_count: v }))}
              <div style={cap}>Local areas in this market</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {areasOf(board.drivers, null).map((a) => {
                  const on = editing.local_areas.some((x) => normArea(x) === a.key);
                  return <button key={a.key} type="button" style={chip(on)} onClick={() => setEditing({ ...editing, local_areas: on ? editing.local_areas.filter((x) => normArea(x) !== a.key) : [...editing.local_areas, a.label] })}>{a.label}</button>;
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
                <button type="button" style={{ ...chip(false), flex: 1, padding: "14px 0" }} onClick={() => { setEditing(null); setErr(null); }}>Cancel</button>
                {editing.market_id && <button type="button" style={{ ...chip(false), flex: 1, padding: "14px 0", color: "#f87171" }} onClick={async () => { const e = await mk.remove(editing.market_id!); if (e) setErr(e); else { setEditing(null); setMarketId(null); } }}>Delete</button>}
                <button type="button" style={{ flex: 2, padding: "14px 0", fontSize: 15, fontWeight: 900, background: "#fff", color: "#000", border: "none", cursor: "pointer" }}
                  onClick={async () => { const e = await mk.save(editing); if (e) setErr(e); else { setEditing(null); setErr(null); } }}>Save</button>
              </div>
            </>
          )}
        </>
      )}
    </FullscreenModal>
  );
}
