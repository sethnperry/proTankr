"use client";
// app/planner/components/shift/PaperLogSheet.tsx
//
// "Paper log": the driver is keeping the day on paper. Why (reason chips from company settings), then photos of
// the pages through the shared capture sheet. The caller writes the shift event from what comes back.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { ReasonChips, type ReasonPick } from "../reasons/ReasonChips";
import { CaptureSheet } from "../capture/CaptureSheet";
import { paperLogProblem } from "@/lib/shifts/paperLog";
import type { CaptureResult } from "../../hooks/useCapture";

export function PaperLogSheet({ open, onClose, reasons, companyId, userId, onDone }: {
  open: boolean;
  onClose: () => void;
  reasons: { reason_id: string; label: string; category: string | null }[];
  companyId: string | null;
  userId: string | null;
  onDone: (pick: ReasonPick, capture: CaptureResult) => void;
}) {
  const [pick, setPick] = useState<ReasonPick | null>(null);
  const [photos, setPhotos] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setPick(null); setPhotos(false); setErr(null); } }, [open]);

  return (
    <>
      <FullscreenModal open={open && !photos} title="Paper log" onClose={onClose} footer={null}>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginBottom: 14 }}>Why are you on paper?</div>
        <ReasonChips reasons={reasons} value={pick} onPick={(p) => { setPick(p); setErr(null); }} />
        {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
        <button type="button" onClick={() => { const e = paperLogProblem(pick); if (e) setErr(e); else setPhotos(true); }}
          style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
          Next: photos of the pages
        </button>
      </FullscreenModal>
      <CaptureSheet open={open && photos} purpose="paper_log" title="Paper log pages" companyId={companyId} userId={userId} refType="shift_event"
        onDone={(r) => { if (pick) onDone(pick, r); }} onClose={() => setPhotos(false)} />
    </>
  );
}
