"use client";

import React, { useMemo, useEffect } from "react";
import { FullscreenModal } from "@/lib/ui/FullscreenModal";

type PlanRowLike = {
  comp_number: number;
  planned_gallons?: number | null;
  productId?: string | null;
};

export type ProductInputs = Record<
  string,
  {
    api?: string; // keep string for partial typing
    tempF?: number;
  }
>;

type LastProductInfo = {
  last_api?: number | null;
  last_api_updated_at?: string | null; // timestamptz string from Supabase
};

function badgeFromName_(name: string): string {
  const s = String(name ?? "").trim();
  if (!s) return "—";

  // If the name ends with a 2–3 digit number (e.g. octane 87/93), use that.
  const m = s.match(/(\d{2,3})\s*$/);
  if (m?.[1]) return m[1];

  const parts = s.split(/\s+/g).filter(Boolean);
  const first = parts[0] ?? "";
  if (parts.length >= 2) return (first[0] + (parts[1]?.[0] ?? "")).toUpperCase();
  const alnum = first.replace(/[^a-zA-Z0-9]/g, "");
  return (alnum.slice(0, 2) || first.slice(0, 2)).toUpperCase();
}
function fmtUpdatedOnLine(args: { updatedAt?: string | null; timeZone?: string | null }): string | null {
  const ts = args.updatedAt;
  if (!ts) return null;

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;

  const tz = args.timeZone || "UTC";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const hh = get("hour");
  const mi = get("minute");

  if (mm && dd && hh && mi) return `Updated on ${mm}/${dd} at ${hh}:${mi} hrs`;
  return null;
}

function fmtLastApiLine_(args: {
  lastApi?: number | null;
  lastApiUpdatedAt?: string | null;
  timeZone?: string | null;
}): string | null {
  const api = args.lastApi;
  const ts = args.lastApiUpdatedAt;
  const tz = args.timeZone;

  if (api == null || !Number.isFinite(Number(api))) return null;

  // If we have an API but no timestamp, still show something.
  if (!ts) return `API was ${api}`;

  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return `API was ${api}`;

  // MM/DD @ HH:mm (24h) in terminal timezone (if provided)
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? undefined,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const hh = get("hour");
  const mi = get("minute");

  if (mm && dd && hh && mi) {
    return `API was ${api} on ${mm}/${dd} @ ${hh}:${mi} hrs`;
  }
  return `API was ${api}`;
}

export default function LoadingModal(props: {
  open: boolean;
  onClose: () => void;

  styles: any;

  planRows: PlanRowLike[];
  productNameById: Map<string, string>;

  // Optional: product styling overrides from catalog
  productButtonCodeById?: Record<string, string>;
  productHexCodeById?: Record<string, string>;

  productInputs: ProductInputs;
  setProductApi: (productId: string, api: string) => void;

  onOpenTempDial: (productId: string) => void;
  onLoaded: () => void;

  loadedDisabled?: boolean;
  loadedLabel?: string;

  // NEW: for “API was …” and terminal-local formatting
  lastProductInfoById?: Record<string, LastProductInfo>;
  terminalTimeZone?: string | null;

  // Optional: styled warning block (if you wire it from page.tsx)
  errorMessage?: string | null;
}) {
  const {
    open,
    onClose,
    styles,
    planRows,
    productNameById,
    productButtonCodeById,
    productHexCodeById,
    productInputs,
    setProductApi,
    onOpenTempDial,
    onLoaded,
    loadedDisabled,
    loadedLabel,
    lastProductInfoById,
    terminalTimeZone,
    errorMessage,
  } = props;

  const plannedLines = useMemo(() => {
    return (planRows ?? [])
      .filter((r) => r?.productId && Number(r?.planned_gallons ?? 0) > 0)
      .map((r) => ({
        comp: Number(r.comp_number),
        productId: String(r.productId),
        gallons: Number(r.planned_gallons ?? 0),
      }))
      .filter((x) => Number.isFinite(x.comp) && x.comp > 0 && Number.isFinite(x.gallons) && x.gallons > 0);
  }, [planRows]);

  const productGroups = useMemo(() => {
    const m = new Map<string, { productId: string; gallons: number }>();
    for (const line of plannedLines) {
      const prev = m.get(line.productId);
      if (!prev) m.set(line.productId, { productId: line.productId, gallons: line.gallons });
      else prev.gallons += line.gallons;
    }
    return Array.from(m.values()).sort((a, b) => {
      const an = productNameById.get(a.productId) ?? a.productId;
      const bn = productNameById.get(b.productId) ?? b.productId;
      return String(an).localeCompare(String(bn));
    });
  }, [plannedLines, productNameById]);

useEffect(() => {
  if (!open) return;

  for (const g of productGroups) {
    const pid = String(g.productId ?? "");
    if (!pid) continue;

    const last = lastProductInfoById?.[pid]?.last_api;
    const current = (productInputs?.[pid]?.api ?? "").toString().trim();

    // Only prefill if empty and we actually have a previous API
    if (!current && last != null && Number.isFinite(Number(last))) {
      setProductApi(pid, String(last));
    }
  }
}, [open, productGroups, lastProductInfoById, productInputs, setProductApi]);

  return (
    <FullscreenModal open={open} title="Loading" onClose={onClose} footer={null}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: "100%", boxSizing: "border-box" }}>
        {/* A) Compartments */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>Planned compartments</div>

          {plannedLines.length === 0 ? (
            <div style={styles.help}>No filled compartments in the plan.</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {plannedLines.map((x) => (
                <div
                  key={`${x.comp}-${x.productId}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 8,
                    alignItems: "baseline",
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(255,255,255,0.10)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  <div style={{ fontWeight: 800 }}>
                    Comp {x.comp} — {productNameById.get(x.productId) ?? x.productId}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.70)", fontWeight: 800 }}>{Math.round(x.gallons)} gal</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ghost line */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.10)", margin: "6px 0" }} />

        {/* B) Product groups */}
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 13, letterSpacing: 0.2, opacity: 0.7, textTransform: "uppercase" }}>API + Temperature</div>

          {errorMessage ? (
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,80,80,0.35)",
                background: "rgba(255,80,80,0.10)",
                padding: "10px 12px",
                color: "rgba(255,210,210,0.95)",
                fontWeight: 850,
                lineHeight: 1.25,
              }}
            >
              {errorMessage}
            </div>
          ) : null}

          {productGroups.length === 0 ? (
            <div style={styles.help}>No products to enter.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {productGroups.map((g) => {
                const name = productNameById.get(g.productId) ?? g.productId;
                const fromCatalog =
                  (productButtonCodeById?.[g.productId] && String(productButtonCodeById[g.productId]).trim()) || "";
                const fromName = badgeFromName_(name);

                // If catalog code is 2 letters (e.g. PU/RU) but name ends with a number (e.g. 87/93),
                // prefer the number so the badge matches what drivers expect on the button.
                const badgeText =
                  (fromCatalog &&
                    /^[A-Za-z]{2}$/.test(fromCatalog) &&
                    /^\d{2,3}$/.test(fromName)
                    ? fromName
                    : (fromCatalog || fromName));
                const badgeHex =
                  (productHexCodeById?.[g.productId] && String(productHexCodeById[g.productId]).trim()) || null;
                const apiVal = productInputs[g.productId]?.api ?? "";
                const tempVal = productInputs[g.productId]?.tempF;

                const lastInfo: LastProductInfo | undefined = lastProductInfoById?.[g.productId];

                return (
                  <div
                    key={g.productId}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.04)",
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {/* Top row: badge + name/info + gallons */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        style={{
                          width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                          display: "grid", placeItems: "center",
                          fontWeight: 900, fontSize: 14, letterSpacing: 0.5,
                          color: badgeHex ? badgeHex : "rgba(255,220,92,0.95)",
                          border: badgeHex ? `2px solid ${badgeHex}` : "2px solid rgba(255,220,92,0.75)",
                          background: "rgba(0,0,0,0.22)",
                        }}
                        aria-hidden
                      >
                        {badgeText}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {name}
                        </div>
                        <div style={{ marginTop: 2, color: "rgba(255,255,255,0.50)", fontSize: 11 }}>
                          {fmtUpdatedOnLine({ updatedAt: lastInfo?.last_api_updated_at, timeZone: terminalTimeZone ?? null }) ?? "No previous API recorded"}
                        </div>
                      </div>
                      <div style={{ color: "rgba(255,255,255,0.60)", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{Math.round(g.gallons)} gal</div>
                    </div>
                    {/* Bottom row: API input + temp button side by side */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={apiVal}
                        onChange={(e) => setProductApi(g.productId, e.target.value)}
                        inputMode="decimal"
                        placeholder="API gravity"
                        style={{
                          ...styles.input,
                          flex: 1,
                          height: 40,
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 15,
                          textAlign: "center",
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => onOpenTempDial(g.productId)}
                        style={{
                          ...styles.smallBtn,
                          width: 80,
                          height: 40,
                          borderRadius: 8,
                          fontWeight: 800,
                          fontSize: 14,
                          flexShrink: 0,
                        }}
                      >
                        {tempVal == null ? "60°F" : `${Math.round(tempVal)}°F`}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ display: "flex", width: "100%", marginTop: 6 }}>
            <button
              type="button"
              onClick={onLoaded}
              disabled={Boolean(loadedDisabled)}
              style={{
                ...(styles as any).doneBtn,
                opacity: loadedDisabled ? 0.55 : 1,
                width: "100%",
              }}
            >
              {loadedLabel ?? "LOADED"}
            </button>
          </div>
        </div>
      </div>
    </FullscreenModal>
  );
}
