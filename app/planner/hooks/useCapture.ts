"use client";
// app/planner/hooks/useCapture.ts
//
// The data side of the capture sheet: each photo starts uploading to the form-captures bucket the moment it
// is taken (so Save is quick and a slow signal doesn't hold the driver at the rack), can be retried, and Save
// writes one form_captures row listing the files. The rules are in lib/capture/capture.ts.

import { useCallback, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { CAPTURE_BUCKET, canAddPhoto, capturePath, saveBlock, setPhotoState, type CapturePhoto, type CapturePurpose, type OcrFields } from "@/lib/capture/capture";

export type CaptureResult = { captureId: string; paths: string[]; ocr: OcrFields | null };

export function useCapture(o: { companyId: string | null; userId: string | null; purpose: CapturePurpose; refType?: string | null; refId?: string | null }) {
  const [photos, setPhotos] = useState<CapturePhoto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const captureId = useRef<string>(crypto.randomUUID());
  const files = useRef(new Map<string, File>());

  const upload = useCallback(async (id: string, path: string, file: File) => {
    setPhotos((l) => setPhotoState(l, id, "uploading"));
    const up = await supabase.storage.from(CAPTURE_BUCKET).upload(path, file, { contentType: file.type || "image/jpeg", upsert: true });
    setPhotos((l) => (up.error ? setPhotoState(l, id, "failed", up.error.message) : setPhotoState(l, id, "done")));
  }, []);

  const add = useCallback((picked: File[]) => {
    if (!o.companyId || !o.userId) return;
    for (const f of picked) {
      const id = crypto.randomUUID();
      const path = capturePath({ companyId: o.companyId, userId: o.userId, captureId: captureId.current, photoId: id, name: f.name, mime: f.type });
      files.current.set(id, f);
      setPhotos((l) => (canAddPhoto(o.purpose, l) ? [...l, { id, name: f.name, state: "uploading", path }] : l));
      void upload(id, path, f);
    }
  }, [o.companyId, o.userId, o.purpose, upload]);

  const retry = useCallback((id: string) => {
    const f = files.current.get(id);
    const p = photos.find((x) => x.id === id);
    if (f && p) void upload(id, p.path, f);
  }, [photos, upload]);

  const remove = useCallback((id: string) => {
    const p = photos.find((x) => x.id === id);
    files.current.delete(id);
    setPhotos((l) => l.filter((x) => x.id !== id));
    if (p && p.state === "done") void supabase.storage.from(CAPTURE_BUCKET).remove([p.path]);
  }, [photos]);

  const save = useCallback(async (ocr: OcrFields | null): Promise<CaptureResult | null> => {
    const block = saveBlock(photos);
    if (block) { setError(block); return null; }
    if (!o.companyId || !o.userId) { setError("Not signed in."); return null; }
    setSaving(true); setError(null);
    const paths = photos.map((p) => p.path);
    const { error: e } = await supabase.from("form_captures").insert({
      capture_id: captureId.current, company_id: o.companyId, user_id: o.userId, purpose: o.purpose,
      ref_type: o.refType ?? null, ref_id: o.refId ?? null, file_paths: paths, ocr, source: "app", client_updated_at: new Date().toISOString(),
    });
    setSaving(false);
    if (e) { setError(e.message); return null; }
    return { captureId: captureId.current, paths, ocr };
  }, [photos, o.companyId, o.userId, o.purpose, o.refType, o.refId]);

  return { photos, add, retry, remove, save, saving, error, clearError: () => setError(null) };
}
