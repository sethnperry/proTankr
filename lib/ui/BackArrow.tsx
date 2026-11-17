"use client";
// lib/ui/BackArrow.tsx
//
// The small back arrow in the top left of a window's header. Leaves the window one step back; windows that stamped a
// time ask first whether to keep or undo it (see StampQuestion).

export function BackArrow({ onClick, label = "Back" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="rounded-[2px] px-3 py-2 hover:bg-white/10" style={{ display: "inline-flex", alignItems: "center", background: "none", border: "none", color: "#fff", cursor: "pointer" }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
    </button>
  );
}
