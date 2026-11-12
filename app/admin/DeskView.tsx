"use client";
// app/admin/DeskView.tsx
//
// The Desk: see and solve problems without calling the driver. The inbox groups open error entries by kind and
// driver, newest first, with how old each is; a stuck-sync list shows the phones that can't send; tapping a driver
// opens their timeline. Resolve and retry only show for people who may (the role gate lives in lib/desk/desk.ts).
// Presentational: no Supabase import, so it renders outside a browser.

import React, { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { SectionLabel, useDashLook } from "@/app/planner/home/dashLook";
import { EXPIRY_COLOR } from "@/lib/expiry";
import type { InboxGroup, InboxItem, StuckRow, TimelineEntry } from "@/lib/desk/desk";

export type DeskViewProps = {
  groups: InboxGroup[];
  stuck: StuckRow[];
  canResolve: boolean;
  canUseAs: boolean;
  /** Shown beside entries when the Desk spans companies. */
  companyName?: (id: string | null) => string | null;
  loading?: boolean;
  error?: string | null;
  onResolve: (ids: string[]) => Promise<string | null>;
  onRetry: (item: InboxItem) => Promise<string | null>;
  onNudge: (userId: string) => Promise<string | null>;
  onUseAs: (userId: string, name: string) => void;
  loadTimeline: (userId: string) => Promise<TimelineEntry[]>;
};

const SOURCE_TAG: Record<string, string> = { geotab: "Geotab", app: "App", manual: "Manual" };
const stamp = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function DeskView(p: DeskViewProps) {
  const L = useDashLook();
  const [timelineFor, setTimelineFor] = useState<{ userId: string; name: string } | null>(null);
  const [entries, setEntries] = useState<TimelineEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const openTimeline = async (userId: string, name: string) => {
    setTimelineFor({ userId, name }); setEntries(null);
    setEntries(await p.loadTimeline(userId));
  };
  const act = async (key: string, fn: () => Promise<string | null>) => { setBusy(key); setNote(null); const err = await fn(); setBusy(null); if (err) setNote(err); };
  const btn: React.CSSProperties = { border: `1px solid ${L.hairline}`, background: "transparent", color: "#fff", padding: "7px 10px", fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" };
  const total = p.groups.reduce((t, g) => t + g.count, 0);

  return (
    <div>
      {p.error && <div style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>{p.error}</div>}
      {note && <div style={{ color: "#fbbf24", fontSize: 13, marginBottom: 8 }}>{note}</div>}

      <SectionLabel first>Inbox · {total} open</SectionLabel>
      {p.groups.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>{p.loading ? "Loading…" : "Nothing is broken right now."}</div>}
      {p.groups.map((g) => (
        <div key={g.kind} style={{ ...L.secondary, padding: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <b style={{ fontSize: 14 }}>{g.label} <span style={{ color: EXPIRY_COLOR.expiring }}>{g.count}</span></b>
            {p.canResolve && g.count > 1 && <button type="button" style={btn} disabled={busy === g.kind} onClick={() => void act(g.kind, () => p.onResolve(g.drivers.flatMap((d) => d.items.map((i) => i.id))))}>Dismiss all</button>}
          </div>
          {g.drivers.map((d) => (
            <div key={d.userId ?? "company"} style={{ borderTop: `1px solid ${L.hairline}`, padding: "8px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                {d.userId
                  ? <button type="button" onClick={() => void openTimeline(d.userId as string, d.name)} className="dash-press" style={{ background: "none", border: "none", color: "#fff", fontWeight: 800, fontSize: 14, padding: 0, cursor: "pointer", textAlign: "left" }}>{d.name} ›</button>
                  : <b style={{ fontSize: 14 }}>{d.name}</b>}
                {p.canUseAs && d.userId && <button type="button" style={btn} onClick={() => p.onUseAs(d.userId as string, d.name)}>Use app as</button>}
              </div>
              {d.items.map((i) => (
                <div key={i.id} style={{ marginTop: 6, fontSize: 13 }}>
                  <div>{i.message}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    <span style={{ color: L.muted, fontSize: 12 }}>{i.age} ago{p.companyName && p.companyName(i.companyId) ? ` · ${p.companyName(i.companyId)}` : ""}</span>
                    {p.canResolve && i.retry && <button type="button" style={btn} disabled={busy === i.id} onClick={() => void act(i.id, () => p.onRetry(i))}>{busy === i.id ? "Sending…" : i.retry.type === "sync" ? "Ask phone to sync" : "Retry"}</button>}
                    {p.canResolve && <button type="button" style={btn} disabled={busy === i.id} onClick={() => void act(i.id, () => p.onResolve([i.id]))}>Dismiss</button>}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      <SectionLabel>Stuck syncs · {p.stuck.length}</SectionLabel>
      {p.stuck.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>No phone has unsent work.</div>}
      {p.stuck.map((s) => (
        <div key={s.errorId} style={{ ...L.secondary, padding: "12px 14px", marginBottom: 6 }}>
          <button type="button" onClick={() => void openTimeline(s.userId, s.name)} className="dash-press"
            style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, color: "#fff", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 14 }}><span>{s.name}</span><span style={{ color: s.failed ? EXPIRY_COLOR.expired : EXPIRY_COLOR.expiring }}>{s.count} unsent</span></div>
            <div style={{ color: L.muted, fontSize: 12, marginTop: 2 }}>Oldest {s.oldestAge}{s.tables.length ? ` · ${s.tables.join(", ")}` : ""}{s.failed ? ` · ${s.failed} rejected by the server` : ""}</div>
            {s.lastError && <div style={{ color: "#f87171", fontSize: 12, marginTop: 2 }}>{s.lastError}</div>}
          </button>
          {p.canResolve && <div style={{ marginTop: 8 }}><button type="button" style={btn} disabled={busy === s.errorId} onClick={() => void act(s.errorId, () => p.onNudge(s.userId))}>{busy === s.errorId ? "Asking…" : "Ask phone to sync"}</button></div>}
        </div>
      ))}

      <FullscreenModal open={!!timelineFor} title={timelineFor ? `${timelineFor.name} · last 14 days` : ""} onClose={() => setTimelineFor(null)} footer={null}>
        {entries == null && <div style={{ color: L.muted, fontSize: 14 }}>Loading…</div>}
        {entries?.length === 0 && <div style={{ color: L.muted, fontSize: 14 }}>Nothing recorded.</div>}
        {entries?.map((e) => (
          <div key={e.key} style={{ display: "grid", gridTemplateColumns: "92px 1fr auto", gap: 8, padding: "8px 0", borderTop: `1px solid ${L.hairline}`, fontSize: 13, alignItems: "baseline" }}>
            <span style={{ color: L.muted, fontSize: 12 }}>{stamp(e.at)}</span>
            <span><b>{e.title}</b>{e.detail ? <span style={{ color: L.muted }}> · {e.detail}</span> : null}</span>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: e.source === "geotab" ? "#60a5fa" : e.source === "manual" ? "#fbbf24" : L.muted }}>{SOURCE_TAG[e.source]}</span>
          </div>
        ))}
      </FullscreenModal>
    </div>
  );
}
