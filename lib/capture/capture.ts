// lib/capture/capture.ts
//
// The capture sheet's rules, with no Supabase and no browser: what a capture is for, where its files go, and
// how a batch of photos moves from "taking" to "saved". Files live in the private form-captures bucket under
// {company_id}/{user_id}/{capture_id}/, which is what the bucket's access rules read.

export type CapturePurpose = "fuel_receipt" | "scale_ticket" | "tank_ticket" | "document" | "down_time" | "paper_log" | "inspection" | "manifest";

export const CAPTURE_PURPOSES: Record<CapturePurpose, { label: string; maxPhotos: number }> = {
  fuel_receipt: { label: "Fuel receipt", maxPhotos: 4 },
  scale_ticket: { label: "Scale ticket", maxPhotos: 4 },
  tank_ticket: { label: "Tank ticket", maxPhotos: 4 },
  document: { label: "Document", maxPhotos: 20 },
  down_time: { label: "Down time", maxPhotos: 6 },
  paper_log: { label: "Paper log", maxPhotos: 6 },
  inspection: { label: "Inspection", maxPhotos: 12 },
  manifest: { label: "Manifest", maxPhotos: 6 },
};

export const CAPTURE_BUCKET = "form-captures";

export function extensionFor(name: string, mime: string | null | undefined): string {
  const fromName = (name.split(".").pop() ?? "").toLowerCase();
  if (/^[a-z0-9]{2,5}$/.test(fromName) && fromName !== name.toLowerCase()) return fromName === "jpeg" ? "jpg" : fromName;
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/heic") return "heic";
  return "jpg";
}

export function capturePath(o: { companyId: string; userId: string; captureId: string; photoId: string; name: string; mime?: string | null }): string {
  return `${o.companyId}/${o.userId}/${o.captureId}/${o.photoId}.${extensionFor(o.name, o.mime)}`;
}

export type PhotoState = "uploading" | "done" | "failed";
export type CapturePhoto = { id: string; name: string; state: PhotoState; path: string; error?: string | null };

export function canAddPhoto(purpose: CapturePurpose, photos: CapturePhoto[]): boolean {
  return photos.length < CAPTURE_PURPOSES[purpose].maxPhotos;
}

/** What blocks Save: nothing taken, a photo still going up, or one that failed (retry or remove it). */
export function saveBlock(photos: CapturePhoto[]): string | null {
  if (photos.length === 0) return "Take at least one photo.";
  if (photos.some((p) => p.state === "uploading")) return "Still uploading.";
  if (photos.some((p) => p.state === "failed")) return "A photo didn't upload. Retry or remove it.";
  return null;
}

export function setPhotoState(photos: CapturePhoto[], id: string, state: PhotoState, error: string | null = null): CapturePhoto[] {
  return photos.map((p) => (p.id === id ? { ...p, state, error } : p));
}

/** What the optional reader found on a receipt or ticket. Every field is a suggestion the driver confirms. */
export type OcrFields = { station?: string | null; gallons?: number | null; amount?: number | null; date?: string | null; weightLbs?: number | null };
