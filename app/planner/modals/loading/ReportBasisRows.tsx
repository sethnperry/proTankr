"use client";
// app/planner/modals/loading/ReportBasisRows.tsx
//
// The load report's read-only basis listing.

// Load Report's own read-only basis listing -- same fields TunePanel shows
// (dot/code/temp/API/lbs-gal), grouped per product from the load's own real
// entered values, but plain text: no card, no border, no tap target. "The
// load basis comes out of the card... no longer tunable," per explicit
// direction.
export function ReportBasisRows({
  rows,
  productNameById,
  productHexCodeById,
}: {
  rows: { productId: string; api: number | null; tempF: number | null; lbsPerGal: number | null }[];
  productNameById: Map<string, string>;
  productHexCodeById?: Record<string, string>;
}) {
  if (!rows.length) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{ fontWeight: 800, fontSize: 12, letterSpacing: 0.2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" as const }}
      >
        Load basis
      </div>
      {rows.map((r) => {
        const dotColor = (productHexCodeById?.[r.productId] && String(productHexCodeById[r.productId]).trim()) || "rgba(255,255,255,0.5)";
        const label = productNameById.get(r.productId) ?? r.productId;
        return (
          <div key={r.productId} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "3px 2px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                flex: "1 1 auto",
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap" as const,
              }}
            >
              {label}
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}>
              {r.tempF != null ? `${r.tempF.toFixed(1)}°F` : "—"} · {r.api != null ? `${r.api.toFixed(1)} API` : "—"} ·{" "}
              {r.lbsPerGal != null ? `${r.lbsPerGal.toFixed(2)} lb/gal` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
