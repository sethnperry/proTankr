"use client";
// app/admin/TelematicsModal.tsx
//
// Company Dashboard → Telematics. Admin only. Connect the company's Geotab
// account once (database, user name, password). We match its vehicles to the
// company's trucks automatically (VIN, then unit number); anything left over is
// matched here by hand. After that odometer and position fill in for drivers.
// Use a dedicated read-only Geotab user: the password is stored encrypted.

import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 };
const label: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 4px" };
const input: React.CSSProperties = { width: "100%", padding: "10px 12px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, boxSizing: "border-box" };
const btn: React.CSSProperties = { padding: "11px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer" };
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };

type Summary = {
  connected: boolean;
  database_name?: string; user_name?: string; status?: string; last_error?: string | null; last_ok_at?: string | null;
  matched?: { vehicleId: string; vehicleName: string | null; truckId: string; truckName: string; by: string }[];
  unmatchedTrucks?: { truckId: string; truckName: string }[];
  unmatchedVehicles?: { id: string; name: string }[];
  trailersLinked?: number;
  unmatchedTrailers?: { id: string; name: string }[];
  unmatchedOurTrailers?: { trailerId: string; name: string }[];
  driversLinked?: number;
  unmatchedDrivers?: { id: string; name: string }[];
  unmatchedMembers?: { userId: string; name: string }[];
};

async function call(method: string, companyId: string, body?: unknown): Promise<{ ok: boolean; data: any }> {
  const { data: s } = await supabase.auth.getSession();
  const token = s.session?.access_token ?? "";
  const url = `/api/telematics/connect${method === "GET" ? `?companyId=${encodeURIComponent(companyId)}` : ""}`;
  const r = await fetch(url, {
    method, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(method === "GET" ? {} : { "Content-Type": "application/json" }) },
    body: method === "GET" ? undefined : JSON.stringify({ companyId, ...(body as object) }),
  });
  return { ok: r.ok, data: await r.json().catch(() => ({})) };
}

export default function TelematicsModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [sum, setSum] = useState<Summary | null>(null);
  const [db, setDb] = useState(""); const [user, setUser] = useState(""); const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await call("GET", companyId);
    if (r.ok) setSum(r.data as Summary); else setErr(r.data?.error ?? "Couldn't load.");
  }, [companyId]);
  useEffect(() => { if (open) { setErr(null); void load(); } }, [open, load]);

  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } finally { setBusy(false); } };
  const connect = () => run(async () => {
    const r = await call("POST", companyId, { database: db.trim(), userName: user.trim(), password: pw });
    if (!r.ok) return setErr(r.data?.error ?? "Couldn't connect.");
    setSum(r.data); setPw("");
  });
  const assign = (vehicleId: string, vehicleName: string) => run(async () => {
    const truckId = pick[vehicleId];
    if (!truckId) return;
    const r = await call("POST", companyId, { map: [{ vehicleId, vehicleName, truckId }] });
    if (!r.ok) return setErr(r.data?.error ?? "Couldn't save.");
    setSum(r.data);
  });
  const assignTrailer = (providerTrailerId: string, name: string) => run(async () => {
    const trailerId = pick[`t:${providerTrailerId}`];
    if (!trailerId) return;
    const r = await call("POST", companyId, { trailerMap: [{ providerTrailerId, name, trailerId }] });
    if (!r.ok) return setErr(r.data?.error ?? "Couldn't save.");
    setSum(r.data);
  });
  const assignDriver = (driverId: string, driverName: string) => run(async () => {
    const userId = pick[`d:${driverId}`];
    if (!userId) return;
    const r = await call("POST", companyId, { driverMap: [{ driverId, driverName, userId }] });
    if (!r.ok) return setErr(r.data?.error ?? "Couldn't save.");
    setSum(r.data);
  });
  const disconnect = () => run(async () => {
    if (!window.confirm("Disconnect Geotab? Odometer and position stop filling in.")) return;
    await call("DELETE", companyId);
    setSum({ connected: false });
  });

  return (
    <FullscreenModal open={open} title="Telematics" onClose={onClose}>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 10 }}>{err}</div>}

      {!sum?.connected ? (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Connect Geotab</div>
          <div style={{ fontSize: 13, color: muted, marginTop: 4, lineHeight: 1.5 }}>
            Once, for the whole company. Drivers set up nothing. In MyGeotab, create a user with read-only access to your vehicles and use its sign-in here.
          </div>
          <div style={label}>Database</div>
          <input style={input} value={db} onChange={(e) => setDb(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <div style={label}>User name</div>
          <input style={input} value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoCorrect="off" />
          <div style={label}>Password</div>
          <input style={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" />
          <button type="button" style={{ ...btn, width: "100%", marginTop: 14, opacity: busy || !db || !user || !pw ? 0.5 : 1 }} disabled={busy || !db || !user || !pw} aria-busy={busy} onClick={() => void connect()}>
            Connect
          </button>
        </div>
      ) : (
        <>
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>Geotab · {sum.database_name}</div>
              <button type="button" style={link} onClick={() => void disconnect()}>Disconnect</button>
            </div>
            <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
              {sum.matched?.length ?? 0} truck{(sum.matched?.length ?? 0) === 1 ? "" : "s"} linked
              {sum.last_ok_at ? ` · last reading ${new Date(sum.last_ok_at).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}
            </div>
            {sum.last_error && <div style={{ fontSize: 13, color: "#fbbf24", marginTop: 6 }}>Last problem: {sum.last_error}</div>}
          </div>

          {(sum.unmatchedVehicles?.length ?? 0) > 0 && (sum.unmatchedTrucks?.length ?? 0) > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Match by hand</div>
              <div style={{ fontSize: 12, color: muted, marginBottom: 8 }}>These Geotab vehicles didn't match a truck by VIN or unit number.</div>
              {sum.unmatchedVehicles!.map((v) => (
                <div key={v.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                  <select style={{ ...input, flex: 1, padding: "8px 8px", fontSize: 14 }} value={pick[v.id] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [v.id]: e.target.value }))}>
                    <option value="">Truck…</option>
                    {sum.unmatchedTrucks!.map((t) => <option key={t.truckId} value={t.truckId}>{t.truckName}</option>)}
                  </select>
                  <button type="button" style={{ ...btn, padding: "9px 12px", opacity: pick[v.id] ? 1 : 0.4 }} disabled={busy || !pick[v.id]} onClick={() => void assign(v.id, v.name)}>Link</button>
                </div>
              ))}
            </div>
          )}

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Trailers · hookup detection</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.5 }}>
              {sum.trailersLinked ?? 0} trailer{(sum.trailersLinked ?? 0) === 1 ? "" : "s"} linked by unit number. Drivers are told when Geotab shows a different trailer hooked up than the one they selected.
              Needs Geotab trailer tracking; without it nothing shows.
            </div>
            {(sum.unmatchedTrailers?.length ?? 0) > 0 && (sum.unmatchedOurTrailers?.length ?? 0) > 0 && (
              <div style={{ marginTop: 10 }}>
                {sum.unmatchedTrailers!.map((t) => (
                  <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                    <select style={{ ...input, flex: 1, padding: "8px 8px", fontSize: 14 }} value={pick[`t:${t.id}`] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [`t:${t.id}`]: e.target.value }))}>
                      <option value="">Trailer…</option>
                      {sum.unmatchedOurTrailers!.map((m) => <option key={m.trailerId} value={m.trailerId}>{m.name}</option>)}
                    </select>
                    <button type="button" style={{ ...btn, padding: "9px 12px", opacity: pick[`t:${t.id}`] ? 1 : 0.4 }} disabled={busy || !pick[`t:${t.id}`]} onClick={() => void assignTrailer(t.id, t.name)}>Link</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 800 }}>Drivers · hours of service</div>
            <div style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.5 }}>
              {sum.driversLinked ?? 0} driver{(sum.driversLinked ?? 0) === 1 ? "" : "s"} linked (by employee number, sign-in email or name).
              Dispatch sees each one's drive and window time left. Needs Geotab Drive / HOS on for the driver.
            </div>
            {(sum.unmatchedDrivers?.length ?? 0) > 0 && (sum.unmatchedMembers?.length ?? 0) > 0 && (
              <div style={{ marginTop: 10 }}>
                {sum.unmatchedDrivers!.map((d) => (
                  <div key={d.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                    <select style={{ ...input, flex: 1, padding: "8px 8px", fontSize: 14 }} value={pick[`d:${d.id}`] ?? ""} onChange={(e) => setPick((p) => ({ ...p, [`d:${d.id}`]: e.target.value }))}>
                      <option value="">Driver…</option>
                      {sum.unmatchedMembers!.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
                    </select>
                    <button type="button" style={{ ...btn, padding: "9px 12px", opacity: pick[`d:${d.id}`] ? 1 : 0.4 }} disabled={busy || !pick[`d:${d.id}`]} onClick={() => void assignDriver(d.id, d.name)}>Link</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(sum.matched?.length ?? 0) > 0 && (
            <div style={card}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>Linked trucks</div>
              {sum.matched!.map((m) => (
                <div key={m.vehicleId} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, padding: "4px 0" }}>
                  <span>{m.truckName}</span>
                  <span style={{ color: muted }}>{m.vehicleName} · by {m.by}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </FullscreenModal>
  );
}
