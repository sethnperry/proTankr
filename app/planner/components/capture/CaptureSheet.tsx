"use client";
// app/planner/components/capture/CaptureSheet.tsx
//
// One capture sheet for every form that takes photos: fuel receipt, scale ticket, tank ticket, document drop,
// down time. Wires the view (CaptureSheetView) to the upload hook. The optional `read` step is how OCR plugs
// in: hand it a function that takes the uploaded paths and returns fields; nothing here depends on a reader.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useCapture, type CaptureResult } from "../../hooks/useCapture";
import { CAPTURE_BUCKET, type CapturePurpose, type OcrFields } from "@/lib/capture/capture";
import { CaptureSheetView } from "./CaptureSheetView";

export function CaptureSheet({ open, purpose, title, companyId, userId, refType, refId, read, onDone, onClose, children }: {
  open: boolean;
  purpose: CapturePurpose;
  title?: string;
  companyId: string | null;
  userId: string | null;
  refType?: string | null;
  refId?: string | null;
  /** The optional reader (OCR). Omit it and "Read it" is not shown. */
  read?: (paths: string[]) => Promise<OcrFields | null>;
  onDone: (r: CaptureResult) => void;
  onClose: () => void;
  /** The form's own fields (or what the reader found), shown under the photos. */
  children?: (ocr: OcrFields | null) => React.ReactNode;
}) {
  const cap = useCapture({ companyId, userId, purpose, refType, refId });
  const [ocr, setOcr] = useState<OcrFields | null>(null);
  const [reading, setReading] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  // Previews for photos that are up.
  useEffect(() => {
    let off = false;
    for (const p of cap.photos) {
      if (p.state !== "done" || urls[p.id]) continue;
      void supabase.storage.from(CAPTURE_BUCKET).createSignedUrl(p.path, 3600).then(({ data }) => { if (!off && data?.signedUrl) setUrls((m) => ({ ...m, [p.id]: data.signedUrl })); });
    }
    return () => { off = true; };
  }, [cap.photos, urls]);

  return (
    <CaptureSheetView
      open={open} purpose={purpose} title={title} photos={cap.photos} urlFor={(p) => urls[p.id] ?? null}
      saving={cap.saving} error={cap.error} canRead={!!read} reading={reading}
      onAdd={cap.add} onRetry={cap.retry} onRemove={cap.remove} onClose={onClose}
      onRead={async () => {
        if (!read) return;
        setReading(true);
        try { setOcr(await read(cap.photos.map((p) => p.path))); } finally { setReading(false); }
      }}
      onSave={async () => { const r = await cap.save(ocr); if (r) onDone(r); }}
    >
      {children?.(ocr)}
    </CaptureSheetView>
  );
}
