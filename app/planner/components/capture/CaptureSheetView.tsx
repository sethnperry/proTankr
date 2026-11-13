"use client";
// app/planner/components/capture/CaptureSheetView.tsx
//
// The capture sheet's face: camera first, several photos, thumbnails you can remove or retry, and an optional
// "Read it" step that fills fields from the photo. Presentational (no data imports), so it renders in a test.
// The camera button is the one the document sheet already uses.

import React from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";
import { PRIMARY_BTN, SECONDARY_BTN } from "@/lib/ui/look";
import { CameraButton } from "../equipment/AddDocumentSheet";
import { DocumentScanner } from "../scan/DocumentScanner";
import { CAPTURE_PURPOSES, canAddPhoto, saveBlock, type CapturePhoto, type CapturePurpose } from "@/lib/capture/capture";

const MUTED = "rgba(255,255,255,0.5)";

export function CaptureSheetView({ open, purpose, title, photos, urlFor, saving, error, canRead, reading, onAdd, onRetry, onRemove, onRead, onSave, onClose, children }: {
  open: boolean;
  purpose: CapturePurpose;
  title?: string;
  photos: CapturePhoto[];
  /** A preview address for a photo that is up, or null. */
  urlFor?: (p: CapturePhoto) => string | null;
  saving?: boolean;
  error?: string | null;
  /** Show "Read it" (the optional reader). */
  canRead?: boolean;
  reading?: boolean;
  onAdd: (files: File[]) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onRead?: () => void;
  onSave: () => void;
  onClose: () => void;
  /** Fields the reader filled, or the form's own fields, shown under the photos. */
  children?: React.ReactNode;
}) {
  const label = title ?? CAPTURE_PURPOSES[purpose].label;
  const block = saveBlock(photos);
  const room = canAddPhoto(purpose, photos);
  const scan = !!CAPTURE_PURPOSES[purpose].scan;
  const [scanning, setScanning] = React.useState(false);
  return (
    <FullscreenModal open={open} title={label} onClose={onClose} footer={null}>
      {scan && <DocumentScanner open={scanning} title={`Scan ${label}`} onClose={() => setScanning(false)} onDone={(f) => { setScanning(false); onAdd([f]); }} />}
      {photos.length === 0 ? (
        scan ? (
          <>
            <button type="button" onClick={() => setScanning(true)} style={{ ...PRIMARY_BTN, display: "block", width: "100%", textAlign: "center", padding: "46px 0", fontSize: 18, fontWeight: 800, cursor: "pointer" }}>Scan the {label}</button>
            <div style={{ fontSize: 12, color: MUTED, textAlign: "center", margin: "8px 0" }}>Finds the page, flattens it and evens out shadows. Use the light in dim places.</div>
            <CameraButton multiple onFile={onAdd} style={{ ...SECONDARY_BTN, display: "block", textAlign: "center", padding: "12px 0", fontSize: 13, fontWeight: 800 }}>Take a plain photo instead</CameraButton>
          </>
        ) : (
          <CameraButton multiple onFile={onAdd} style={{ ...PRIMARY_BTN, display: "block", textAlign: "center", padding: "46px 0", fontSize: 18, fontWeight: 800 }}>
            Take a photo
          </CameraButton>
        )
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {photos.map((p) => {
              const url = urlFor?.(p) ?? null;
              return (
                <div key={p.id} style={{ position: "relative", aspectRatio: "3 / 4", background: "#0f0f10", border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden" }}>
                  {url && /* eslint-disable-next-line @next/next/no-img-element */ <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "4px 6px", background: "rgba(0,0,0,0.7)", fontSize: 11, fontWeight: 700, color: p.state === "failed" ? "#f87171" : p.state === "done" ? "#4ade80" : MUTED }}>
                    {p.state === "uploading" ? "Uploading…" : p.state === "done" ? "Saved" : "Failed"}
                  </div>
                  <button type="button" aria-label="Remove photo" onClick={() => onRemove(p.id)}
                    style={{ position: "absolute", top: 4, right: 4, width: 26, height: 26, border: "none", background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 15, cursor: "pointer" }}>×</button>
                  {p.state === "failed" && (
                    <button type="button" onClick={() => onRetry(p.id)}
                      style={{ position: "absolute", top: "40%", left: "15%", right: "15%", padding: "6px 0", border: "1px solid #f87171", background: "rgba(0,0,0,0.8)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Retry</button>
                  )}
                </div>
              );
            })}
          </div>
          {room && scan && (
            <button type="button" onClick={() => setScanning(true)} style={{ ...SECONDARY_BTN, display: "block", width: "100%", textAlign: "center", padding: "13px 0", marginTop: 10, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>+ Scan another page</button>
          )}
          {room && !scan && (
            <CameraButton multiple onFile={onAdd} style={{ ...SECONDARY_BTN, display: "block", textAlign: "center", padding: "13px 0", marginTop: 10, fontSize: 14, fontWeight: 800 }}>
              + Add another photo
            </CameraButton>
          )}
        </>
      )}
      {canRead && photos.length > 0 && (
        <button type="button" onClick={onRead} disabled={reading || photos.some((p) => p.state !== "done")}
          style={{ ...SECONDARY_BTN, width: "100%", marginTop: 10, padding: "13px 0", fontSize: 14, fontWeight: 800, opacity: reading ? 0.6 : 1 }}>
          {reading ? "Reading…" : "Read it (optional)"}
        </button>
      )}
      {children && <div style={{ marginTop: 12 }}>{children}</div>}
      {error && <div style={{ marginTop: 10, color: "#f87171", fontSize: 14 }}>{error}</div>}
      <button type="button" onClick={onSave} disabled={saving || !!block}
        style={{ ...PRIMARY_BTN, width: "100%", marginTop: 14, padding: "15px 0", fontSize: 15, opacity: saving || block ? 0.5 : 1 }}>
        {saving ? "Saving…" : "Save"}
      </button>
      {block && photos.length > 0 && <div style={{ marginTop: 6, textAlign: "center", fontSize: 12, color: MUTED }}>{block}</div>}
    </FullscreenModal>
  );
}
