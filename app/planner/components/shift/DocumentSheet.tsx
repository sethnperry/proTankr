"use client";
// app/planner/components/shift/DocumentSheet.tsx
//
// "Submit a document": pick the kind from a dropdown (Other asks what it is), then photograph it through the
// shared capture sheet. The caller writes the shift event from what comes back.

import React, { useEffect, useState } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { CustomSelect } from "@/lib/ui/CustomSelect";
import { CaptureSheet } from "../capture/CaptureSheet";
import { DOCUMENT_TYPES, documentProblem, type DocumentType } from "@/lib/documents/documents";
import { bolRef } from "@/lib/trips/bols";
import type { CaptureResult } from "../../hooks/useCapture";

export type BolTripOption = { tripId: string; label: string; bols: string[] };

export function DocumentSheet({ open, onClose, companyId, userId, onDone, bolTrips = [] }: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  userId: string | null;
  onDone: (type: DocumentType, note: string, capture: CaptureResult) => void;
  /** The driver's recent trips and their BOL numbers: a BOL scanned here is filed against the one picked. */
  bolTrips?: BolTripOption[];
}) {
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState(false);
  const [pickLoad, setPickLoad] = useState(false);
  const [target, setTarget] = useState<{ tripId: string; bol: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setType(""); setNote(""); setPhotos(false); setErr(null); setPickLoad(false); setTarget(null); } }, [open]);

  return (
    <>
      <FullscreenModal open={open && !photos && !pickLoad} title="Submit a document" onClose={onClose} footer={null}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>What kind of document?</div>
        <CustomSelect value={type} onChange={(v) => { setType(v); setErr(null); }} options={[{ value: "", label: "Choose…" }, ...DOCUMENT_TYPES.map((t) => ({ value: t.value, label: t.label }))]} />
        {type === "other" && (
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is it?"
            style={{ width: "100%", boxSizing: "border-box", marginTop: 10, padding: "12px", fontSize: 16, color: "#fff", background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 0 }} />
        )}
        {err && <div style={{ color: "#f87171", fontSize: 14, marginTop: 10 }}>{err}</div>}
        <button type="button" onClick={() => { const e = documentProblem(type, note); if (e) setErr(e); else if (type === "bol" && bolTrips.some((t) => t.bols.length)) setPickLoad(true); else setPhotos(true); }}
          style={{ width: "100%", marginTop: 18, padding: "16px 0", fontSize: 16, fontWeight: 900, letterSpacing: "0.04em", textTransform: "uppercase", border: "none", background: "#fff", color: "#000", cursor: "pointer" }}>
          {type === "bol" && bolTrips.some((t) => t.bols.length) ? "Next: which load" : "Next: photos"}
        </button>
      </FullscreenModal>
      <FullscreenModal open={open && pickLoad && !photos} title="Which load?" onClose={() => setPickLoad(false)} footer={null}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginBottom: 12 }}>Pick the BOL number this paper is for. The scan is filed with that load.</div>
        {bolTrips.filter((t) => t.bols.length).map((t) => (
          <div key={t.tripId} style={{ border: "1px solid rgba(255,255,255,0.14)", background: "#0f0f10", padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 800 }}>{t.label}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              {t.bols.map((b) => (
                <button key={b} type="button" onClick={() => { setTarget({ tripId: t.tripId, bol: b }); setPhotos(true); setPickLoad(false); }}
                  style={{ padding: "11px 14px", fontSize: 14, fontWeight: 800, border: "1px solid rgba(255,255,255,0.3)", background: "transparent", color: "#fff", cursor: "pointer" }}>BOL {b}</button>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => { setTarget(null); setPickLoad(false); setPhotos(true); }}
          style={{ width: "100%", padding: "13px 0", fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", border: "1px solid rgba(255,255,255,0.25)", background: "transparent", color: "#fff", cursor: "pointer" }}>It's not on one of these</button>
      </FullscreenModal>
      <CaptureSheet open={open && photos} purpose={type === "bol" ? "bol" : "document"} title={target ? `BOL ${target.bol}` : "Document photos"} companyId={companyId} userId={userId}
        refType={target ? bolRef(target.bol) : "shift_event"} refId={target?.tripId ?? null}
        onDone={(r) => onDone(type as DocumentType, target ? `${note ? note + " · " : ""}BOL ${target.bol}` : note, r)} onClose={() => setPhotos(false)} />
    </>
  );
}
