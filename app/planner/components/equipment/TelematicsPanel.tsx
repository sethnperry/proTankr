"use client";
// app/planner/components/equipment/TelematicsPanel.tsx
//
// The telematics window for a truck: what changes and can be fetched, not what we already
// imported (unit number, VIN, make, model, year). Gauges first (odometer, engine hours, fuel,
// movement), then who and what is with the truck, then a break, then the GPS position with a
// Map it button, then a reserved area for trip recap and change history.
// Which link shows, and what it's called, depends on the company's telematics connection.

import React, { useCallback, useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { fetchTruckReading, type TruckReading } from "@/lib/telematics/useTruckReading";
import { useTelematicsLink } from "@/lib/telematics/useTelematicsLink";
import { gaugeTiles, type Tile, type Tone } from "@/lib/telematics/readoutLayout";
import { hosText } from "@/lib/telematics/progress";
import { ageText, compass, mapsUrl } from "@/lib/equipment/trackFormat";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui/look";
import { supabase } from "@/lib/supabase/client";
import type { Discovery } from "@/lib/telematics/types";

/** Admin tool: ask the provider what it actually reports for this truck. */
function DiscoverySection({ truckId, providerName }: { truckId: string; providerName: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [data, setData] = useState<Discovery | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  async function run() {
    setState("loading"); setErr(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch(`/api/telematics/discover?truckId=${encodeURIComponent(truckId)}`, { headers: { Authorization: `Bearer ${s.session?.access_token ?? ""}` }, cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Couldn't ask.");
      setData(j as Discovery); setState("ok");
    } catch (e: any) { setErr(e?.message ?? "Couldn't ask."); setState("error"); }
  }
  const kv = (o: Record<string, string>) => Object.entries(o);
  const readings = (data?.readings ?? []).filter((r) => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={() => void run()} disabled={state === "loading"} aria-busy={state === "loading"} style={{ ...SECONDARY_BTN }}>
        {state === "loading" ? `Asking ${providerName}… (can take a minute)` : state === "ok" ? "Ask again" : `What can ${providerName} tell us? (admin)`}
      </button>
      {err && <div style={{ color: "#fca5a5", fontSize: 13, marginTop: 8 }}>{err}</div>}
      {data && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {data.errors.length > 0 && <div style={{ color: "#fb923c", marginBottom: 8 }}>{data.errors.map((e, i) => <div key={i}>• {e}</div>)}</div>}
          <div style={cap}>Other data ({providerName} has)</div>
          {data.counts.map((c) => <Line key={c.label} k={c.label} v={c.count == null ? "error" : `${c.count}${c.note ? ` · ${c.note}` : ""}`} />)}
          <div style={{ ...cap, marginTop: 14 }}>Readings logged in the last 3 days · {data.readings.length}</div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter (fuel, def, temp, battery…)" style={{ width: "100%", boxSizing: "border-box", margin: "6px 0", padding: "9px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.14)", color: "#fff", fontSize: 14 }} />
          {readings.map((r) => <Line key={r.id} k={`${r.name}${r.unit ? ` (${r.unit})` : ""}`} v={`${r.latest} · ${r.samples} samples`} />)}
          <div style={{ ...cap, marginTop: 14 }}>Live status fields</div>
          {kv(data.status).map(([k, v]) => <Line key={k} k={k} v={v} />)}
          <div style={{ ...cap, marginTop: 14 }}>Vehicle record fields</div>
          {kv(data.device).map(([k, v]) => <Line key={k} k={k} v={v} />)}
        </div>
      )}
    </div>
  );
}

const MUTED = "rgba(255,255,255,0.5)";
const TONE: Record<Tone, string> = { normal: "#fff", good: "#4ade80", warn: "#fb923c", bad: "#f87171", muted: "rgba(255,255,255,0.3)" };
const cap: React.CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTED };

/** Two linked nodes: reads as "connected". */
export function ConnectIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="5" cy="12" r="2.5" /><circle cx="19" cy="12" r="2.5" /><path d="M7.5 12h9" /><path d="M10 8.5l-2.5 3.5 2.5 3.5M14 8.5l2.5 3.5-2.5 3.5" opacity="0.55" />
    </svg>
  );
}

function GaugeTile({ t }: { t: Tile }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: "12px 12px 10px", minWidth: 0 }}>
      <div style={cap}>{t.label}</div>
      <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 5 }}>
        <span style={{ fontSize: 26, fontWeight: 900, color: TONE[t.tone], fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.value}</span>
        {t.unit && <span style={{ fontSize: 13, fontWeight: 800, color: MUTED }}>{t.unit}</span>}
      </div>
      {t.bar != null && (
        <div aria-hidden style={{ height: 4, background: "rgba(255,255,255,0.12)", marginTop: 8 }}>
          <div style={{ width: `${t.bar}%`, height: "100%", background: TONE[t.tone] }} />
        </div>
      )}
      {t.sub && <div style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>{t.sub}</div>}
    </div>
  );
}

function Line({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, padding: "9px 0", borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 14 }}>
      <span style={{ color: MUTED, flexShrink: 0 }}>{k}</span>
      <span style={{ fontWeight: 700, textAlign: "right", minWidth: 0, wordBreak: "break-word" }}>{v}</span>
    </div>
  );
}

function Break({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "22px 0 12px" }}>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
      <span style={cap}>{label}</span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.14)" }} />
    </div>
  );
}

export function TelematicsPanel({ open, onClose, providerName, truckId, truckName, linked, isAdmin }: {
  open: boolean; onClose: () => void; providerName: string; truckId: string; truckName: string; linked: boolean; isAdmin?: boolean;
}) {
  const [reading, setReading] = useState<TruckReading | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "none">("loading");
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!linked) { setState("none"); return; }
    setState("loading");
    const r = await fetchTruckReading(truckId);
    setReading(r);
    setFetchedAt(Date.now());
    setState(r ? "ok" : "none");
  }, [truckId, linked]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const tiles = reading ? gaugeTiles(reading) : [];
  const dir = compass(reading?.bearingDeg ?? null);
  const place = reading ? [reading.city, reading.state].filter(Boolean).join(", ") : "";
  const hasPos = reading?.lat != null && reading?.lon != null;
  const hos = reading?.hos ? hosText(reading.hos) : null;
  const driver = reading?.driverName ?? (reading?.lastDriver ? `${reading.lastDriver.name} (last)` : null);
  const trailers = reading?.geotabTrailers ?? [];
  const bols = reading?.shipments ?? [];

  return (
    <FullscreenModal open={open} onClose={onClose} title={`${providerName} · ${truckName}`} footer={null}
      headerRight={<button type="button" onClick={() => void load()} disabled={state === "loading"} aria-busy={state === "loading"} style={{ background: "none", border: "none", color: "#fff", fontWeight: 800, fontSize: 12, cursor: "pointer" }}>Refresh</button>}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, color: MUTED, fontSize: 12, marginBottom: 12 }}>
        <span style={{ color: state === "ok" ? "#4ade80" : MUTED, display: "flex" }}><ConnectIcon /></span>
        {state === "loading" ? `Asking ${providerName}…` : state === "ok" ? `Live from ${providerName}${fetchedAt ? ` · fetched ${ageText(new Date(fetchedAt).toISOString())}` : ""}` : `${providerName} isn't answering for this truck`}
      </div>

      {state === "none" && (
        <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 14, fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>
          {linked
            ? `${providerName} didn't return anything for this truck right now. It may be briefly unavailable, so try Refresh in a minute.`
            : `This truck isn't linked to a vehicle in ${providerName} yet. A company admin can link it under Company Dashboard → Telematics.`}
        </div>
      )}

      {state === "ok" && reading && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {tiles.map((t) => <GaugeTile key={t.key} t={t} />)}
          </div>

          <div style={{ marginTop: 14 }}>
            {driver && <Line k="Driver" v={driver} />}
            {hos && <Line k="Hours" v={<span style={{ color: hos.color === MUTED ? "#fff" : hos.color }}>{hos.text}</span>} />}
            {(reading.trailerName || trailers.length > 0) && (
              <Line k="Trailer hooked" v={reading.trailerName ?? trailers.map((x) => x.name).join(", ")} />
            )}
            {bols.length > 0 && <Line k="Shipments" v={bols.map((b) => b.documentNumber).join(", ")} />}
            <Line k="Last report" v={ageText(reading.at)} />
          </div>

          <Break label="Location" />
          {hasPos ? (
            <div style={{ border: "1px solid rgba(255,255,255,0.14)", padding: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>{place || "Position found"}</div>
              <div style={{ fontSize: 13, color: MUTED, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {reading.lat!.toFixed(5)}, {reading.lon!.toFixed(5)}
                {reading.speedMph != null && reading.speedMph > 2 ? ` · ${Math.round(reading.speedMph)} mph${dir ? ` ${dir}` : ""}` : " · stopped"}
              </div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Position {ageText(reading.at)}</div>
              <a href={mapsUrl(reading.lat!, reading.lon!)} target="_blank" rel="noopener noreferrer"
                style={{ ...PRIMARY_BTN, display: "block", textAlign: "center", textDecoration: "none", marginTop: 12, boxSizing: "border-box" }}>
                Map it
              </a>
            </div>
          ) : (
            <div style={{ border: "1px dashed rgba(255,255,255,0.25)", padding: 14, fontSize: 14, color: MUTED, lineHeight: 1.5 }}>
              No GPS position is available for this truck.
            </div>
          )}
        </>
      )}

      <Break label="Coming later" />
      <div style={{ border: "1px dashed rgba(255,255,255,0.2)", padding: 16, fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
        Trip recap, status and change history will live here.
      </div>
      {isAdmin && linked && <DiscoverySection truckId={truckId} providerName={providerName} />}

      <button type="button" onClick={onClose} style={{ ...SECONDARY_BTN, marginTop: 16 }}>Close</button>
    </FullscreenModal>
  );
}

/** The link beside "Open truck file": only when the company has a telematics connection. */
export function TelematicsLink({ companyId, truckId, truckName }: { companyId: string; truckId: string; truckName: string }) {
  const info = useTelematicsLink(companyId, truckId);
  const [open, setOpen] = useState(false);
  if (!info?.connected) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", padding: "10px 0 0", color: "#93c5fd", fontWeight: 800, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <ConnectIcon size={15} /> {info.providerName} ›
      </button>
      {open && <TelematicsPanel open onClose={() => setOpen(false)} providerName={info.providerName} truckId={truckId} truckName={truckName} linked={info.linked} isAdmin={info.isAdmin} />}
    </>
  );
}
