"use client";
// app/planner/dispatch/TerminalPickModal.tsx
//
// "Pick a new terminal" fix on a planned trip: search by name or city.
import { useMemo, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { useDashLook } from "../home/dashLook";
import { fieldInput } from "../components/trip/tripUi";

type Term = { terminal_id: string | number; terminal_name: string | null; city: string | null; state: string | null };

export function TerminalPickModal({ open, terminals, onPick, onClose }: { open: boolean; terminals: Term[]; onPick: (terminalId: string) => void; onClose: () => void }) {
  const L = useDashLook();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    return terminals.filter((t) => !s || `${t.terminal_name ?? ""} ${t.city ?? ""} ${t.state ?? ""}`.toLowerCase().includes(s)).slice(0, 40);
  }, [terminals, q]);
  return (
    <FullscreenModal open={open} title="Pick a new terminal" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terminal or city" autoFocus style={{ ...fieldInput, marginBottom: 10 }} />
      {hits.map((t) => (
        <button key={String(t.terminal_id)} type="button" className="dash-press" onClick={() => { setQ(""); onPick(String(t.terminal_id)); }}
          style={{ ...L.secondary, display: "flex", width: "100%", textAlign: "left", color: "#fff", padding: "11px 12px", marginBottom: 6, cursor: "pointer", fontSize: 14, justifyContent: "space-between", gap: 8 }}>
          <span>{t.terminal_name}</span><span style={{ color: L.muted }}>{[t.city, t.state].filter(Boolean).join(", ")}</span>
        </button>
      ))}
    </FullscreenModal>
  );
}
