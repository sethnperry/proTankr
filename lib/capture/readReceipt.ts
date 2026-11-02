// lib/capture/readReceipt.ts
//
// Asks the server to read a receipt photo that is already in its bucket. Returns null when the reader isn't
// set up, can't take the photo, or couldn't read it: the driver just types the figures, as before.

import { supabase } from "@/lib/supabase/client";
import type { OcrFields } from "./capture";

export async function readReceiptPhoto(bucket: string, path: string): Promise<OcrFields | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const res = await fetch("/api/ocr/receipt", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ bucket, path }) });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.available ? ((j.fields as OcrFields | null) ?? null) : null;
  } catch { return null; }
}
