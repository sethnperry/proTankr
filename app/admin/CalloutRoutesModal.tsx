"use client";
// app/admin/CalloutRoutesModal.tsx
//
// Company Dashboard → Call-out routing. Who is emailed when a driver calls out: dispatch and the regional manager,
// by region, local area and division (DEF is a division). The most specific match wins; a row with none of the
// three is the company default. Admin only. Thin data wrapper.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { routeLabel, routeProblem, type CalloutRoute, type RouteKind } from "@/lib/callouts/callout";

const MUTE = "rgba(255,255,255,0.5)";
const HAIR = "rgba(255,255,255,0.12)";
const field: React.CSSProperties = { boxSizing: "border-box", padding: 10, fontSize: 15, color: "#fff", background: "rgba(0,0,0,0.28)", border: `1px solid ${HAIR}`, borderRadius: 0, width: "100%" };
const btn = (on?: boolean): React.CSSProperties => ({ padding: "10px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", border: `1px solid ${on ? "#fff" : "rgba(255,255,255,0.25)"}`, background: on ? "#fff" : "transparent", color: on ? "#000" : "#fff" });

export default function CalloutRoutesModal({ open, onClose, companyId }: { open: boolean; onClose: () => void; companyId: string }) {
  const [routes, setRoutes] = useState<CalloutRoute[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [kind, setKind] = useState<RouteKind>("dispatch");
  const [email, setEmail] = useState(""); const [region, setRegion] = useState(""); const [area, setArea] = useState(""); const [dept, setDept] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("callout_routes").select("route_id, kind, email, region, local_area, division").eq("company_id", companyId).order("created_at");
    if (error) setErr(error.message); else setRoutes((data ?? []) as CalloutRoute[]);
  };
  useEffect(() => { if (open && companyId) { setErr(null); void load(); } }, [open, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    const p = routeProblem(email);
    if (p) { setErr(p); return; }
    const { error } = await supabase.from("callout_routes").insert({ company_id: companyId, kind, email: email.trim(), region: region.trim() || null, local_area: area.trim() || null, division: dept.trim() || null });
    if (error) { setErr(error.message); return; }
    setEmail(""); setRegion(""); setArea(""); setDept(""); setErr(null);
    await load();
  };
  const remove = async (id: string) => { await supabase.from("callout_routes").delete().eq("route_id", id); await load(); };

  return (
    <FullscreenModal open={open} title="Call-out routing" onClose={onClose} footer={null}>
      <div style={{ fontSize: 13, color: MUTE, marginBottom: 12, lineHeight: 1.5 }}>When a driver calls out, these people are emailed. The most specific match wins (division, local area and region). A row with none of those set is the company default.</div>
      {(["dispatch", "manager"] as RouteKind[]).map((k) => (
        <div key={k} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase", color: MUTE, marginBottom: 6 }}>{k === "dispatch" ? "Dispatch" : "Regional manager"}</div>
          {routes.filter((r) => r.kind === k).map((r) => (
            <div key={r.route_id} style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${HAIR}`, background: "#0f0f10", padding: "10px 12px", marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>{r.email}</div><div style={{ fontSize: 12, color: MUTE }}>{routeLabel(r)}</div></div>
              <button type="button" style={btn()} onClick={() => void remove(r.route_id)}>Remove</button>
            </div>
          ))}
          {routes.filter((r) => r.kind === k).length === 0 && <div style={{ fontSize: 13, color: MUTE }}>None yet.</div>}
        </div>
      ))}
      <div style={{ border: `1px solid ${HAIR}`, padding: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Add an address</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button type="button" style={{ ...btn(kind === "dispatch"), flex: 1 }} onClick={() => setKind("dispatch")}>Dispatch</button>
          <button type="button" style={{ ...btn(kind === "manager"), flex: 1 }} onClick={() => setKind("manager")}>Manager</button>
        </div>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" inputMode="email" style={{ ...field, marginBottom: 8 }} />
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Region (optional)" style={field} />
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Local area (optional)" style={field} />
        </div>
        <input value={dept} onChange={(e) => setDept(e.target.value)} placeholder="Division, e.g. DEF (optional)" style={{ ...field, marginBottom: 10 }} />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{err}</div>}
        <button type="button" style={{ ...btn(true), width: "100%" }} onClick={() => void add()}>Add</button>
      </div>
    </FullscreenModal>
  );
}
