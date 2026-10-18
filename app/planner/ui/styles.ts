import type React from "react";

export const styles = {
  page: {
    padding: 16,
    maxWidth: 1100,
    margin: "0 auto",
    boxSizing: "border-box",
    width: "100%",
  } as React.CSSProperties,

  section: {
    marginTop: 18,
    padding: 14,
    border: "1px solid #333",
    borderRadius: 2,
    background: "#0b0b0b",
  } as React.CSSProperties,

  row: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "end",
  } as React.CSSProperties,

  label: {
    display: "block",
    marginBottom: 6,
    opacity: 0.9,
  } as React.CSSProperties,

  input: {
    padding: 10,
    borderRadius: 2,
    border: "1px solid #444",
    background: "#111",
    color: "#fff",
    outline: "none",
  } as React.CSSProperties,

  select: {
    padding: 10,
    borderRadius: 2,
    border: "1px solid #444",
    background: "#111",
    color: "#fff",
    outline: "none",
  } as React.CSSProperties,

  help: {
    marginTop: 8,
    opacity: 0.85,
    fontSize: 14,
  } as React.CSSProperties,

  error: {
    color: "#ff6b6b",
    marginTop: 8,
    fontSize: 14,
  } as React.CSSProperties,

  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 10,
  } as React.CSSProperties,

  th: {
    textAlign: "left",
    padding: 10,
    borderBottom: "1px solid #333",
    fontSize: 14,
    opacity: 0.9,
  } as React.CSSProperties,

  td: {
    padding: 10,
    borderBottom: "1px solid #222",
    fontSize: 14,
  } as React.CSSProperties,

  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 2,
    border: "1px solid #444",
    background: "#111",
    fontSize: 12,
    opacity: 0.9,
  } as React.CSSProperties,

  smallBtn: {
    padding: "10px 12px",
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  // The next step in a workflow window: white, black text (lib/ui/look.ts).
  doneBtn: {
    padding: "14px 14px",
    borderRadius: 2,
    border: "none",
    background: "#fff",
    color: "#000",
    cursor: "pointer",
    fontSize: 15,
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  } as React.CSSProperties,

  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    cursor: "pointer",
    fontSize: 13,
    lineHeight: 1.1,
    whiteSpace: "nowrap",
  } as React.CSSProperties,

  tileGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 12,
  } as React.CSSProperties,

  tile: {
    padding: 14,
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    cursor: "pointer",
    userSelect: "none",
  } as React.CSSProperties,

  tileTitle: {
    fontWeight: 900,
    letterSpacing: 0.2,
  } as React.CSSProperties,

  tileSub: {
    marginTop: 6,
    opacity: 0.7,
    fontSize: 13,
    lineHeight: 1.25,
  } as React.CSSProperties,

  toolbar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    flexWrap: "wrap",
  } as React.CSSProperties,

  sliderWrap: {
    width: "100%",
  } as React.CSSProperties,

  sliderLabelRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 8,
  } as React.CSSProperties,

  sliderValue: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    opacity: 0.85,
    fontSize: 13,
  } as React.CSSProperties,

  // Dial
  dialWrap: {
    display: "grid",
    placeItems: "center",
    padding: 10,
  } as React.CSSProperties,

  dialLabel: {
    textAlign: "center",
    fontWeight: 900,
    letterSpacing: 0.2,
    userSelect: "none",
  } as React.CSSProperties,

  dialSub: {
    marginTop: 6,
    opacity: 0.7,
    fontSize: 13,
    textAlign: "center",
  } as React.CSSProperties,

  // Generic card surface used in modals
  card: {
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.05)",
    padding: 12,
  } as React.CSSProperties,

  // terminal “carded date” button style
  cardedBtn: {
    padding: "10px 12px",
    borderRadius: 2,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.55)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 800,
    letterSpacing: 0.2,
  } as React.CSSProperties,
} as const;
