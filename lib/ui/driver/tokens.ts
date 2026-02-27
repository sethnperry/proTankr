// lib/ui/driver/tokens.ts
// Design tokens, CSS helpers, and utility functions shared across driver components

export const T = {
  bg:       "#0a0a0a",
  surface:  "#111",
  surface2: "#181818",
  surface3: "#1e1e1e",
  border:   "#2a2a2a",
  text:     "rgba(255,255,255,0.92)",
  muted:    "rgba(255,255,255,0.45)",
  accent:   "#f5a623",
  danger:   "#e05555",
  success:  "#4caf82",
  warning:  "#f5c623",
  info:     "#5ba8f5",
  radius:   12,
  radiusSm: 8,
} as const;

export const css = {
  page: {
    minHeight: "100vh",
    background: T.bg,
    color: T.text,
    fontFamily: "'Inter', system-ui, sans-serif",
    padding: "24px 16px 64px",
    maxWidth: 900,
    margin: "0 auto",
    boxSizing: "border-box" as const,
  },
  heading: {
    fontSize: "clamp(20px, 4vw, 28px)",
    fontWeight: 800,
    letterSpacing: -0.5,
    margin: 0,
  },
  subheading: {
    fontSize: 13,
    color: T.muted,
    marginTop: 4,
    marginBottom: 0,
  },
  card: {
    background: T.surface,
    border: `1px solid ${T.border}`,
    borderRadius: T.radius,
    padding: "14px 16px",
    marginBottom: 8,
  },
  sectionHead: {
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 12,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase" as const,
    color: T.muted,
    margin: 0,
  },
  btn: (variant: "primary" | "ghost" | "danger" | "subtle" | "icon") => ({
    padding: variant === "subtle" || variant === "icon" ? "5px 10px" : "8px 16px",
    borderRadius: T.radiusSm,
    border: variant === "ghost" ? `1px solid ${T.border}` : "none",
    background:
      variant === "primary" ? T.accent :
      variant === "danger"  ? T.danger :
      variant === "subtle" || variant === "icon" ? "rgba(255,255,255,0.06)" :
      "transparent",
    color: variant === "primary" ? "#000" : variant === "danger" ? "#fff" : T.text,
    fontWeight: variant === "primary" ? 700 : 500,
    fontSize: variant === "subtle" || variant === "icon" ? 12 : 13,
    cursor: "pointer",
    whiteSpace: "nowrap" as const,
    letterSpacing: variant === "primary" ? 0.3 : 0,
    lineHeight: 1,
  }),
  input: {
    padding: "9px 12px",
    borderRadius: T.radiusSm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    fontSize: 13,
    outline: "none",
    width: "100%",
    boxSizing: "border-box" as const,
  },
  select: {
    padding: "9px 12px",
    borderRadius: T.radiusSm,
    border: `1px solid ${T.border}`,
    background: T.surface2,
    color: T.text,
    fontSize: 13,
    outline: "none",
  },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: 0.8,
    textTransform: "uppercase" as const,
    color: T.muted,
    display: "block" as const,
    marginBottom: 5,
  },
  tag: (color: string) => ({
    display: "inline-block" as const,
    padding: "2px 8px",
    borderRadius: 20,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.4,
    background: `${color}22`,
    color,
    border: `1px solid ${color}44`,
    whiteSpace: "nowrap" as const,
  }),
  divider: {
    border: "none",
    borderTop: `1px solid ${T.border}`,
    margin: "10px 0",
  },
};

export function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return d; }
}

export function expiryColor(days: number | null): string {
  if (days == null) return T.muted;
  if (days < 0)    return T.danger;
  if (days < 30)   return T.warning;
  if (days < 90)   return T.accent;
  return T.success;
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  try {
    const exp = new Date(dateStr + "T00:00:00");
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.floor((exp.getTime() - now.getTime()) / 86400000);
  } catch { return null; }
}

export function expiryLabel(days: number | null): string {
  if (days == null) return "—";
  if (days < 0)    return `Expired ${Math.abs(days)}d ago`;
  if (days === 0)  return "Expires today";
  return `${days}d left`;
}
