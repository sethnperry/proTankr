"use client";
// app/planner/trips/move/[id]/page.tsx
//
// One empty move's record (bobtail, empty return, reposition, hook, drop). Not a PTD: a move has no BOL, consignee or
// signatures, so this is a plain record: who, what equipment, when it began and ended, from and to, the odometer and
// miles, the positions the phones captured while it ran, notes, and the Billable choice for staff. The driver who made it,
// or company staff, can fix the end time, the miles and the notes (a move forgotten at the end of a shift ends up here).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { useCalculatorShell } from "../../../CalculatorShellContext";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DateTimePopout, formatDateTime } from "@/lib/ui/DateTimePopout";
import { moveKindLabel, moveMiles, moveMinutes, odometerProblem, parseOdometer } from "@/lib/moves/emptyMoves";
import { ageText, mapsUrl } from "@/lib/equipment/trackFormat";
import type { EmptyMoveRow } from "@/lib/trips/types";

const HAIR = "rgba(255,255,255,0.14)", MUTE = "rgba(255,255,255,0.55)";
const card: React.CSSProperties = { border: `1px solid ${HAIR}`, background: "#121213", padding: 14, marginBottom: 10 };
const cap: React.CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: MUTE };
const big: React.CSSProperties = { width: "100%", padding: "14px 0", border: "none", background: "#fff", color: "#000", fontSize: 14, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", borderRadius: 2, marginTop: 10 };
const CAUSE: Record<string, string> = { open: "app opened", wake: "app opened", arrive: "Arrive", cancel: "load cancelled", move_begin: "move began", move_end: "move ended", shift_end: "end of shift", shift_start: "start of shift", fuel: "fuel stop", park: "parked", hook: "hooked", drop: "dropped" };
const fmtDur = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

type Cap = { captured_at: string; cause: string | null; lat: number; lon: number; odometer: number | null };

export default function MoveRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const shell = useCalculatorShell();
  const me = shell.authUserId ?? null;
  const staff = shell.role === "admin" || shell.role === "dispatch" || shell.role === "lead" || shell.isSuperAdmin;
  const [m, setM] = useState<EmptyMoveRow | null>(null);
  const [missing, setMissing] = useState(false);
  const [driver, setDriver] = useState<string | null>(null);
  const [truck, setTruck] = useState<string | null>(null);
  const [trailer, setTrailer] = useState<string | null>(null);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("empty_moves").select("*").eq("move_id", id).maybeSingle();
    const row = data as EmptyMoveRow | null;
    if (!row) { setMissing(true); return; }
    setM(row);
    const [dn, t, r] = await Promise.all([
      supabase.rpc("get_display_names_full", { p_user_ids: [row.driver_id] }),
      row.truck_id ? supabase.from("trucks").select("truck_name").eq("truck_id", row.truck_id).maybeSingle() : Promise.resolve({ data: null }),
      row.trailer_id ? supabase.from("trailers").select("trailer_name").eq("trailer_id", row.trailer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setDriver(((dn.data ?? []) as { display_name: string | null }[])[0]?.display_name ?? null);
    setTruck((t.data as { truck_name?: string } | null)?.truck_name ?? null);
    setTrailer((r.data as { trailer_name?: string } | null)?.trailer_name ?? null);
    if (row.truck_id || row.trailer_id) {
      let q = supabase.from("position_captures").select("captured_at, cause, lat, lon, odometer").gte("captured_at", row.started_at).order("captured_at");
      if (row.ended_at) q = q.lte("captured_at", new Date(Date.parse(row.ended_at) + 60_000).toISOString());
      q = row.truck_id ? q.eq("truck_id", row.truck_id) : q.eq("trailer_id", row.trailer_id as string);
      const c = await q.limit(60);
      setCaps(((c.data ?? []) as Cap[]));
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  const mine = !!m && m.driver_id === me;
  const canEdit = mine || staff;
  const done = !!m?.ended_at;
  const miles = m ? moveMiles(m) : null;
  const mins = m ? moveMinutes(m) : null;
  const status = !m ? "" : done ? "Complete" : m.dispatched ? "Dispatched" : "Enroute";

  const setBillable = async (v: boolean | null) => {
    if (!m) return;
    setM({ ...m, billable: v });
    await supabase.from("empty_moves").update({ billable: v, client_updated_at: new Date().toISOString() }).eq("move_id", m.move_id);
  };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 60px", color: "#fff" }}>
      <button type="button" onClick={() => router.back()} style={{ border: "none", background: "transparent", color: MUTE, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0 }}>‹ Back</button>
      {missing && <div style={{ ...card, marginTop: 14 }}>That move isn't available.</div>}
      {!m && !missing && <div style={{ marginTop: 14, color: MUTE }}>Loading…</div>}
      {m && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "12px 0" }}>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0, flex: 1 }}>{moveKindLabel(m.kind)}</h1>
            <span style={{ fontSize: 14, fontWeight: 800, color: done ? "#4ade80" : "#60a5fa" }}>{status}</span>
          </div>

          <div style={card}>
            <div style={cap}>Driver and equipment</div>
            <div style={{ fontSize: 16, fontWeight: 800, marginTop: 4 }}>{driver ?? "A driver"}</div>
            <div style={{ fontSize: 14, marginTop: 2 }}>{truck ? `Truck ${truck}` : "No truck recorded"}{" · "}{trailer ? `Trailer ${trailer}` : "Bobtail"}</div>
          </div>

          <div style={card}>
            <div style={cap}>Time</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Began <b>{formatDateTime(Date.parse(m.started_at))}</b></div>
            <div style={{ fontSize: 14, marginTop: 2 }}>{done ? <>Ended <b>{formatDateTime(Date.parse(m.ended_at as string))}</b></> : <span style={{ color: "#fbbf24" }}>Not ended yet. It has been running {mins != null ? fmtDur(mins) : ""}.</span>}</div>
            {done && mins != null && <div style={{ fontSize: 14, marginTop: 2 }}>Duration <b>{fmtDur(mins)}</b></div>}
          </div>

          <div style={card}>
            <div style={cap}>Route</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>From <b>{m.from_text || "—"}</b></div>
            <div style={{ fontSize: 14, marginTop: 2 }}>To <b>{m.to_text || "—"}</b></div>
          </div>

          <div style={card}>
            <div style={cap}>Odometer</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Begin <b>{m.begin_miles != null ? Number(m.begin_miles).toLocaleString("en-US") : "—"}</b></div>
            <div style={{ fontSize: 14, marginTop: 2 }}>End <b>{m.end_miles != null ? Number(m.end_miles).toLocaleString("en-US") : "—"}</b></div>
            <div style={{ fontSize: 14, marginTop: 2 }}>Miles <b>{miles != null ? miles.toLocaleString("en-US") : "—"}</b>{done && miles == null && <span style={{ color: "#fbbf24" }}> · missing an ending odometer</span>}</div>
          </div>

          {(m.notes || m.source) && (
            <div style={card}>
              <div style={cap}>Notes</div>
              <div style={{ fontSize: 14, marginTop: 6, whiteSpace: "pre-wrap", color: m.notes ? "#fff" : MUTE }}>{m.notes || "Nothing noted."}</div>
              <div style={{ fontSize: 12, color: MUTE, marginTop: 6 }}>Source: {m.source === "geotab" ? "created from the truck's tracker" : m.source === "manual" ? "entered by hand" : m.dispatched || m.dispatched_by ? "dispatched" : "the driver's app"}</div>
            </div>
          )}

          {staff && (
            <div style={card}>
              <div style={cap}>Billable · staff only</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                {([[true, "Billable"], [false, "Not billable"], [null, "Not set"]] as [boolean | null, string][]).map(([v, label]) => {
                  const on = (m.billable ?? null) === v;
                  return <button key={label} type="button" onClick={() => void setBillable(v)} style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 800, cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" }}>{label}</button>;
                })}
              </div>
            </div>
          )}

          <div style={card}>
            <div style={cap}>Where the phones saw it</div>
            {caps.length === 0 ? <div style={{ fontSize: 13, color: MUTE, marginTop: 6 }}>No positions were captured while it ran. A position is saved when the app opens, at Arrive and at odometer stamps.</div> : caps.map((c, i) => (
              <div key={i} style={{ fontSize: 13, marginTop: 6 }}>
                <b>{new Date(c.captured_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</b>
                <span style={{ color: MUTE }}> · {CAUSE[c.cause ?? ""] ?? c.cause ?? "captured"} · {ageText(c.captured_at)}</span>
                {" · "}<a href={mapsUrl(c.lat, c.lon)} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>{c.lat.toFixed(4)}, {c.lon.toFixed(4)}</a>
                {c.odometer != null && <span style={{ color: MUTE }}> · odometer {Math.round(c.odometer).toLocaleString("en-US")}</span>}
              </div>
            ))}
          </div>

          {canEdit && <button type="button" onClick={() => setEditing(true)} style={big}>{done ? "Edit this move" : "End or edit this move"}</button>}
          <EditMove open={editing} move={m} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void load(); }} />
        </>
      )}
    </div>
  );
}

function EditMove({ open, move, onClose, onSaved }: { open: boolean; move: EmptyMoveRow; onClose: () => void; onSaved: () => void }) {
  const [endMs, setEndMs] = useState(() => Date.now());
  const [begin, setBegin] = useState("");
  const [end, setEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setEndMs(move.ended_at ? Date.parse(move.ended_at) : Date.now());
    setBegin(move.begin_miles != null ? String(Number(move.begin_miles)) : "");
    setEnd(move.end_miles != null ? String(Number(move.end_miles)) : "");
    setNotes(move.notes ?? ""); setErr(null);
  }, [open, move.move_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const b = begin.trim() ? parseOdometer(begin) : null;
  const problem = useMemo(() => {
    if (endMs < Date.parse(move.started_at)) return "The end can't be before the move began.";
    if (endMs > Date.now() + 60_000) return "The end can't be in the future.";
    if (begin.trim() && b == null) return "The beginning odometer isn't valid.";
    if (end.trim()) return odometerProblem(end, b);
    return null;
  }, [endMs, begin, end, b, move.started_at]);
  const save = async () => {
    if (problem) return setErr(problem);
    setBusy(true); setErr(null);
    const patch: Record<string, unknown> = { ended_at: new Date(endMs).toISOString(), begin_miles: b, end_miles: end.trim() ? parseOdometer(end) : null, notes: notes.trim() || null, client_updated_at: new Date().toISOString() };
    const { error } = await supabase.from("empty_moves").update(patch).eq("move_id", move.move_id);
    setBusy(false);
    if (error) return setErr(error.message);
    onSaved();
  };
  const field: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "12px", background: "#1a1a1b", border: `1px solid ${HAIR}`, color: "#fff", fontSize: 16, borderRadius: 2 };
  return (
    <>
      <FullscreenModal open={open && !picking} title="Edit move" onClose={onClose} footer={null}>
        <div style={cap}>Ended at</div>
        <button type="button" onClick={() => setPicking(true)} style={{ ...field, textAlign: "left", cursor: "pointer", marginTop: 4, marginBottom: 12 }}>{formatDateTime(endMs)} ›</button>
        <div style={cap}>Beginning odometer</div>
        <input value={begin} onChange={(e) => setBegin(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" style={{ ...field, marginTop: 4, marginBottom: 12 }} />
        <div style={cap}>Ending odometer</div>
        <input value={end} onChange={(e) => setEnd(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="Leave blank if unknown" style={{ ...field, marginTop: 4, marginBottom: 12 }} />
        <div style={cap}>Notes</div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...field, marginTop: 4 }} />
        {(err || problem) && <div style={{ color: "#f87171", fontSize: 13, marginTop: 8 }}>{err ?? problem}</div>}
        <button type="button" onClick={() => void save()} disabled={busy} aria-busy={busy} style={{ ...big, opacity: problem ? 0.5 : 1 }}>Save</button>
      </FullscreenModal>
      <DateTimePopout open={open && picking} title="When the move ended" valueMs={endMs} onSet={(ms) => { setEndMs(ms); setPicking(false); }} onCancel={() => setPicking(false)} />
    </>
  );
}
