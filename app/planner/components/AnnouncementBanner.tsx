"use client";
import { useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useAnnouncements, type Announcement } from "@/lib/announcements/useAnnouncements";

/** "Hey ProTankr": the subject is the banner; tap it to read the message; it stays until cleared from inside the message. */
export default function AnnouncementBanner({ userId }: { userId: string | null }) {
  const { items, clear } = useAnnouncements(userId);
  const [open, setOpen] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);
  if (!items.length && !open) return null;
  return (
    <>
      {items.map((a) => (
        <button key={a.id} type="button" onClick={() => setOpen(a)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 14px", background: "#1d4ed8", color: "#fff", border: "none", borderBottom: "1px solid rgba(255,255,255,0.25)", cursor: "pointer", flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", opacity: 0.8, flexShrink: 0 }}>Hey ProTankr</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.subject}</span>
          <span style={{ opacity: 0.8 }}>›</span>
        </button>
      ))}
      <FullscreenModal open={!!open} onClose={() => setOpen(null)} title="Hey ProTankr"
        footer={open ? (
          <button type="button" aria-busy={busy} disabled={busy}
            onClick={async () => { setBusy(true); await clear(open.id); setBusy(false); setOpen(null); }}
            className="w-full rounded-[2px] bg-white px-4 py-3 font-extrabold uppercase tracking-[0.06em] text-black hover:bg-white/90">
            Clear banner
          </button>
        ) : null}>
        {open && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{open.subject}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 14 }}>{new Date(open.created_at).toLocaleString()}</div>
            <div style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{open.body || "(No more details.)"}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 18 }}>The banner stays until you clear it. Close this window to keep it.</div>
          </div>
        )}
      </FullscreenModal>
    </>
  );
}
