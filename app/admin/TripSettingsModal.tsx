"use client";
// app/admin/TripSettingsModal.tsx
//
// Company trip settings (docs/trip-workflow-design.md §5, §8): the Begin-time
// offset, the two delay thresholds, what Finish Delivery requires, and the
// loading/delivery delay reason lists.
//
// RLS splits it: settings are admin-only (trip_settings_admin_*), the reason
// lists are staff (admin/lead/dispatch). Reasons are never deleted, only
// hidden, so past trips keep their label.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { DEFAULT_TRIP_SETTINGS, deliveryOffset, loadingOffset, type DelayReason, type TripSettings } from "@/lib/trips/useTripData";
import { TERMINAL_ISSUES } from "@/lib/trips/terminalIssues";

const muted = "rgba(255,255,255,0.5)";
const card: React.CSSProperties = { borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)", padding: 14, marginBottom: 14 };
const title: React.CSSProperties = { fontSize: 13, fontWeight: 800, marginBottom: 10, color: "#fff" };
const input: React.CSSProperties = {
  width: 80, padding: "8px 10px", borderRadius: 2, border: "1px solid rgba(255,255,255,0.15)",
  background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 16, textAlign: "right",
};
const textInput: React.CSSProperties = { ...input, width: "100%", textAlign: "left" };
const btn: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 2, border: "none", background: "#fff", color: "#000", fontWeight: 800, fontSize: 14, cursor: "pointer",
};
const link: React.CSSProperties = { border: "none", background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 };

function NumRow({ label, help, value, onChange, disabled }: {
  label: string; help: string; value: number; onChange: (n: number) => void; disabled: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{label}</div>
        <div style={{ fontSize: 12, color: muted }}>{help}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <input type="number" inputMode="numeric" value={value} disabled={disabled}
          onChange={(e) => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))} style={{ ...input, opacity: disabled ? 0.5 : 1 }} />
        <span style={{ fontSize: 13, color: muted }}>min</span>
      </div>
    </div>
  );
}

function CheckRow({ label, help, value, onChange, disabled }: {
  label: string; help: string; value: boolean; onChange: (v: boolean) => void; disabled: boolean;
}) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, cursor: disabled ? "default" : "pointer" }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{label}</div>
        <div style={{ fontSize: 12, color: muted }}>{help}</div>
      </div>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(e) => onChange(e.target.checked)} style={{ width: 22, height: 22 }} />
    </label>
  );
}

export default function TripSettingsModal({ open, onClose, companyId, isAdmin }: {
  open: boolean; onClose: () => void; companyId: string; isAdmin: boolean;
}) {
  const [settings, setSettings] = useState<TripSettings>(DEFAULT_TRIP_SETTINGS);
  const [reasons, setReasons] = useState<DelayReason[]>([]);
  const [newLabel, setNewLabel] = useState<{ loading: string; delivery: string }>({ loading: "", delivery: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = async () => {
    const [s, r] = await Promise.all([
      supabase.from("trip_settings").select("*").eq("company_id", companyId).maybeSingle(),
      supabase.from("delay_reasons").select("reason_id,kind,label,sort_order,is_active").eq("company_id", companyId).order("sort_order").order("label"),
    ]);
    setSettings({ ...DEFAULT_TRIP_SETTINGS, ...((s.data as Partial<TripSettings>) ?? {}) });
    setReasons((r.data ?? []) as DelayReason[]);
  };

  useEffect(() => {
    if (!open || !companyId) return;
    setMsg(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId]);

  const saveSettings = async () => {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from("trip_settings").upsert({
      company_id: companyId,
      begin_offset_minutes: Math.min(240, loadingOffset(settings)),
      loading_begin_offset_minutes: Math.min(240, loadingOffset(settings)),
      delivery_begin_offset_minutes: Math.min(240, deliveryOffset(settings)),
      loading_delay_threshold_minutes: Math.min(1440, settings.loading_delay_threshold_minutes),
      delivery_delay_threshold_minutes: Math.min(1440, settings.delivery_delay_threshold_minutes),
      require_consignee_signature: settings.require_consignee_signature,
      require_tank_readings: settings.require_tank_readings,
      max_shift_hours: Math.min(24, Math.max(1, settings.max_shift_hours ?? 12)),
      gauging_cutoff: (settings.gauging_cutoff ?? "23:30").slice(0, 5),
      gauging_minutes: Math.min(600, Math.max(0, settings.gauging_minutes ?? 30)),
      auto_stamp_arrival: settings.auto_stamp_arrival !== false,
      delivery_prep_minutes: Math.min(120, Math.max(0, settings.delivery_prep_minutes ?? 15)),
      pump_gal_per_min: Math.min(2000, Math.max(20, settings.pump_gal_per_min ?? 450)),
      unaccounted_grace_minutes: Math.min(120, Math.max(0, settings.unaccounted_grace_minutes ?? 10)),
    }, { onConflict: "company_id" }).select("company_id");
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
  };

  const addReason = async (kind: "loading" | "delivery") => {
    const label = newLabel[kind].trim();
    if (!label) return;
    const sort = reasons.filter((r) => r.kind === kind).reduce((m, r) => Math.max(m, r.sort_order), 0) + 1;
    const { error } = await supabase.from("delay_reasons").insert({ company_id: companyId, kind, label, sort_order: sort });
    if (error) return setMsg({ ok: false, text: error.message });
    setNewLabel((n) => ({ ...n, [kind]: "" }));
    await load();
  };

  const setActive = async (r: DelayReason, active: boolean) => {
    const { error } = await supabase.from("delay_reasons").update({ is_active: active }).eq("reason_id", r.reason_id);
    if (error) return setMsg({ ok: false, text: error.message });
    await load();
  };

  const reasonList = (kind: "loading" | "delivery") => {
    const list = reasons.filter((r) => r.kind === kind);
    return (
      <div style={card}>
        <div style={title}>{kind === "loading" ? "Loading delay reasons" : "Delivery delay reasons"}</div>
        {list.length === 0 && <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>None yet. Drivers can still type a note.</div>}
        {list.map((r) => (
          <div key={r.reason_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", opacity: r.is_active ? 1 : 0.45 }}>
            <span style={{ fontSize: 15, color: "#fff" }}>{r.label}</span>
            <button type="button" onClick={() => void setActive(r, !r.is_active)} style={link}>{r.is_active ? "Hide" : "Show"}</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input value={newLabel[kind]} onChange={(e) => setNewLabel((n) => ({ ...n, [kind]: e.target.value }))}
            placeholder={kind === "loading" ? "e.g. Waiting at rack" : "e.g. Customer not ready"} style={textInput} />
          <button type="button" onClick={() => void addReason(kind)} style={btn}>Add</button>
        </div>
      </div>
    );
  };

  return (
    <FullscreenModal open={open} title="Trip Settings" onClose={onClose}>
      <div style={card}>
        <div style={title}>Times</div>
        {!isAdmin && <div style={{ fontSize: 12, color: muted, marginBottom: 10 }}>Only an admin can change these.</div>}
        <NumRow label="Loading time" help="If the driver didn't tap Begin Loading, Begin loading is prefilled this long before they finish."
          value={loadingOffset(settings)} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, loading_begin_offset_minutes: n }))} />
        <NumRow label="Delivery time" help="Begin delivering is prefilled this long before the driver taps Finish Delivery."
          value={deliveryOffset(settings)} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, delivery_begin_offset_minutes: n }))} />
        <NumRow label="Loading delay" help="Arrive → Begin loading longer than this asks for a reason."
          value={settings.loading_delay_threshold_minutes} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, loading_delay_threshold_minutes: n }))} />
        <NumRow label="Delivery delay" help="Arrive → Begin delivering longer than this asks for a reason."
          value={settings.delivery_delay_threshold_minutes} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, delivery_delay_threshold_minutes: n }))} />
      </div>
      <div style={card}>
        <div style={title}>Drop timing</div>
        <NumRow label="Time before the drop (min)" help="After the driver taps Arrive, this much time is allowed before the drop starts: get out, walk, gauge."
          value={settings.delivery_prep_minutes ?? 15} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, delivery_prep_minutes: n }))} />
        <NumRow label="Pump rate (gal/min)" help="Used to estimate how long a drop takes. Finishing later than the estimate asks about a delay."
          value={settings.pump_gal_per_min ?? 450} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, pump_gal_per_min: n }))} />
        <NumRow label="Grace (min)" help="Time over the estimate that isn't questioned. Past this, the driver says whether there was a delay."
          value={settings.unaccounted_grace_minutes ?? 10} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, unaccounted_grace_minutes: n }))} />
      </div>
      <div style={card}>
        <div style={title}>Dispatch timeline</div>
        <NumRow label="Max shift (hours)" help="Dispatch flags a planned day that runs longer than this."
          value={settings.max_shift_hours ?? 12} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, max_shift_hours: n }))} />
        <NumRow label="Gauging length (min)" help="Terminals can't load while they gauge, usually around midnight."
          value={settings.gauging_minutes ?? 30} disabled={!isAdmin} onChange={(n) => setSettings((s) => ({ ...s, gauging_minutes: n }))} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
          <div>
            <div style={{ fontSize: 15, color: "#fff" }}>Gauging time</div>
            <div style={{ fontSize: 12, color: muted }}>Terminal local time. Midnight at most terminals.</div>
          </div>
          <input type="time" disabled={!isAdmin} value={(settings.gauging_cutoff ?? "23:30").slice(0, 5)}
            onChange={(e) => setSettings((s) => ({ ...s, gauging_cutoff: e.target.value || "23:30" }))} style={{ ...input, width: 120, textAlign: "left" }} />
        </div>
      </div>
      <div style={card}>
        <div style={title}>Truck position</div>
        <CheckRow label="Stamp arrival and departure from the truck" help="Needs the Geotab link. Arrival is stamped for the driver once the truck has stopped at a stop whose location the app has learned; departure defaults to when the truck really left. Drivers can always correct a time."
          value={settings.auto_stamp_arrival !== false} disabled={!isAdmin} onChange={(v) => setSettings((s) => ({ ...s, auto_stamp_arrival: v }))} />
      </div>
      <div style={card}>
        <div style={title}>Finish Delivery requires</div>
        <CheckRow label="Consignee signature" help="Printed name and signature from the customer."
          value={settings.require_consignee_signature} disabled={!isAdmin} onChange={(v) => setSettings((s) => ({ ...s, require_consignee_signature: v }))} />
        <CheckRow label="Tank readings" help="Before and after readings for every tank of each product delivered."
          value={settings.require_tank_readings} disabled={!isAdmin} onChange={(v) => setSettings((s) => ({ ...s, require_tank_readings: v }))} />
        {isAdmin && <button aria-busy={!!(busy)} type="button" onClick={saveSettings} disabled={busy} style={{ ...btn, width: "100%", opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Save settings"}</button>}
      </div>
      {msg && <div style={{ color: msg.ok ? "#4ade80" : "#f87171", fontSize: 14, marginBottom: 12 }}>{msg.text}</div>}
      <div style={card}>
        <div style={title}>Terminal issues (built in)</div>
        <div style={{ fontSize: 13, color: muted }}>
          {TERMINAL_ISSUES.map((t) => t.label).join(", ")}. Drivers pick these when a rack is slow or they can&apos;t load.
          They show on the PTD with the times, and warn other drivers headed to that terminal. Out of Allocation only
          warns your own drivers.
        </div>
      </div>
      {reasonList("loading")}
      {reasonList("delivery")}
    </FullscreenModal>
  );
}
