"use client";
// app/planner/components/wallet/walletPhoto.tsx
//
// The optional photo on a badge or credential card: show it, and capture/upload one. Files live in the
// equipment-docs bucket under {company_id}/wallet/{user_id}/.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

const BUCKET = "equipment-docs";

export function useSignedUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let off = false;
    setUrl(null);
    if (!path) return;
    void supabase.storage.from(BUCKET).createSignedUrl(path, 3600).then(({ data }) => { if (!off) setUrl(data?.signedUrl ?? null); });
    return () => { off = true; };
  }, [path]);
  return url;
}

export async function uploadWalletPhoto(file: File, companyId: string, userId: string): Promise<string> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${companyId}/wallet/${userId}/${crypto.randomUUID()}.${ext}`;
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (up.error) throw up.error;
  return path;
}

/** Take or choose a photo. Shows "Replace photo" once there is one. */
export function PhotoButton({ hasPhoto, busy, onFile, onRemove }: { hasPhoto: boolean; busy?: boolean; onFile: (f: File) => void; onRemove?: () => void }) {
  const btn: React.CSSProperties = { flex: 1, padding: "10px 0", borderRadius: 2, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: busy ? "default" : "pointer", textAlign: "center", opacity: busy ? 0.5 : 1 };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <label style={btn}>
        {busy ? "Uploading…" : hasPhoto ? "Replace photo" : "Take photo (optional)"}
        <input type="file" accept="image/*" capture="environment" disabled={busy} style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
      </label>
      {hasPhoto && onRemove && <button type="button" onClick={onRemove} style={{ ...btn, flex: "0 0 auto", padding: "10px 14px" }}>Remove</button>}
    </div>
  );
}
