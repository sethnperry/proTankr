"use client";
import { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useUnitNotices, type UnitNotice } from "@/lib/equipment/useUnitNotices";

/** "Admin update": an admin changed equipment this driver is using. Stays until they tap Got it inside the message. */
export default function AdminNoticeBanner({ userId }: { userId: string | null }) {
  const { items, ack } = useUnitNotices(userId);
  const [open, setOpen] = useState<UnitNotice | null>(null);
  const [busy, setBusy] = useState(false);
  if (!items.length && !open) return null;
  const what = (n: UnitNotice) => `${n.unit_kind === "truck" ? "Truck" : "Trailer"} ${n.unit_name ?? ""}`.trim();
  return (
    <>
      {items.map((n) => (
        <button key={n.action_id} type="button" onClick={() => setOpen(n)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 14px", background: "#b45309", color: "#fff", border: "none", borderBottom: "1px solid rgba(255,255,255,0.25)", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.85, flexShrink: 0 }}>Admin update</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{what(n)}: {n.summary}</span>
          <span style={{ opacity: 0.8 }}>›</span>
        </button>
      ))}
      <FullscreenModal open={!!open} onClose={() => setOpen(null)} title="Admin update"
        footer={open ? (
          <button type="button" aria-busy={busy} disabled={busy}
            onClick={async () => { setBusy(true); await ack(open.action_id); setBusy(false); setOpen(null); }}
            className="w-full rounded-[2px] bg-white px-4 py-3 font-extrabold uppercase tracking-[0.06em] text-black hover:bg-white/90">
            Got it
          </button>
        ) : null}>
        {open && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{what(open)}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "4px 0 14px" }}>{new Date(open.created_at).toLocaleString()}</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>{open.actor_name ? <b>{open.actor_name}</b> : "An admin"} changed this equipment while you were using it: {open.summary}.</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 16 }}>The banner stays until you tap Got it. Close this window to keep it.</div>
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
