"use client";
// app/admin/DelaysModal.tsx
//
// Company Dashboard → Delays. Delay can be billable, so this separates time a
// driver logged with the Delay button (with a reason) from "unaccounted" time:
// minutes past the drop estimate that the driver said had no reason. The
// unaccounted list is the task list: those are the drops to ask about.

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useCompanyRoster } from "@/app/planner/hooks/useCompanyRoster";
import { buildDelayReport, type DelayReportInput } from "@/lib/trips/delayReport";
import { DELAY_EVENT, LEG_LABEL, type DelayLeg } from "@/lib/trips/delays";

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "7px 12px", borderRadius: 2, fontSize: 13, fontWeight: 700, cursor: "pointer",
  border: on ? "1px solid #fff" : "1px solid rgba(255,255,255,0.18)", background: on ? "#fff" : "transparent", color: on ? "#000" : "rgba(255,255,255,0.7)",
});
const RANGES = [{ d: 7, label: "7d" }, { d: 30, label: "30d" }, { d: 90, label: "90d" }] as const;

const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export default function DelaysModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<DelayReportInput | null>(null);
  const [places, setPlaces] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const { members } = useCompanyRoster(open ? companyId : null);
  const nameById = useMemo(() => Object.fromEntries(members.map((m) => [m.user_id, m.display_name])), [members]);

  useEffect(() => {
    if (!open || !companyId) return;
    let alive = true;
    setData(null);
    setErr(null);
    void (async () => {
      try {
        const since = new Date(Date.now() - days * 86_400_000).toISOString();
        const { data: trips, error } = await supabase.from("trips").select("trip_id, driver_id, started_at")
          .eq("company_id", companyId).gte("started_at", since).limit(2000);
        if (error) throw error;
        const ids = (trips ?? []).map((t: any) => t.trip_id as string);
        const deliveries: any[] = [];
        const events: any[] = [];
        for (const part of chunk(ids, 150)) {
          const [d, e] = await Promise.all([
            supabase.from("trip_deliveries").select("delivery_id, trip_id, unaccounted_delay_min, arrived_at, left_at, status, location_id, one_off_name").in("trip_id", part),
            supabase.from("trip_events").select("event_id, trip_id, event_type, occurred_at, actor_id, pickup_id, delivery_id, payload").eq("event_type", DELAY_EVENT).in("trip_id", part),
          ]);
          if (d.error) throw d.error;
          deliveries.push(...(d.data ?? []));
          events.push(...(e.data ?? []));
        }
        const locIds = [...new Set(deliveries.map((d) => d.location_id).filter(Boolean))] as string[];
        const names: Record<string, string> = {};
        for (const part of chunk(locIds, 150)) {
          const { data: locs } = await supabase.from("delivery_locations").select("location_id, name, location_number, city, state").in("location_id", part);
          for (const l of (locs ?? []) as any[]) names[l.location_id] = `${l.location_number ? `#${l.location_number} ` : ""}${l.name}${l.city ? ` · ${l.city}${l.state ? `, ${l.state}` : ""}` : ""}`;
        }
        if (!alive) return;
        setPlaces(names);
        setData({ trips: (trips ?? []) as any, deliveries, events });
      } catch (e: any) {
        if (alive) setErr(e?.message ?? "Couldn't load delays.");
      }
    })();
    return () => { alive = false; };
  }, [open, companyId, days]);

  const report = useMemo(() => (data ? buildDelayReport(data) : null), [data]);
  const who = (id: string) => nameById[id] ?? "Driver";
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }) : "");

  return (
    <FullscreenModal open={open} title="Delays" onClose={onClose}>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {RANGES.map((r) => <button key={r.d} type="button" style={chip(days === r.d)} onClick={() => setDays(r.d)}>{r.label}</button>)}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 14, marginBottom: 10 }}>{err}</div>}
      {!report && !err && <div style={{ color: muted }}>Loading…</div>}
      {report && (
        <>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ ...card, flex: 1, marginBottom: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: muted }}>Logged delay</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{fmtMin(report.loggedMin)}</div>
              <div style={{ fontSize: 12, color: muted }}>{report.delays} delay{report.delays === 1 ? "" : "s"} with a reason</div>
            </div>
            <div style={{ ...card, flex: 1, marginBottom: 0, borderColor: report.unaccountedMin > 0 ? "rgba(248,113,113,0.6)" : undefined }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: report.unaccountedMin > 0 ? "#f87171" : muted }}>Unaccounted</div>
              <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, color: report.unaccountedMin > 0 ? "#f87171" : "#fff" }}>{fmtMin(report.unaccountedMin)}</div>
              <div style={{ fontSize: 12, color: muted }}>{report.unaccounted.length} drop{report.unaccounted.length === 1 ? "" : "s"} to ask about</div>
            </div>
          </div>

          {report.unaccounted.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8, color: "#f87171" }}>To look into</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>The driver said there was no delay, but the drop ran past the estimate and grace.</div>
              {report.unaccounted.map((u) => (
                <div key={u.deliveryId} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)", alignItems: "baseline" }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: "#f87171", minWidth: 64 }}>{fmtMin(u.minutes)}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>
                    <b>{who(u.driverId)}</b>
                    <span style={{ color: muted }}> · {u.locationId ? places[u.locationId] ?? "Store" : u.oneOffName ?? "Store"} · {when(u.when)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By reason</div>
            {report.byReason.length === 0 && <div style={{ fontSize: 13, color: muted }}>No delays logged in this period.</div>}
            {report.byReason.map((r) => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 14 }}>
                <span>{r.label} <span style={{ color: muted }}>× {r.count}</span></span>
                <b>{fmtMin(r.minutes)}</b>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>By driver</div>
            {report.byDriver.length === 0 && <div style={{ fontSize: 13, color: muted }}>Nothing yet.</div>}
            {report.byDriver.map((d) => (
              <div key={d.driverId} style={{ padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15 }}>
                  <b>{who(d.driverId)}</b>
                  <span>
                    {fmtMin(d.loggedMin)}
                    {d.unaccountedMin > 0 && <span style={{ color: "#f87171", fontWeight: 800 }}> · {fmtMin(d.unaccountedMin)} unaccounted</span>}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>
                  {(Object.keys(d.byLeg) as DelayLeg[]).filter((k) => d.byLeg[k] > 0).map((k) => `${LEG_LABEL[k]} ${fmtMin(d.byLeg[k])}`).join(" · ") || "No logged delay"}
                </div>
                {d.byReason.length > 0 && (
                  <div style={{ fontSize: 12, color: muted }}>{d.byReason.slice(0, 3).map((r) => `${r.label} ×${r.count}`).join(" · ")}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </FullscreenModal>
  );
}
