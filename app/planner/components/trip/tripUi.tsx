"use client";
// app/planner/components/trip/tripUi.tsx
//
// Shared pieces for the trip screens (Loaded, Finish Delivery): styles, the
// three-times editor with a delay reason, and signatures.

import React, { useEffect, useRef, useState } from "react";
import { delayMinutes, needsDelayReason, type StepTimes } from "@/lib/trips/tripFlow";
import type { DelayReason } from "@/lib/trips/useTripData";
import { TERMINAL_ISSUES, issueChoiceValue } from "@/lib/trips/terminalIssues";

export const muted = "rgba(255,255,255,0.5)";

export const fieldLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6,
};
export const fieldInput: React.CSSProperties = {
  width: "100%", borderRadius: 2, border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.04)", padding: "11px 12px", fontSize: 16,
  color: "#fff", boxSizing: "border-box", colorScheme: "dark",
};
export const smallInput: React.CSSProperties = { ...fieldInput, padding: "9px 8px", fontSize: 15 };
export const sectionCard: React.CSSProperties = {
  borderRadius: 2, border: "1px solid rgba(255,255,255,0.10)", background: "rgba(255,255,255,0.03)",
  padding: 12, marginBottom: 14,
};
export const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 800, marginBottom: 10 };
export const primaryBtn: React.CSSProperties = {
  width: "100%", padding: "16px 0", borderRadius: 2, border: "none",
  background: "#fff", color: "#000", fontSize: 16, fontWeight: 800, cursor: "pointer",
  letterSpacing: "0.06em", textTransform: "uppercase",
};
export const linkBtn: React.CSSProperties = {
  border: "none", background: "transparent", color: "rgba(255,255,255,0.75)",
  fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0,
};
export const dashedBtn: React.CSSProperties = {
  width: "100%", padding: "10px 0", borderRadius: 2, border: "1px dashed rgba(255,255,255,0.25)",
  background: "transparent", color: "rgba(255,255,255,0.75)", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

// ISO ↔ <input type="datetime-local"> (device local time).
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(v: string): string {
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function TimesEditor({ times, onChange, beginLabel }: {
  times: StepTimes; onChange: (t: StepTimes) => void; beginLabel: string;
}) {
  const row = (label: string, key: keyof StepTimes) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ width: 92, fontSize: 13, color: muted }}>{label}</span>
      <input type="datetime-local" value={toLocalInput(times[key])}
        onChange={(e) => onChange({ ...times, [key]: fromLocalInput(e.target.value) })}
        style={{ ...smallInput, flex: 1 }} />
    </div>
  );
  return (
    <>
      {row("Arrive", "arrivedAt")}
      {row(beginLabel, "beginAt")}
      {row("Depart", "leftAt")}
    </>
  );
}

// Delay line + required reason when over the company threshold (§5).
export function DelayReasonField({ times, threshold, reasons, kind, reasonId, note, onChange }: {
  times: StepTimes;
  threshold: number;
  reasons: DelayReason[];
  kind: "loading" | "delivery";
  reasonId: string | null;
  note: string;
  onChange: (reasonId: string | null, note: string) => void;
}) {
  const mins = delayMinutes(times.arrivedAt, times.beginAt);
  const need = needsDelayReason(mins, threshold);
  const opts = reasons.filter((r) => r.kind === kind && r.is_active);
  // Loading delays lead with the shared terminal issues (they also warn other
  // drivers); the company's own reasons follow.
  const issues = kind === "loading" ? TERMINAL_ISSUES : [];
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 13, color: need ? "#fbbf24" : muted }}>
        {kind === "loading" ? "Loading" : "Delivery"} delay: {mins == null ? "—" : `${mins} min`}
        {need ? ` (over ${threshold} min, reason required)` : ""}
      </div>
      {need && (
        <div style={{ marginTop: 8 }}>
          <select value={reasonId ?? "__other__"} onChange={(e) => onChange(e.target.value === "__other__" ? null : e.target.value, note)}
            style={{ ...fieldInput, marginBottom: 8 }}>
            {issues.map((t) => <option key={t.code} value={issueChoiceValue(t.code)}>{t.label}</option>)}
            {opts.map((r) => <option key={r.reason_id} value={r.reason_id}>{r.label}</option>)}
            <option value="__other__">Other</option>
          </select>
          {reasonId == null && (
            <input value={note} onChange={(e) => onChange(null, e.target.value)} placeholder="What held you up?" style={fieldInput} />
          )}
        </div>
      )}
    </div>
  );
}

// True when the delay reason is satisfied.
export function delayReasonOk(times: StepTimes, threshold: number, reasonId: string | null, note: string): boolean {
  if (!needsDelayReason(delayMinutes(times.arrivedAt, times.beginAt), threshold)) return true;
  return !!reasonId || note.trim().length > 0;
}

// ── Signatures (§8) ─────────────────────────────────────────────────────────
// Stored as SVG path data in a 300 × 100 box.

const SIG_W = 300, SIG_H = 100;

export function SignatureView({ path, height = 60 }: { path: string; height?: number }) {
  return (
    <svg viewBox={`0 0 ${SIG_W} ${SIG_H}`} style={{ width: "100%", height, display: "block" }} preserveAspectRatio="xMidYMid meet">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// `fill`: as big as the screen allows at the signature's 3:1 shape (the
// consignee pop-out in landscape). Same shape as always, so the saved
// signature isn't stretched.
export function SignaturePad({ onChange, fill, initial }: { onChange: (path: string | null) => void; fill?: boolean; initial?: string | null }) {
  const ref = useRef<SVGSVGElement | null>(null);
  const [path, setPath] = useState(initial ?? "");
  const drawing = useRef(false);
  const pathRef = useRef(initial ?? "");

  const point = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * SIG_W;
    const y = ((e.clientY - r.top) / r.height) * SIG_H;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const set = (p: string) => {
    pathRef.current = p;
    setPath(p);
  };

  useEffect(() => onChange(path.length > 20 ? path : null), [path, onChange]);

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${SIG_W} ${SIG_H}`}
        style={fill
          ? { width: "min(100%, calc((100dvh - 130px) * 3))", aspectRatio: "3 / 1", height: "auto", margin: "0 auto", background: "#fff", borderRadius: 2, touchAction: "none", display: "block", color: "#000" }
          : { width: "100%", height: 120, background: "#fff", borderRadius: 2, touchAction: "none", display: "block", color: "#000" }}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drawing.current = true;
          set(`${pathRef.current} M ${point(e)}`.trim());
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          set(`${pathRef.current} L ${point(e)}`);
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
      >
        <path d={path} fill="none" stroke="#000" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <button type="button" onClick={() => set("")} style={{ ...linkBtn, marginTop: 6 }}>Clear</button>
    </div>
  );
}

// Driver signature: draw it once, then a tap to accept on every load.
export function SignatureAccept({ savedPath, onSave, accepted, onAccept, who }: {
  savedPath: string | null;
  onSave: (path: string) => Promise<void>;
  accepted: boolean;
  onAccept: (v: boolean) => void;
  who: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [redraw, setRedraw] = useState(false);
  const onDraft = React.useCallback((p: string | null) => setDraft(p), []);

  if (!savedPath || redraw) {
    return (
      <div>
        <div style={{ fontSize: 13, color: muted, marginBottom: 8 }}>{savedPath ? "Draw your new signature. It replaces the saved one on your future loads." : "Draw your signature once. After this it's a tap to accept."}</div>
        <SignaturePad onChange={onDraft} />
        {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}
        {savedPath && redraw && (
          <button type="button" onClick={() => { setRedraw(false); setDraft(null); setErr(null); }} style={{ ...linkBtn, marginTop: 8, color: muted }}>Keep my current signature</button>
        )}
        <button type="button" disabled={!draft}
          onClick={async () => {
            if (!draft) return;
            setErr(null);
            try {
              await onSave(draft);
              setRedraw(false);
              onAccept(true);
            } catch (e: any) {
              setErr(e?.message ?? "Couldn't save the signature.");
            }
          }}
          style={{ ...primaryBtn, marginTop: 8, padding: "12px 0", fontSize: 15, opacity: draft ? 1 : 0.5 }}>
          Save Signature
        </button>
      </div>
    );
  }
  return (
    <div>
      <div style={{ position: "relative", color: "#fff", background: "rgba(255,255,255,0.06)", borderRadius: 2, padding: 6 }}>
        <SignatureView path={savedPath} />
        <button type="button" onClick={() => setRedraw(true)} aria-label="Edit your signature"
          style={{ position: "absolute", top: 6, right: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 2, cursor: "pointer" }}>
          Edit
        </button>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, fontSize: 15, cursor: "pointer" }}>
        <input type="checkbox" checked={accepted} onChange={(e) => onAccept(e.target.checked)} style={{ width: 22, height: 22 }} />
        I accept this as {who}
      </label>
    </div>
  );
}
