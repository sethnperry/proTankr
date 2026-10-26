"use client";
// app/planner/modals/binder/DocThumb.tsx
//
// Part of the Binder (equipment file) dialog.

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { type AttachmentRecord } from "@/lib/ui/driver/DocHub";

export function DocThumb({ pages, onOpen }: { pages: AttachmentRecord[]; onOpen: () => void }) {
  const first = pages[0] ?? null;
  const [url, setUrl] = useState<string | null>(null);
  const isImage = !!first?.mime_type?.startsWith("image/");
  useEffect(() => {
    setUrl(null);
    if (!first || !isImage) return;
    let alive = true;
    void supabase.storage
      .from("equipment-docs")
      .createSignedUrl(first.file_path, 3600)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [first?.file_path, isImage]); // eslint-disable-line react-hooks/exhaustive-deps
  const box: React.CSSProperties = {
    position: "relative",
    width: 44,
    height: 56,
    flexShrink: 0,
    borderRadius: 2,
    overflow: "hidden",
    cursor: first ? "pointer" : "default",
    padding: 0,
  };
  if (!first) {
    return (
      <div
        aria-hidden
        style={{
          ...box,
          border: "1px dashed rgba(255,255,255,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 800,
          color: "rgba(255,255,255,0.3)",
          textAlign: "center",
          lineHeight: 1.2,
        }}
      >
        NO
        <br />
        DOC
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      aria-label="View document"
      style={{ ...box, border: "1px solid rgba(255,255,255,0.3)", background: "#1a1a1a" }}
    >
      {isImage && url ? (
        <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            fontSize: 10,
            fontWeight: 900,
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {isImage ? "…" : "PDF"}
        </span>
      )}
      {pages.length > 1 && (
        <span
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.8)",
            color: "#fff",
            fontSize: 10,
            fontWeight: 900,
            padding: "1px 5px",
          }}
        >
          {pages.length}
        </span>
      )}
    </button>
  );
}

// ─── Single permit row (collapsed + expanded edit/doc/delete) ───────────────
