"use client";
// app/admin/FreightModal.tsx
//
// Company Dashboard → Freight. The board (what is on the road, what is empty), every load as a filtered,
// exportable report, and a recap email a manager sets up for themselves (their own address, daily or weekly)
// through the one scheduler. Works with no dispatch link. Admin, lead and dispatch.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { ReportShell } from "@/app/planner/components/report/ReportShell";
import { deviceTz } from "@/lib/reports/dateRange";
import { nextRunAfter, type Cadence } from "@/lib/notify/schedule";
import { emptyMinutes, freightColumns, freightFilters, freightRows, freightSummary, isEmptyNow, type FreightRow, type Load, type Stop } from "@/lib/freight/freight";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const inp: React.CSSProperties = { width: "100%", padding: "11px 12px", fontSize: 15, background: "#0a0a0b", color: "#fff", border: `1px solid ${HAIR}`, boxSizing: "border-box", marginBottom: 8 };
const btn: React.CSSProperties = { padding: "12px 16px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" };
const ghost: React.CSSProperties = { ...btn, background: "transparent", color: "#fff", border: `1px solid ${HAIR}` };
type Sched = { schedule_id: string; recipients: { type: string; value: string }[]; cadence: Cadence; payload: { days?: number } };
const hours = (m: number | null) => (m == null ? "" : m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${m % 60}m`);

export default function FreightModal({ open, onClose, companyId, userId }: { open: boolean; onClose: () => void; companyId: string; userId: string | null }) {
  const { members } = useCompanyRoster(open ? companyId : null);
  const [rows, setRows] = useState<FreightRow[]>([]);
  const [scheds, setScheds] = useState<Sched[]>([]);
  const [view, setView] = useState<"board" | "loads">("board");
  const [email, setEmail] = useState("");
  const [freq, setFreq] = useState<"daily" | "weekly">("weekly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const since = new Date(Date.now() - 90 * 86400_000).toISOString();
      const { data: ls, error: e } = await supabase.from("freight_loads").select("*").eq("company_id", companyId).or(`status.eq.open,begun_at.gte.${since}`).order("begun_at", { ascending: false }).limit(1500);
      if (e) throw e;
      const loads = (ls ?? []) as Load[];
      const stops: Stop[] = [];
      for (let i = 0; i < loads.length; i += 100) {
        const { data } = await supabase.from("freight_stops").select("*").in("freight_id", loads.slice(i, i + 100).map((l) => l.freight_id));
        stops.push(...((data ?? []) as Stop[]));
      }
      const { data: trucks } = await supabase.from("trucks").select("truck_id, truck_name").eq("company_id", companyId);
      const tn = new Map(((trucks ?? []) as { truck_id: string; truck_name: string }[]).map((t) => [t.truck_id, t.truck_name]));
      const dn = new Map(members.map((m) => [m.user_id, m.display_name]));
      setRows(freightRows(loads, stops, (id) => dn.get(id) ?? "Driver", (id) => (id ? tn.get(id) ?? "Truck" : "Truck")));
      const { data: ss } = await supabase.from("notification_schedules").select("schedule_id, recipients, cadence, payload").eq("company_id", companyId).eq("template_key", "freight_recap").eq("is_active", true);
      setScheds((ss ?? []) as Sched[]);
    } catch (e: any) { setError(e?.message ?? "Couldn't load."); }
    setBusy(false);
  }, [companyId, members]);
  useEffect(() => { if (open) void load(); }, [open, load]);
  useEffect(() => { if (open && !email) void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, [open, email]);

  const onRoad = rows.filter((r) => r.load.status === "open");
  const empty = rows.filter((r) => isEmptyNow(r.load));

  const addRecap = async () => {
    setError(null); setOk(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    const cadence: Cadence = freq === "daily" ? { freq: "daily", at: "07:00", tz: deviceTz() } : { freq: "weekly", dow: 1, at: "07:00", tz: deviceTz() };
    const next = nextRunAfter(cadence, Date.now());
    const { error: e } = await supabase.from("notification_schedules").insert({ company_id: companyId, kind: "recap", template_key: "freight_recap", recipients: [{ type: "email", value: email.trim() }], channels: ["email"], cadence, payload: { days: freq === "daily" ? 1 : 7, title: "Freight recap" }, next_run_at: next ? new Date(next).toISOString() : null, is_active: true, created_by: userId });
    if (e) return setError(e.message);
    setOk(freq === "daily" ? "You'll get a recap every morning at 7." : "You'll get a recap every Monday at 7."); await load();
  };
  const removeRecap = async (id: string) => { const { error: e } = await supabase.from("notification_schedules").delete().eq("schedule_id", id); if (e) setError(e.message); else await load(); };

  const columns = useMemo(() => freightColumns, []);
  const Row = ({ r, tag }: { r: FreightRow; tag: string }) => (
    <div style={{ padding: "10px 0", borderTop: `1px solid ${HAIR}`, fontSize: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}><span>{r.driver} · {r.truck}</span><span style={{ color: MUTE, fontWeight: 600 }}>{tag}</span></div>
      <div style={{ color: MUTE, fontSize: 13 }}>{r.load.preset === "lts" ? `LTS route ${r.load.route_number ?? ""}` : r.load.reference}{r.load.destination_text ? ` → ${r.load.destination_text}` : ""}</div>
    </div>
  );

  return (
    <>
      <FullscreenModal open={open && view === "board"} title="Freight" onClose={onClose} footer={null}>
        {error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{error}</div>}
        <button type="button" style={{ ...ghost, width: "100%", marginBottom: 16 }} onClick={() => setView("loads")}>All loads · report &amp; export</button>
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, marginBottom: 4 }}>On the road ({onRoad.length})</div>
        {onRoad.length === 0 && <div style={{ color: MUTE, fontSize: 14, marginBottom: 12 }}>{busy ? "Loading…" : "Nothing out."}</div>}
        {onRoad.map((r) => <Row key={r.key} r={r} tag={`since ${new Date(r.load.begun_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}`} />)}
        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "18px 0 4px" }}>Empty now ({empty.length})</div>
        {empty.length === 0 && <div style={{ color: MUTE, fontSize: 14 }}>No empty trucks.</div>}
        {empty.map((r) => <Row key={r.key} r={r} tag={`empty ${hours(emptyMinutes(r.load, Date.now()))}`} />)}

        <div style={{ fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTE, margin: "26px 0 6px" }}>Email me a recap</div>
        <div style={{ color: MUTE, fontSize: 13, marginBottom: 8 }}>What's on the road, what's empty and what was delivered. Goes to the address below. It can be any address you choose.</div>
        <input style={inp} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" inputMode="email" />
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {(["weekly", "daily"] as const).map((f) => <button key={f} type="button" onClick={() => setFreq(f)} style={{ ...ghost, flex: 1, background: freq === f ? "#fff" : "transparent", color: freq === f ? "#000" : "#fff" }}>{f === "daily" ? "Every morning" : "Every Monday"}</button>)}
        </div>
        <button type="button" style={{ ...btn, width: "100%" }} onClick={() => void addRecap()}>Start recap</button>
        {ok && <div style={{ color: "#4ade80", fontSize: 13, marginTop: 8 }}>{ok}</div>}
        {scheds.map((s) => (
          <div key={s.schedule_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${HAIR}`, marginTop: 8, fontSize: 14 }}>
            <span>{s.recipients[0]?.value} · {s.cadence.freq === "daily" ? "every morning" : "every Monday"}</span>
            <button type="button" onClick={() => void removeRecap(s.schedule_id)} style={{ background: "none", border: "none", color: "#f87171", fontWeight: 800, cursor: "pointer" }}>Stop</button>
          </div>
        ))}
      </FullscreenModal>

      <ReportShell open={open && view === "loads"} title="Freight loads · 90 days" onClose={() => setView("board")} rows={rows} columns={columns} filters={freightFilters} getKey={(r) => r.key}
        fileName="freight_loads" summary={freightSummary} empty={busy ? "Loading…" : "No freight loads yet."} />
    </>
  );
}
